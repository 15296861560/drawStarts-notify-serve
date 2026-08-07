/**
 * M2 独立部署 + 联调 Demo
 * 启动：npm run demo
 * 打开：http://127.0.0.1:8031/
 */
const path = require('path')

const mod = require('../dist/draw-starts-notify-serve.cjs.js')
const notifyServer = mod.default || mod

const WS_PORT = Number(process.env.NOTIFY_WS_PORT || 8030)
const HTTP_PORT = Number(process.env.NOTIFY_HTTP_PORT || 8031)
const ADMIN_TOKEN = process.env.NOTIFY_ADMIN_TOKEN || 'demo-admin'

notifyServer.init({
  config: {
    port: WS_PORT,
    httpPort: HTTP_PORT,
    staticDir: path.join(__dirname, 'public'),
    adminToken: ADMIN_TOKEN,
    enableOffline: true,
    requireAck: false,
    historyLimit: 50,
    offlineLimit: 50,
    rateLimitMax: 200,
    heartbeatInterval: 20000,
    heartbeatTimeout: 60000,
    allowedOrigins: [],
  },
  verifyToken: async (token) => {
    if (!token) throw new Error('empty token')
    // demo：token 即 userId
    return {
      userId: token,
      userName: token,
      expireTime: Date.now() + 24 * 60 * 60 * 1000,
    }
  },
  addLog: (type, host, origin, content) => {
    console.log('[demo:log]', type, host, origin, content)
  },
  addNotify: (sendId, receiveId, notifyType, notifyMsg, messageId) => {
    console.log('[demo:notify]', { sendId, receiveId, notifyType, notifyMsg, messageId })
  },
  logger: (level, message, meta) => {
    const line = meta ? `${message} ${JSON.stringify(meta)}` : message
    console.log(`[demo:${level}] ${line}`)
  },
})

console.log('')
console.log('==========================================')
console.log(' Notify Demo is running')
console.log(` WS    : ws://127.0.0.1:${WS_PORT}`)
console.log(` Demo  : http://127.0.0.1:${HTTP_PORT}/`)
console.log(` Health: http://127.0.0.1:${HTTP_PORT}/health`)
console.log(` Admin : token = ${ADMIN_TOKEN}`)
console.log('==========================================')
console.log('')

process.on('SIGINT', async () => {
  console.log('\nshutting down...')
  await notifyServer.close()
  process.exit(0)
})
