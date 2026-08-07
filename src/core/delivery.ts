import { MSG_TYPE, WS_MSG_TYPE, MULTI_DEVICE_POLICY } from '../constant'
import { Notify, NotifyClient, ServerNotifyOptions } from '../interface'
import { SessionManager } from './sessionManager'
import { ChannelManager } from './channelManager'
import { generateId } from '../utils'

export interface DeliverResult {
  delivered: number
  msgType: string
  messageId: string
  offline: number
  targets: string[]
}

export class DeliveryService {
  private multiDevicePolicy: string = MULTI_DEVICE_POLICY.excludeSender

  constructor(
    private sessions: SessionManager,
    private channels: ChannelManager
  ) {}

  setMultiDevicePolicy(policy: string) {
    this.multiDevicePolicy = policy
  }

  deliver(
    options: ServerNotifyOptions & { userId?: string; clientId?: string }
  ): DeliverResult {
    const msgType = options.msgType || MSG_TYPE.channel
    const messageId = options.messageId || generateId(16)
    const createdAt = Date.now()
    const payload: Notify = {
      type: WS_MSG_TYPE.notify,
      notifyType: options.notifyType,
      notifyMsg: options.notifyMsg,
      channelName: options.channelName || '',
      userId: options.userId || '',
      clientId: options.clientId || '',
      msgType,
      targetUserId: options.targetUserId,
      targetClientId: options.targetClientId,
      messageId,
      needAck: options.needAck,
      createdAt,
    }

    let targets = this.resolveTargets(payload, msgType, options)
    if (
      options.excludeSender !== false &&
      this.multiDevicePolicy === MULTI_DEVICE_POLICY.excludeSender &&
      options.clientId
    ) {
      targets = targets.filter((c) => c.clientId !== options.clientId)
    }

    const body = JSON.stringify(payload)
    let delivered = 0
    targets.forEach((client) => {
      if (this.safeSend(client.client, body)) {
        delivered += 1
      }
    })

    if (payload.channelName && msgType !== MSG_TYPE.single) {
      this.channels.cacheNotify(
        payload.channelName,
        payload.notifyType,
        payload.notifyMsg
      )
    }

    return {
      delivered,
      msgType,
      messageId,
      offline: 0,
      targets: targets.map((t) => t.clientId),
    }
  }

  private resolveTargets(
    payload: Notify,
    msgType: string,
    options: ServerNotifyOptions
  ): NotifyClient[] {
    if (msgType === MSG_TYPE.all) {
      return Array.from(this.sessions.values())
    }

    if (msgType === MSG_TYPE.single) {
      if (payload.targetClientId) {
        const c = this.sessions.get(payload.targetClientId)
        return c ? [c] : []
      }
      const userIds = Array.isArray(payload.targetUserId)
        ? payload.targetUserId
        : payload.targetUserId
          ? [payload.targetUserId]
          : []
      let list: NotifyClient[] = []
      userIds.forEach((uid) => {
        list.push(...this.sessions.getByUserId(uid))
      })

      if (this.multiDevicePolicy === MULTI_DEVICE_POLICY.single && list.length > 1) {
        list = [
          list.reduce((a, b) => (a.lastActiveTime >= b.lastActiveTime ? a : b)),
        ]
      }
      return list
    }

    if (!payload.channelName) {
      return []
    }
    const channel = this.channels.get(payload.channelName)
    if (!channel) {
      return []
    }
    return Array.from(channel.clientMap.values())
  }

  private safeSend(socket: any, data: string) {
    if (socket && socket.readyState === 1) {
      try {
        socket.send(data)
        return true
      } catch (e) {
        console.error('send failed', e)
      }
    }
    return false
  }
}
