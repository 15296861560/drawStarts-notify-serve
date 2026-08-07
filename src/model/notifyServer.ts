import WebSocket from 'ws'
import http from 'http'
import {
  SEND_TYPE,
  MSG_TYPE,
  METHOD_TYPE,
  NO_LOGIN_METHOD,
  DAY_DURATION,
  ERROR_CODE,
  DEFAULT_CONFIG,
  SYS_EVENT,
} from '../constant'
import {
  WSRequest,
  Notify,
  NotifyClient,
  ConnectInfo,
  ServerNotifyOptions,
} from '../interface'
import { ExternalInit, ExternalConfig } from '../interface/externalInterface'
import { StoredNotifyMessage } from '../interface/store'
import { External } from '../adapters/external'
import { createHttpAdminServer } from '../adapters/httpAdmin'
import { SessionManager } from '../core/sessionManager'
import { ChannelManager } from '../core/channelManager'
import { RateLimiter } from '../core/rateLimiter'
import { DeliveryService } from '../core/delivery'
import { Metrics } from '../core/metrics'
import { ProtocolError, toProtocolError } from '../protocol/errors'
import { buildFeedback, buildSysMsg } from '../protocol/feedback'
import { mapToObject, safeJsonParse, createLogger } from '../utils'

type RuntimeConfig = Required<ExternalConfig>

export class NotifyServer {
  private port: number
  private ext: External
  private wsServer: WebSocket.Server | null = null
  private httpServer: http.Server | null = null
  private sessions = new SessionManager()
  private channels = new ChannelManager()
  private delivery: DeliveryService
  private rateLimiter: RateLimiter
  private metrics = new Metrics()
  private config: RuntimeConfig
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private log = createLogger()

  constructor() {
    this.config = { ...DEFAULT_CONFIG } as RuntimeConfig
    this.port = this.config.port
    this.ext = new External()
    this.delivery = new DeliveryService(this.sessions, this.channels)
    this.rateLimiter = new RateLimiter(
      this.config.rateLimitWindowMs,
      this.config.rateLimitMax
    )
  }

  init(external?: ExternalInit) {
    if (external) {
      this.initExternal(external)
    }
    if (this.wsServer) {
      throw new Error('NotifyServer already initialized')
    }

    this.wsServer = new WebSocket.Server({
      port: this.port,
      maxPayload: this.config.maxPayload,
    })

    this.wsServer.on('listening', () => {
      this.log('info', `websocket listening on ${this.port}`)
    })

    this.subscribeServer()
    this.startHeartbeatWatcher()
    this.startHttpAdminIfNeeded()
  }

  initExternal(external: ExternalInit) {
    this.ext = new External(external)
    this.log = createLogger(external.logger)
    this.applyConfig(external.config)
    this.delivery.setMultiDevicePolicy(this.config.multiDevicePolicy)
  }

  /** 宿主主动推送（异步，需 await 以拿到投递结果） */
  async notify(options: ServerNotifyOptions) {
    return this.dispatchNotify({
      ...options,
      userId: options.userId || 'server',
      clientId: options.clientId || 'server',
      saveOffline: options.saveOffline !== false,
    })
  }

  kick(clientId: string, reason = 'kicked by admin') {
    const session = this.sessions.get(clientId)
    if (!session) {
      return false
    }
    this.safeSend(
      session.client,
      buildSysMsg(MSG_TYPE.single, SYS_EVENT.kicked, { reason, clientId })
    )
    try {
      session.client.close(1008, reason)
    } catch {
      // ignore
    }
    this.removeClient(clientId, false)
    return true
  }

  broadcastSys(event: string, data: any = {}) {
    const msg = buildSysMsg(MSG_TYPE.all, event, data)
    let count = 0
    this.sessions.forEach((c) => {
      if (this.safeSend(c.client, msg)) count += 1
    })
    return count
  }

  getStats() {
    this.metrics.connections = this.sessions.size
    this.metrics.channels = this.channels.size
    return {
      connections: this.sessions.size,
      channels: this.channels.size,
      port: this.port,
      httpPort: this.config.httpPort,
      enableOffline: this.config.enableOffline,
    }
  }

  getMetrics() {
    this.metrics.connections = this.sessions.size
    this.metrics.channels = this.channels.size
    return this.metrics.snapshot({ port: this.port, httpPort: this.config.httpPort })
  }

  async close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    try {
      this.broadcastSys(SYS_EVENT.serverShutdown, { message: 'server shutting down' })
    } catch {
      // ignore
    }
    const clients = Array.from(this.sessions.values())
    clients.forEach((c) => {
      try {
        c.client.terminate()
      } catch {
        // ignore
      }
      this.removeClient(c.clientId, false)
    })

    await new Promise<void>((resolve) => {
      if (!this.wsServer) {
        resolve()
        return
      }
      this.wsServer.close(() => resolve())
      // 防止 close 回调不触发
      setTimeout(() => resolve(), 1000)
    })
    this.wsServer = null

    await new Promise<void>((resolve) => {
      if (!this.httpServer) {
        resolve()
        return
      }
      this.httpServer.close(() => resolve())
      setTimeout(() => resolve(), 1000)
    })
    this.httpServer = null
  }

  private applyConfig(config?: ExternalConfig) {
    if (!config) return
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      allowedOrigins: config.allowedOrigins || DEFAULT_CONFIG.allowedOrigins,
    } as RuntimeConfig
    if (config.port) this.port = config.port
    this.rateLimiter.update(this.config.rateLimitWindowMs, this.config.rateLimitMax)
  }

  private startHttpAdminIfNeeded() {
    if (!this.config.httpPort || this.config.httpPort <= 0) {
      return
    }
    this.httpServer = createHttpAdminServer({
      getStats: () => this.getStats(),
      getMetrics: () => this.getMetrics(),
      notify: (body) => this.notify(body),
      kick: (clientId, reason) => this.kick(clientId, reason),
      broadcastSys: (event, data) => this.broadcastSys(event, data),
      adminToken: this.config.adminToken,
      logger: this.log,
      staticDir: this.config.staticDir || undefined,
    })
    this.httpServer.listen(this.config.httpPort, () => {
      this.log('info', `http admin listening on ${this.config.httpPort}`)
    })
  }

  private subscribeServer() {
    if (!this.wsServer) return

    this.wsServer.on('connection', (client: WebSocket, req) => {
      if (this.sessions.size >= this.config.maxConnections) {
        client.close(1013, 'max connections')
        return
      }

      const origin = String(req.headers.origin || '')
      if (!this.isOriginAllowed(origin)) {
        this.safeSend(
          client,
          buildFeedback(false, 'error', { msg: 'origin denied' }, '', ERROR_CODE.ORIGIN_DENIED, 'origin denied')
        )
        client.close(1008, 'origin denied')
        return
      }

      client.on('message', (raw) => {
        void this.onMessage(client, req, raw)
      })

      client.on('close', () => {
        const session = this.sessions.findBySocket(client)
        if (session) this.removeClient(session.clientId, false)
      })

      client.on('error', (err) => {
        this.log('error', 'client error', { error: String(err) })
      })
    })
  }

  private async onMessage(client: WebSocket, req: any, raw: WebSocket.RawData) {
    const size = Buffer.isBuffer(raw) ? raw.length : Buffer.byteLength(String(raw))
    if (size > this.config.maxPayload) {
      this.safeSend(
        client,
        buildFeedback(false, 'error', { msg: 'payload too large' }, '', ERROR_CODE.PAYLOAD_TOO_LARGE, 'payload too large')
      )
      return
    }

    const msgObj = safeJsonParse(String(raw))
    if (!msgObj) {
      this.safeSend(
        client,
        buildFeedback(false, 'error', { msg: 'invalid json' }, '', ERROR_CODE.INVALID_PARAM, 'invalid json')
      )
      return
    }

    const rateKey = msgObj.clientId || req.socket?.remoteAddress || 'unknown'
    if (!this.rateLimiter.check(rateKey)) {
      this.safeSend(
        client,
        buildFeedback(false, 'error', { msg: 'rate limited' }, msgObj.requestId || '', ERROR_CODE.RATE_LIMITED, 'rate limited')
      )
      return
    }

    try {
      if (msgObj.method === METHOD_TYPE.login) {
        await this.login(msgObj, client, req)
        return
      }
      if (msgObj.type === SEND_TYPE.request) {
        await this.handleRequest(msgObj, client)
        return
      }
      if (msgObj.type === SEND_TYPE.notify) {
        await this.handleNotify(msgObj as Notify, client)
        return
      }
    } catch (e) {
      const err = toProtocolError(e)
      this.safeSend(
        client,
        buildFeedback(false, 'error', { msg: err.message, code: err.code }, msgObj.requestId || '', err.code, err.message)
      )
    }
  }

  private async handleRequest(data: WSRequest, client: WebSocket) {
    const method = data.method || ''
    try {
      if (!NO_LOGIN_METHOD.includes(method)) {
        this.verifySession(data.clientId)
      } else if (method === METHOD_TYPE.heartbeat && data.clientId) {
        this.sessions.touch(data.clientId)
      }

      switch (method) {
        case METHOD_TYPE.heartbeat:
          this.safeSend(
            client,
            buildFeedback(true, METHOD_TYPE.heartbeat, { ts: Date.now() }, data.requestId || '', ERROR_CODE.OK, 'ok')
          )
          break
        case METHOD_TYPE.joinChannel:
          this.joinChannel(data)
          break
        case METHOD_TYPE.leaveChannel:
          this.leaveChannel(data)
          break
        case METHOD_TYPE.getAttributes:
          this.getAttributes(data)
          break
        case METHOD_TYPE.getChannelAttribute:
          this.getChannelAttribute(data)
          break
        case METHOD_TYPE.logout:
          this.logoutWithFeedback(data)
          break
        case METHOD_TYPE.ack:
          await this.handleAck(data, client)
          break
        case METHOD_TYPE.pullHistory:
          await this.handlePullHistory(data, client)
          break
        case METHOD_TYPE.pullOffline:
          await this.handlePullOffline(data, client)
          break
        default:
          throw new ProtocolError(ERROR_CODE.INVALID_PARAM, `unknown method: ${method}`)
      }
    } catch (e) {
      const err = toProtocolError(e)
      if (err.code === ERROR_CODE.TOKEN_EXPIRE && data.clientId) {
        this.sendSysToClient(data.clientId, SYS_EVENT.tokenExpire, { message: err.message })
      }
      this.safeSend(
        client,
        buildFeedback(false, method || 'error', { msg: err.message, code: err.code }, data.requestId || '', err.code, err.message)
      )
    }
  }

  private async handleNotify(data: Notify, client: WebSocket) {
    try {
      const session = this.verifySession(data.clientId)
      if (!data.notifyType || data.notifyMsg === undefined) {
        throw new ProtocolError(ERROR_CODE.INVALID_PARAM, 'notifyType/notifyMsg required')
      }

      const msgType = data.msgType || MSG_TYPE.channel
      if (msgType === MSG_TYPE.channel && !data.channelName) {
        throw new ProtocolError(ERROR_CODE.INVALID_PARAM, 'channelName required')
      }
      if (msgType === MSG_TYPE.channel && !session.channelMap.has(data.channelName)) {
        throw new ProtocolError(ERROR_CODE.NO_PERMISSION, 'not joined channel')
      }
      if (msgType === MSG_TYPE.single && !data.targetUserId && !data.targetClientId) {
        throw new ProtocolError(ERROR_CODE.INVALID_PARAM, 'targetUserId or targetClientId required')
      }

      const result = await this.dispatchNotify({
        notifyType: data.notifyType,
        notifyMsg: data.notifyMsg,
        channelName: data.channelName,
        msgType,
        targetUserId: data.targetUserId,
        targetClientId: data.targetClientId,
        userId: session.userId,
        clientId: session.clientId,
        needAck: data.needAck ?? this.config.requireAck,
        excludeSender: data.excludeSender,
        saveOffline: true,
      })

      if (data.requestId) {
        this.safeSend(
          client,
          buildFeedback(true, SEND_TYPE.notify, result, data.requestId, ERROR_CODE.OK, 'ok')
        )
      }
    } catch (e) {
      this.metrics.notifyFailed += 1
      const err = toProtocolError(e)
      this.safeSend(
        client,
        buildFeedback(
          false,
          SEND_TYPE.notify,
          { msg: err.message, code: err.code },
          data.requestId || '',
          err.code,
          err.message
        )
      )
    }
  }

  private async dispatchNotify(options: ServerNotifyOptions & { saveOffline?: boolean }) {
    const msgType = options.msgType || (options.channelName ? MSG_TYPE.channel : MSG_TYPE.single)
    if (msgType === MSG_TYPE.channel && !options.channelName) {
      throw new ProtocolError(ERROR_CODE.INVALID_PARAM, 'channelName required for channel notify')
    }

    this.metrics.notifySent += 1
    const result = this.delivery.deliver({
      ...options,
      msgType,
      needAck: options.needAck ?? this.config.requireAck,
    })
    this.metrics.notifyDelivered += result.delivered

    const stored: StoredNotifyMessage = {
      messageId: result.messageId,
      notifyType: options.notifyType,
      notifyMsg: options.notifyMsg,
      channelName: options.channelName,
      msgType,
      sendUserId: options.userId || 'server',
      sendClientId: options.clientId,
      targetUserId: options.targetUserId,
      targetClientId: options.targetClientId,
      createdAt: Date.now(),
      ackedUserIds: [],
      needAck: options.needAck ?? this.config.requireAck,
    }

    const offlineFor: string[] = []
    if (
      msgType === MSG_TYPE.single &&
      result.delivered === 0 &&
      this.config.enableOffline &&
      options.saveOffline !== false
    ) {
      const ids = Array.isArray(options.targetUserId)
        ? options.targetUserId
        : options.targetUserId
          ? [String(options.targetUserId)]
          : []
      offlineFor.push(...ids)
      result.offline = ids.length
      this.metrics.offlineSaved += ids.length
    }

    // 频道消息落历史；单播在需 ACK 或离线时落库
    const shouldPersist =
      msgType !== MSG_TYPE.single ||
      offlineFor.length > 0 ||
      !!stored.needAck

    if (shouldPersist) {
      await Promise.resolve(this.ext.store.save(stored, offlineFor))
    }

    const receiveId =
      msgType === MSG_TYPE.single
        ? String(options.targetUserId || options.targetClientId || '')
        : options.channelName || 'all'

    await Promise.resolve(
      this.ext.addNotify(
        options.userId || 'server',
        receiveId,
        options.notifyType,
        options.notifyMsg,
        result.messageId
      )
    )

    return result
  }

  private async handleAck(data: WSRequest, client: WebSocket) {
    const session = this.sessions.get(data.clientId)
    if (!session) throw new ProtocolError(ERROR_CODE.NOT_LOGIN, 'not login')
    if (!data.messageId) throw new ProtocolError(ERROR_CODE.INVALID_PARAM, 'messageId required')

    const ok = await Promise.resolve(this.ext.store.ack(data.messageId, session.userId))
    if (!ok) {
      throw new ProtocolError(ERROR_CODE.MESSAGE_NOT_FOUND, 'message not found')
    }
    this.metrics.ackCount += 1
    this.safeSend(
      client,
      buildFeedback(true, METHOD_TYPE.ack, { messageId: data.messageId }, data.requestId || '', ERROR_CODE.OK, 'ok')
    )
  }

  private async handlePullHistory(data: WSRequest, client: WebSocket) {
    const session = this.sessions.get(data.clientId)
    if (!session) throw new ProtocolError(ERROR_CODE.NOT_LOGIN, 'not login')
    const channelName = data.channelName || ''
    if (!channelName) throw new ProtocolError(ERROR_CODE.INVALID_PARAM, 'channelName required')
    if (!session.channelMap.has(channelName)) {
      throw new ProtocolError(ERROR_CODE.NO_PERMISSION, 'not joined channel')
    }

    const result = await Promise.resolve(
      this.ext.store.listByChannel({
        channelName,
        cursor: data.cursor,
        limit: data.limit || this.config.historyLimit,
      })
    )
    this.safeSend(
      client,
      buildFeedback(true, METHOD_TYPE.pullHistory, result, data.requestId || '', ERROR_CODE.OK, 'ok')
    )
  }

  private async handlePullOffline(data: WSRequest, client: WebSocket) {
    const session = this.sessions.get(data.clientId)
    if (!session) throw new ProtocolError(ERROR_CODE.NOT_LOGIN, 'not login')
    if (!this.config.enableOffline) {
      this.safeSend(
        client,
        buildFeedback(true, METHOD_TYPE.pullOffline, { list: [] }, data.requestId || '', ERROR_CODE.OK, 'ok')
      )
      return
    }

    const list = await Promise.resolve(
      this.ext.store.listOffline(session.userId, data.limit || this.config.offlineLimit)
    )
    this.safeSend(
      client,
      buildFeedback(true, METHOD_TYPE.pullOffline, { list }, data.requestId || '', ERROR_CODE.OK, 'ok')
    )
  }

  private async pushOfflineOnLogin(session: NotifyClient) {
    if (!this.config.enableOffline) return
    const list = await Promise.resolve(
      this.ext.store.listOffline(session.userId, this.config.offlineLimit)
    )
    if (!list.length) return

    this.safeSend(
      session.client,
      buildSysMsg(MSG_TYPE.single, SYS_EVENT.offlineSync, { count: list.length })
    )

    list.forEach((msg) => {
      const payload: Notify = {
        type: 'notify',
        notifyType: msg.notifyType,
        notifyMsg: msg.notifyMsg,
        channelName: msg.channelName || '',
        userId: msg.sendUserId,
        clientId: msg.sendClientId || '',
        msgType: msg.msgType,
        messageId: msg.messageId,
        needAck: msg.needAck,
        createdAt: msg.createdAt,
        targetUserId: msg.targetUserId,
      }
      this.safeSend(session.client, JSON.stringify(payload))
      this.metrics.offlinePushed += 1
    })
  }

  private async login(data: any, client: WebSocket, req: any) {
    if (!data.token) {
      this.metrics.authFailed += 1
      this.safeSend(
        client,
        buildFeedback(false, METHOD_TYPE.login, { msg: 'token required' }, data.requestId || '', ERROR_CODE.INVALID_PARAM, 'token required')
      )
      return
    }
    if (!data.clientId) {
      this.metrics.authFailed += 1
      this.safeSend(
        client,
        buildFeedback(false, METHOD_TYPE.login, { msg: 'clientId required' }, data.requestId || '', ERROR_CODE.INVALID_PARAM, 'clientId required')
      )
      return
    }

    try {
      const userInfo = await Promise.resolve(this.ext.verifyToken(data.token))
      const userId = userInfo?.userId || userInfo?.uid || data.userId
      if (!userId) {
        throw new ProtocolError(ERROR_CODE.INVALID_PARAM, 'userId missing from token')
      }

      const host = String(req.headers.host || '')
      const origin = String(req.headers.origin || '')
      const userAgent = String(req.headers['user-agent'] || '')
      const connectInfo: ConnectInfo = {
        host,
        origin,
        userAgent,
        remoteAddress: req.socket?.remoteAddress,
      }

      const now = Date.now()
      const clientInstance: NotifyClient = {
        clientId: data.clientId,
        userId,
        userInfo: userInfo || {},
        connectInfo,
        channelMap: new Map(),
        loginTime: now,
        expireTime: userInfo?.expireTime || now + DAY_DURATION,
        lastActiveTime: now,
        client,
      }
      this.sessions.set(clientInstance)

      this.safeSend(
        client,
        buildFeedback(
          true,
          METHOD_TYPE.login,
          { userId, token: data.token, expireTime: clientInstance.expireTime },
          data.requestId || '',
          ERROR_CODE.OK,
          'ok'
        )
      )

      await Promise.resolve(
        this.ext.addLog('notify', host, origin, JSON.stringify({ userAgent, userId }))
      )

      // 登录后补推离线
      void this.pushOfflineOnLogin(clientInstance)
    } catch (e) {
      this.metrics.authFailed += 1
      const err = toProtocolError(e)
      this.safeSend(
        client,
        buildFeedback(false, METHOD_TYPE.login, { msg: err.message, code: err.code }, data.requestId || '', err.code, err.message)
      )
    }
  }

  private joinChannel(data: WSRequest) {
    const channelName = data.channelName
    if (!channelName) throw new ProtocolError(ERROR_CODE.INVALID_PARAM, 'channelName required')
    const session = this.sessions.get(data.clientId)
    if (!session) throw new ProtocolError(ERROR_CODE.NOT_LOGIN, 'not login')
    this.channels.join(channelName, session)
    this.safeSend(
      session.client,
      buildFeedback(true, METHOD_TYPE.joinChannel, { channelName }, data.requestId || '', ERROR_CODE.OK, 'ok')
    )
  }

  private leaveChannel(data: WSRequest) {
    const channelName = data.channelName
    if (!channelName) throw new ProtocolError(ERROR_CODE.INVALID_PARAM, 'channelName required')
    const session = this.sessions.get(data.clientId)
    if (!session) throw new ProtocolError(ERROR_CODE.NOT_LOGIN, 'not login')
    session.channelMap.delete(channelName)
    this.channels.leave(channelName, data.clientId)
    this.safeSend(
      session.client,
      buildFeedback(true, METHOD_TYPE.leaveChannel, { channelName }, data.requestId || '', ERROR_CODE.OK, 'ok')
    )
  }

  private getAttributes(data: WSRequest) {
    const session = this.sessions.get(data.clientId)
    if (!session) throw new ProtocolError(ERROR_CODE.NOT_LOGIN, 'not login')
    const attribute = {
      clientId: session.clientId,
      userId: session.userId,
      loginTime: session.loginTime,
      expireTime: session.expireTime,
      channels: Array.from(session.channelMap.keys()),
      channelMap: mapToObject(session.channelMap),
    }
    this.safeSend(
      session.client,
      buildFeedback(true, METHOD_TYPE.getAttributes, { attribute }, data.requestId || '', ERROR_CODE.OK, 'ok')
    )
  }

  private getChannelAttribute(data: WSRequest) {
    const session = this.sessions.get(data.clientId)
    if (!session) throw new ProtocolError(ERROR_CODE.NOT_LOGIN, 'not login')
    const channelName = data.channelName || ''
    if (!channelName) throw new ProtocolError(ERROR_CODE.INVALID_PARAM, 'channelName required')
    if (!session.channelMap.has(channelName)) {
      this.safeSend(
        session.client,
        buildFeedback(
          false,
          METHOD_TYPE.getChannelAttribute,
          { msg: 'not joined channel', code: ERROR_CODE.NO_PERMISSION },
          data.requestId || '',
          ERROR_CODE.NO_PERMISSION,
          'not joined channel'
        )
      )
      return
    }
    if (!this.channels.get(channelName)) {
      throw new ProtocolError(ERROR_CODE.CHANNEL_NOT_FOUND, 'channel not found')
    }
    const attribute = this.channels.getNotifyAttributes(channelName)
    this.safeSend(
      session.client,
      buildFeedback(
        true,
        METHOD_TYPE.getChannelAttribute,
        { channelName, attribute },
        data.requestId || '',
        ERROR_CODE.OK,
        'ok'
      )
    )
  }

  private logoutWithFeedback(data: WSRequest) {
    const session = this.sessions.get(data.clientId)
    if (session) {
      this.safeSend(
        session.client,
        buildFeedback(true, METHOD_TYPE.logout, {}, data.requestId || '', ERROR_CODE.OK, 'ok')
      )
    }
    this.removeClient(data.clientId, false)
  }

  private verifySession(clientId: string): NotifyClient {
    if (!clientId) throw new ProtocolError(ERROR_CODE.INVALID_PARAM, 'clientId required')
    const session = this.sessions.get(clientId)
    if (!session) throw new ProtocolError(ERROR_CODE.NOT_LOGIN, 'not login')
    if (session.expireTime <= Date.now()) {
      this.removeClient(clientId, true)
      throw new ProtocolError(ERROR_CODE.TOKEN_EXPIRE, 'token expire')
    }
    session.lastActiveTime = Date.now()
    return session
  }

  private removeClient(clientId: string, notifyExpire: boolean) {
    const session = this.sessions.get(clientId)
    if (!session) return
    if (notifyExpire) {
      this.safeSend(
        session.client,
        buildSysMsg(MSG_TYPE.single, SYS_EVENT.tokenExpire, { clientId })
      )
    }
    this.channels.leaveAll(session)
    this.sessions.delete(clientId)
    this.rateLimiter.clear(clientId)
  }

  private sendSysToClient(clientId: string, event: string, data: any) {
    const session = this.sessions.get(clientId)
    if (!session) return
    this.safeSend(session.client, buildSysMsg(MSG_TYPE.single, event, data))
  }

  private startHeartbeatWatcher() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      const timeout = this.config.heartbeatTimeout
      const expired: string[] = []
      this.sessions.forEach((session) => {
        if (session.expireTime <= now) {
          expired.push(session.clientId)
          return
        }
        if (now - session.lastActiveTime > timeout) {
          try {
            session.client.close(1001, 'heartbeat timeout')
          } catch {
            // ignore
          }
          expired.push(session.clientId)
        }
      })
      expired.forEach((id) => this.removeClient(id, true))
    }, this.config.heartbeatInterval)
  }

  private isOriginAllowed(origin: string) {
    const list = this.config.allowedOrigins
    if (!list || list.length === 0) return true
    if (!origin) return false
    return list.includes(origin)
  }

  private safeSend(socket: any, data: string) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(data)
        return true
      } catch (e) {
        this.log('error', 'send failed', { error: String(e) })
      }
    }
    return false
  }
}
