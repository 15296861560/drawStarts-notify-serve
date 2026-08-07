import { NotifyStore } from './store'
import { MULTI_DEVICE_POLICY } from '../constant'

export interface ExternalConfig {
  port?: number
  httpPort?: number
  /** 联调静态页目录 */
  staticDir?: string
  maxPayload?: number
  maxConnections?: number
  heartbeatInterval?: number
  heartbeatTimeout?: number
  rateLimitWindowMs?: number
  rateLimitMax?: number
  allowedOrigins?: string[]
  enableOffline?: boolean
  historyLimit?: number
  offlineLimit?: number
  multiDevicePolicy?: MULTI_DEVICE_POLICY | string
  adminToken?: string
  requireAck?: boolean
}

export interface ExternalInit {
  config?: ExternalConfig
  verifyToken: (token: string) => any | Promise<any>
  addLog?: (
    type: string,
    hostname: string,
    originalUrl: string,
    content: string
  ) => any | Promise<any>
  addNotify?: (
    sendId: string,
    receiveId: string,
    notifyType: string,
    notifyMsg: string,
    messageId?: string
  ) => any | Promise<any>
  /** 自定义持久化；默认使用内存 Store */
  notifyStore?: NotifyStore
  /** 结构化日志 */
  logger?: (level: string, message: string, meta?: Record<string, unknown>) => void
}

export type { NotifyStore, StoredNotifyMessage, HistoryQuery, HistoryResult } from './store'
