import http from 'http'
import { IncomingMessage, ServerResponse } from 'http'
import fs from 'fs'
import path from 'path'
import { Metrics } from '../core/metrics'

export interface HttpAdminDeps {
  getStats: () => Record<string, unknown>
  getMetrics: () => ReturnType<Metrics['snapshot']>
  notify: (body: any) => any
  kick: (clientId: string, reason?: string) => boolean
  broadcastSys: (event: string, data: any) => number
  adminToken: string
  logger: (level: string, message: string, meta?: Record<string, unknown>) => void
  /** 静态目录（联调 demo） */
  staticDir?: string
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  res.end(body)
}

function checkAdmin(req: IncomingMessage, adminToken: string): boolean {
  if (!adminToken) {
    // 未配置 token 时仅允许本机
    const ip = req.socket.remoteAddress || ''
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
  }
  const header =
    req.headers['x-admin-token'] ||
    (typeof req.headers.authorization === 'string'
      ? req.headers.authorization.replace(/^Bearer\s+/i, '')
      : '')
  return header === adminToken
}

function contentType(filePath: string) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8'
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  if (filePath.endsWith('.svg')) return 'image/svg+xml'
  return 'application/octet-stream'
}

function tryServeStatic(res: ServerResponse, staticDir: string, urlPath: string) {
  let rel = decodeURIComponent(urlPath.split('?')[0])
  if (rel === '/' || rel === '') rel = '/index.html'
  const filePath = path.normalize(path.join(staticDir, rel))
  if (!filePath.startsWith(path.normalize(staticDir))) {
    sendJson(res, 403, { ok: false, message: 'forbidden' })
    return true
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false
  }
  const body = fs.readFileSync(filePath)
  res.writeHead(200, {
    'Content-Type': contentType(filePath),
    'Access-Control-Allow-Origin': '*',
  })
  res.end(body)
  return true
}

export function createHttpAdminServer(deps: HttpAdminDeps) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')
    const pathName = url.pathname

    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {})
      return
    }

    try {
      if (req.method === 'GET' && pathName === '/health') {
        sendJson(res, 200, { ok: true, ...deps.getStats() })
        return
      }

      if (req.method === 'GET' && pathName === '/metrics') {
        sendJson(res, 200, deps.getMetrics())
        return
      }

      if (req.method === 'GET' && deps.staticDir) {
        if (tryServeStatic(res, deps.staticDir, pathName)) {
          return
        }
      }

      if (!checkAdmin(req, deps.adminToken)) {
        sendJson(res, 401, { ok: false, message: 'unauthorized' })
        return
      }

      if (req.method === 'POST' && pathName === '/admin/notify') {
        const raw = await readBody(req)
        const body = raw ? JSON.parse(raw) : {}
        const result = await Promise.resolve(deps.notify(body))
        sendJson(res, 200, { ok: true, result })
        return
      }

      if (req.method === 'POST' && pathName === '/admin/kick') {
        const raw = await readBody(req)
        const body = raw ? JSON.parse(raw) : {}
        const ok = deps.kick(body.clientId, body.reason)
        sendJson(res, ok ? 200 : 404, { ok, message: ok ? 'kicked' : 'client not found' })
        return
      }

      if (req.method === 'POST' && pathName === '/admin/broadcast') {
        const raw = await readBody(req)
        const body = raw ? JSON.parse(raw) : {}
        const count = deps.broadcastSys(body.event || 'notice', body.data || {})
        sendJson(res, 200, { ok: true, delivered: count })
        return
      }

      sendJson(res, 404, { ok: false, message: 'not found' })
    } catch (e: any) {
      deps.logger('error', 'http admin error', { error: String(e?.message || e) })
      sendJson(res, 500, { ok: false, message: String(e?.message || e) })
    }
  })

  return server
}
