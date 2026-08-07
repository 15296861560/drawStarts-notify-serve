/**
 * Smoke + M2 tests
 */
const WebSocket = require('ws')

const mod = require('../dist/draw-starts-notify-serve.cjs.js')
const notifyServer = mod.default || mod

const testPort = 8032
const httpPort = 8033

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function onceMessage(ws, predicate, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting message')), timeout)
    const onMsg = (raw) => {
      const data = JSON.parse(String(raw))
      if (!predicate || predicate(data)) {
        clearTimeout(timer)
        ws.off('message', onMsg)
        resolve(data)
      }
    }
    ws.on('message', onMsg)
  })
}

async function openClient(clientId) {
  const ws = new WebSocket(`ws://127.0.0.1:${testPort}`)
  await new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  ws.send(
    JSON.stringify({
      type: 'request',
      method: 'login',
      token: clientId,
      clientId,
      requestId: `login-${clientId}`,
    })
  )
  const fb = await onceMessage(ws, (d) => d.requestId === `login-${clientId}`)
  if (!fb.res.status) throw new Error('login failed ' + clientId)
  return ws
}

async function main() {
  notifyServer.init({
    config: {
      port: testPort,
      httpPort,
      adminToken: 'test-admin',
      enableOffline: true,
      heartbeatInterval: 10000,
      heartbeatTimeout: 60000,
      rateLimitMax: 500,
    },
    verifyToken: async (token) => ({ userId: token, userName: token }),
    addLog: () => {},
    addNotify: () => {},
  })

  await wait(300)

  const alice = await openClient('alice')
  const bob = await openClient('bob')
  console.log('✓ login alice/bob')

  alice.send(
    JSON.stringify({
      type: 'request',
      method: 'joinChannel',
      channelName: 'room-1',
      clientId: 'alice',
      requestId: 'aj',
    })
  )
  await onceMessage(alice, (d) => d.requestId === 'aj')
  bob.send(
    JSON.stringify({
      type: 'request',
      method: 'joinChannel',
      channelName: 'room-1',
      clientId: 'bob',
      requestId: 'bj',
    })
  )
  await onceMessage(bob, (d) => d.requestId === 'bj')
  console.log('✓ joinChannel')

  // channel notify with messageId + exclude sender
  const bobNotify = onceMessage(bob, (d) => d.type === 'notify' && d.notifyType === 'chat')
  alice.send(
    JSON.stringify({
      type: 'notify',
      notifyType: 'chat',
      notifyMsg: '{"text":"hi"}',
      channelName: 'room-1',
      clientId: 'alice',
      msgType: 'channel',
      needAck: true,
      requestId: 'n1',
    })
  )
  const n = await bobNotify
  if (!n.messageId) throw new Error('missing messageId')
  console.log('✓ channel notify messageId=', n.messageId)

  bob.send(
    JSON.stringify({
      type: 'request',
      method: 'ack',
      messageId: n.messageId,
      clientId: 'bob',
      requestId: 'ack1',
    })
  )
  const ackFb = await onceMessage(bob, (d) => d.requestId === 'ack1')
  if (!ackFb.res.status) throw new Error('ack failed')
  console.log('✓ ack')

  // history
  alice.send(
    JSON.stringify({
      type: 'request',
      method: 'pullHistory',
      channelName: 'room-1',
      clientId: 'alice',
      requestId: 'hist',
      limit: 10,
    })
  )
  const hist = await onceMessage(alice, (d) => d.requestId === 'hist')
  if (!hist.res.status || !hist.res.data.list.length) throw new Error('history empty')
  console.log('✓ pullHistory count=', hist.res.data.list.length)

  // offline: send to carol while offline
  const offlineResult = await notifyServer.notify({
    notifyType: 'dm',
    notifyMsg: '{"text":"offline-hi"}',
    msgType: 'single',
    targetUserId: 'carol',
    needAck: true,
  })
  if (offlineResult.offline < 1) throw new Error('expected offline save')
  console.log('✓ offline saved')

  const carol = new WebSocket(`ws://127.0.0.1:${testPort}`)
  await new Promise((resolve, reject) => {
    carol.once('open', resolve)
    carol.once('error', reject)
  })
  const offlineSys = onceMessage(carol, (d) => d.type === 'sys' && d.event === 'offlineSync', 5000)
  const offlinePush = onceMessage(carol, (d) => d.type === 'notify' && d.notifyType === 'dm', 5000)
  carol.send(
    JSON.stringify({
      type: 'request',
      method: 'login',
      token: 'carol',
      clientId: 'carol',
      requestId: 'login-carol',
    })
  )
  const carolLogin = await onceMessage(carol, (d) => d.requestId === 'login-carol')
  if (!carolLogin.res.status) throw new Error('carol login failed')
  await offlineSys
  const offlineMsg = await offlinePush
  if (offlineMsg.notifyMsg.indexOf('offline-hi') < 0) throw new Error('offline push mismatch')
  console.log('✓ offline push on login')

  // health
  const health = await fetch(`http://127.0.0.1:${httpPort}/health`).then((r) => r.json())
  if (!health.ok) throw new Error('health failed')
  console.log('✓ http /health', health.connections)

  const metrics = await fetch(`http://127.0.0.1:${httpPort}/metrics`).then((r) => r.json())
  if (metrics.notifySent < 1) throw new Error('metrics missing')
  console.log('✓ http /metrics notifySent=', metrics.notifySent)

  alice.close()
  bob.close()
  carol.close()
  await wait(300)
  await notifyServer.close()
  await wait(100)
  console.log('All M2 smoke tests passed.')
  process.exit(0)
}

main().catch(async (e) => {
  console.error('TEST FAILED', e)
  try {
    await notifyServer.close()
  } catch (_) {}
  process.exit(1)
})
