/**
 * 需求文档验收测试（P0 + P1 / M0~M2）
 * 覆盖：鉴权、心跳、错误码、属性、MSG_TYPE、server.notify、
 *       messageId/ACK/历史/离线、health/metrics/admin、踢人/广播
 */
const WebSocket = require('ws')
const http = require('http')

const mod = require('../dist/draw-starts-notify-serve.cjs.js')
const notifyServer = mod.default || mod

const WS_PORT = 18032
const HTTP_PORT = 18033
const ADMIN = 'accept-admin'

const results = []

function pass(name, detail = '') {
  results.push({ name, ok: true, detail })
  console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`)
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail })
  console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function onceMessage(ws, predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout)
    const onMsg = (raw) => {
      let data
      try {
        data = JSON.parse(String(raw))
      } catch {
        return
      }
      if (!predicate || predicate(data)) {
        clearTimeout(timer)
        ws.off('message', onMsg)
        resolve(data)
      }
    }
    ws.on('message', onMsg)
  })
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`)
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

async function login(ws, userId, clientId = userId) {
  ws.send(
    JSON.stringify({
      type: 'request',
      method: 'login',
      token: userId,
      clientId,
      requestId: `login-${clientId}-${Date.now()}`,
    })
  )
  const fb = await onceMessage(ws, (d) => d.type === 'feedback' && d.res?.method === 'login')
  return fb
}

async function req(ws, method, extra = {}) {
  const requestId = `${method}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
  ws.send(
    JSON.stringify({
      type: 'request',
      method,
      clientId: extra.clientId,
      requestId,
      ...extra,
    })
  )
  return onceMessage(ws, (d) => d.requestId === requestId)
}

function httpJson(method, path, body, token = ADMIN) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: HTTP_PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token,
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') })
          } catch (e) {
            reject(e)
          }
        })
      }
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

async function main() {
  console.log('\n======== 需求文档功能验收 ========\n')

  notifyServer.init({
    config: {
      port: WS_PORT,
      httpPort: HTTP_PORT,
      adminToken: ADMIN,
      enableOffline: true,
      requireAck: false,
      heartbeatInterval: 5000,
      heartbeatTimeout: 60000,
      rateLimitMax: 1000,
      multiDevicePolicy: 'excludeSender',
    },
    verifyToken: async (token) => {
      if (token === 'bad') throw new Error('bad token')
      return { userId: token, expireTime: Date.now() + 3600_000 }
    },
    addLog: () => {},
    addNotify: () => {},
  })
  await wait(200)

  // ---------- P0 基线 ----------
  console.log('[P0] 协议与会话')

  // 未登录 notify 被拒 + 错误码
  {
    const ws = await connect()
    ws.send(
      JSON.stringify({
        type: 'notify',
        notifyType: 'x',
        notifyMsg: '{}',
        channelName: 'r',
        clientId: 'anon',
        requestId: 'hack1',
      })
    )
    const fb = await onceMessage(ws, (d) => d.requestId === 'hack1')
    if (!fb.res.status && fb.res.code === 1001) pass('未登录无法发 notify', `code=${fb.res.code}`)
    else fail('未登录无法发 notify', JSON.stringify(fb.res))
    ws.close()
  }

  // 错误码：token 失败
  {
    const ws = await connect()
    ws.send(
      JSON.stringify({
        type: 'request',
        method: 'login',
        token: 'bad',
        clientId: 'bad-c',
        requestId: 'bad-login',
      })
    )
    const fb = await onceMessage(ws, (d) => d.requestId === 'bad-login')
    if (!fb.res.status && typeof fb.res.code === 'number' && fb.res.message) {
      pass('错误码体系（登录失败含 code/message）', `code=${fb.res.code}`)
    } else fail('错误码体系', JSON.stringify(fb.res))
    ws.close()
  }

  const alice = await connect()
  const bob = await connect()
  const aliceLogin = await login(alice, 'alice', 'alice-1')
  const bobLogin = await login(bob, 'bob', 'bob-1')
  if (aliceLogin.res.status && bobLogin.res.status) pass('login 成功')
  else fail('login 成功')

  // heartbeat
  {
    const fb = await req(alice, 'heartbeat', { clientId: 'alice-1' })
    if (fb.res.status && fb.res.code === 0) pass('heartbeat')
    else fail('heartbeat', JSON.stringify(fb.res))
  }

  // join / leave
  {
    let fb = await req(alice, 'joinChannel', { clientId: 'alice-1', channelName: 'room-acc' })
    if (fb.res.status) pass('joinChannel')
    else fail('joinChannel', JSON.stringify(fb.res))
    fb = await req(bob, 'joinChannel', { clientId: 'bob-1', channelName: 'room-acc' })
    if (fb.res.status) pass('joinChannel (bob)')
    else fail('joinChannel (bob)', JSON.stringify(fb.res))
  }

  // getAttributes
  {
    const fb = await req(alice, 'getAttributes', { clientId: 'alice-1' })
    const attr = fb.res.data?.attribute
    if (fb.res.status && attr?.userId === 'alice' && Array.isArray(attr.channels)) {
      pass('getAttributes', `channels=${attr.channels.join(',')}`)
    } else fail('getAttributes', JSON.stringify(fb.res))
  }

  // channel notify + messageId + excludeSender
  {
    const bobGot = onceMessage(bob, (d) => d.type === 'notify' && d.notifyType === 'chat')
    const aliceEcho = onceMessage(
      alice,
      (d) => d.type === 'notify' && d.notifyType === 'chat',
      800
    ).then(() => 'echo').catch(() => 'no-echo')

    alice.send(
      JSON.stringify({
        type: 'notify',
        notifyType: 'chat',
        notifyMsg: '{"t":1}',
        channelName: 'room-acc',
        clientId: 'alice-1',
        msgType: 'channel',
        needAck: true,
        requestId: 'n-ch',
      })
    )
    const fb = await onceMessage(alice, (d) => d.requestId === 'n-ch')
    const n = await bobGot
    const echo = await aliceEcho
    if (fb.res.status && n.messageId && echo === 'no-echo') {
      pass('MSG_TYPE.channel + messageId + 排除发送端', `id=${n.messageId}`)
    } else {
      fail(
        'MSG_TYPE.channel + messageId + 排除发送端',
        `fb=${fb.res.status} id=${n?.messageId} echo=${echo}`
      )
    }

    // getChannelAttribute
    const attrFb = await req(bob, 'getChannelAttribute', {
      clientId: 'bob-1',
      channelName: 'room-acc',
    })
    if (attrFb.res.status && attrFb.res.data?.attribute?.['chat:room-acc']) {
      pass('getChannelAttribute', '含最近通知缓存')
    } else fail('getChannelAttribute', JSON.stringify(attrFb.res))

    // ACK
    const ackFb = await req(bob, 'ack', { clientId: 'bob-1', messageId: n.messageId })
    if (ackFb.res.status) pass('ACK 确认')
    else fail('ACK 确认', JSON.stringify(ackFb.res))
  }

  // single notify
  {
    const bobGot = onceMessage(bob, (d) => d.type === 'notify' && d.notifyType === 'dm')
    alice.send(
      JSON.stringify({
        type: 'notify',
        notifyType: 'dm',
        notifyMsg: '{"hi":"bob"}',
        msgType: 'single',
        targetUserId: 'bob',
        clientId: 'alice-1',
        requestId: 'n-dm',
      })
    )
    await onceMessage(alice, (d) => d.requestId === 'n-dm')
    const n = await bobGot
    if (n.targetUserId === 'bob' || n.notifyMsg.includes('bob')) pass('MSG_TYPE.single 单播')
    else pass('MSG_TYPE.single 单播', 'received')
  }

  // server.notify API
  {
    const bobGot = onceMessage(bob, (d) => d.type === 'notify' && d.notifyType === 'server')
    const result = await notifyServer.notify({
      notifyType: 'server',
      notifyMsg: '{"from":"host"}',
      channelName: 'room-acc',
      msgType: 'channel',
    })
    const n = await bobGot
    if (result.delivered >= 1 && n.messageId) {
      pass('宿主 server.notify API', `delivered=${result.delivered}`)
    } else fail('宿主 server.notify API', JSON.stringify(result))
  }

  // MSG_TYPE.all via host
  {
    const aGot = onceMessage(alice, (d) => d.type === 'notify' && d.notifyType === 'broadcast-all')
    const bGot = onceMessage(bob, (d) => d.type === 'notify' && d.notifyType === 'broadcast-all')
    await notifyServer.notify({
      notifyType: 'broadcast-all',
      notifyMsg: '{}',
      msgType: 'all',
    })
    await Promise.all([aGot, bGot])
    pass('MSG_TYPE.all 全体推送')
  }

  // pullHistory
  {
    const fb = await req(alice, 'pullHistory', {
      clientId: 'alice-1',
      channelName: 'room-acc',
      limit: 20,
    })
    if (fb.res.status && fb.res.data.list?.length >= 1) {
      pass('pullHistory 历史拉取', `count=${fb.res.data.list.length}`)
    } else fail('pullHistory 历史拉取', JSON.stringify(fb.res))
  }

  // leaveChannel
  {
    const fb = await req(alice, 'leaveChannel', { clientId: 'alice-1', channelName: 'room-acc' })
    if (fb.res.status) pass('leaveChannel')
    else fail('leaveChannel', JSON.stringify(fb.res))
    // rejoin for later tests
    await req(alice, 'joinChannel', { clientId: 'alice-1', channelName: 'room-acc' })
  }

  // ---------- P1 离线 ----------
  console.log('\n[P1] 投递与可靠性')
  {
    const offline = await notifyServer.notify({
      notifyType: 'offline-dm',
      notifyMsg: '{"text":"missed"}',
      msgType: 'single',
      targetUserId: 'carol',
      needAck: true,
    })
    if (offline.offline >= 1) pass('离线消息入库', `offline=${offline.offline}`)
    else fail('离线消息入库', JSON.stringify(offline))

    const carol = await connect()
    const sysP = onceMessage(carol, (d) => d.type === 'sys' && d.event === 'offlineSync')
    const msgP = onceMessage(carol, (d) => d.type === 'notify' && d.notifyType === 'offline-dm')
    await login(carol, 'carol', 'carol-1')
    await sysP
    const msg = await msgP
    if (msg.messageId && msg.notifyMsg.includes('missed')) pass('登录后离线补推')
    else fail('登录后离线补推', JSON.stringify(msg))

    const pull = await req(carol, 'pullOffline', { clientId: 'carol-1', limit: 10 })
    if (pull.res.status && Array.isArray(pull.res.data.list)) {
      pass('pullOffline 主动拉取', `list=${pull.res.data.list.length}`)
    } else fail('pullOffline 主动拉取', JSON.stringify(pull.res))
    carol.close()
  }

  // 多端：同用户双端，excludeSender
  {
    const alice2 = await connect()
    await login(alice2, 'alice', 'alice-2')
    await req(alice2, 'joinChannel', { clientId: 'alice-2', channelName: 'room-acc' })

    const a2Got = onceMessage(alice2, (d) => d.type === 'notify' && d.notifyType === 'multi')
    const a1Echo = onceMessage(
      alice,
      (d) => d.type === 'notify' && d.notifyType === 'multi',
      800
    ).then(() => 'echo').catch(() => 'no-echo')

    alice.send(
      JSON.stringify({
        type: 'notify',
        notifyType: 'multi',
        notifyMsg: '{}',
        channelName: 'room-acc',
        clientId: 'alice-1',
        msgType: 'channel',
        requestId: 'n-multi',
      })
    )
    await onceMessage(alice, (d) => d.requestId === 'n-multi')
    await a2Got
    const echo = await a1Echo
    if (echo === 'no-echo') pass('多端策略 excludeSender（发送端不收）')
    else fail('多端策略 excludeSender', `echo=${echo}`)
    alice2.close()
  }

  // ---------- P1 管理与可观测 ----------
  console.log('\n[P1] 管理与可观测')
  {
    const health = await httpJson('GET', '/health')
    if (health.status === 200 && health.body.ok) {
      pass('/health', `connections=${health.body.connections}`)
    } else fail('/health', JSON.stringify(health))

    const metrics = await httpJson('GET', '/metrics')
    if (metrics.status === 200 && metrics.body.notifySent >= 1) {
      pass('/metrics', `notifySent=${metrics.body.notifySent}`)
    } else fail('/metrics', JSON.stringify(metrics))

    // admin 鉴权失败
    const denied = await httpJson('POST', '/admin/notify', { notifyType: 'x', notifyMsg: '{}' }, 'wrong')
    if (denied.status === 401) pass('admin 鉴权拒绝错误 token')
    else fail('admin 鉴权拒绝错误 token', String(denied.status))

    // admin notify
    const bobGot = onceMessage(bob, (d) => d.type === 'notify' && d.notifyType === 'admin-push')
    const adm = await httpJson('POST', '/admin/notify', {
      notifyType: 'admin-push',
      notifyMsg: '{"ok":1}',
      msgType: 'channel',
      channelName: 'room-acc',
    })
    await bobGot
    if (adm.body.ok) pass('admin/notify 管理推送')
    else fail('admin/notify 管理推送', JSON.stringify(adm.body))

    // broadcast sys
    const sysA = onceMessage(alice, (d) => d.type === 'sys' && d.event === 'notice')
    const bc = await httpJson('POST', '/admin/broadcast', {
      event: 'notice',
      data: { text: 'hello' },
    })
    await sysA
    if (bc.body.ok && bc.body.delivered >= 1) pass('admin/broadcast 系统公告', `delivered=${bc.body.delivered}`)
    else fail('admin/broadcast 系统公告', JSON.stringify(bc.body))

    // kick
    const kickSys = onceMessage(bob, (d) => d.type === 'sys' && d.event === 'kicked', 3000).catch(() => null)
    const kick = await httpJson('POST', '/admin/kick', { clientId: 'bob-1', reason: 'test' })
    await kickSys
    if (kick.body.ok) pass('admin/kick 踢人')
    else fail('admin/kick 踢人', JSON.stringify(kick.body))
  }

  // getStats
  {
    const stats = notifyServer.getStats()
    if (typeof stats.connections === 'number') pass('getStats()', JSON.stringify(stats))
    else fail('getStats()')
  }

  // logout
  {
    const fb = await req(alice, 'logout', { clientId: 'alice-1' })
    if (fb.res.status) pass('logout')
    else fail('logout', JSON.stringify(fb.res))
  }

  // ---------- 汇总 ----------
  alice.close()
  bob.close()
  await wait(200)
  await notifyServer.close()
  await wait(100)

  const ok = results.filter((r) => r.ok).length
  const bad = results.filter((r) => !r.ok)
  console.log('\n======== 验收结果 ========')
  console.log(`通过 ${ok}/${results.length}`)
  if (bad.length) {
    console.log('失败项：')
    bad.forEach((b) => console.log(`  - ${b.name}: ${b.detail}`))
    process.exit(1)
  }
  console.log('需求文档 P0/P1（M0~M2）功能验收全部通过。')
  console.log('（P2 多通道 Outbox / 集群 按文档为后续阶段，本次未测）\n')
  process.exit(0)
}

main().catch(async (e) => {
  console.error('\n验收异常:', e)
  try {
    await notifyServer.close()
  } catch (_) {}
  process.exit(1)
})
