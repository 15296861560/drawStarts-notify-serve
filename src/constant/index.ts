export enum SEND_TYPE {
  request = 'request',
  notify = 'notify',
}

export enum MSG_TYPE {
  all = 'all',
  channel = 'channel',
  single = 'single',
}

export enum WS_MSG_TYPE {
  feedback = 'feedback',
  sys = 'sys',
  notify = 'notify',
}

export enum METHOD_TYPE {
  login = 'login',
  logout = 'logout',
  joinChannel = 'joinChannel',
  leaveChannel = 'leaveChannel',
  getAttributes = 'getAttributes',
  getChannelAttribute = 'getChannelAttribute',
  heartbeat = 'heartbeat',
  ack = 'ack',
  pullHistory = 'pullHistory',
  pullOffline = 'pullOffline',
}

export enum SYS_EVENT {
  tokenExpire = 'tokenExpire',
  kicked = 'kicked',
  serverShutdown = 'serverShutdown',
  rateLimited = 'rateLimited',
  offlineSync = 'offlineSync',
}

/** 同用户多端投递策略 */
export enum MULTI_DEVICE_POLICY {
  /** 推给该用户全部在线端 */
  all = 'all',
  /** 仅推给一个端（最近活跃） */
  single = 'single',
  /** 推给全部端，但排除发送端 */
  excludeSender = 'excludeSender',
}

export const NO_LOGIN_METHOD = [
  String(METHOD_TYPE.login),
  String(METHOD_TYPE.heartbeat),
]

export const DAY_DURATION = 1000 * 60 * 60 * 24

export const ERROR_CODE = {
  OK: 0,
  NOT_LOGIN: 1001,
  TOKEN_EXPIRE: 1002,
  NO_PERMISSION: 1003,
  INVALID_PARAM: 1004,
  CHANNEL_NOT_FOUND: 1005,
  RATE_LIMITED: 1006,
  PAYLOAD_TOO_LARGE: 1007,
  ORIGIN_DENIED: 1008,
  MESSAGE_NOT_FOUND: 1009,
  INTERNAL: 1099,
} as const

export const DEFAULT_CONFIG = {
  port: 8030,
  /** HTTP 管理面端口；0 表示不开启 */
  httpPort: 0,
  staticDir: '',
  maxPayload: 64 * 1024,
  maxConnections: 10000,
  heartbeatInterval: 30000,
  heartbeatTimeout: 90000,
  rateLimitWindowMs: 1000,
  rateLimitMax: 50,
  allowedOrigins: [] as string[],
  /** 开启离线消息 */
  enableOffline: true,
  /** 频道历史默认条数 */
  historyLimit: 50,
  /** 离线消息默认拉取条数 */
  offlineLimit: 50,
  /** 多端策略 */
  multiDevicePolicy: MULTI_DEVICE_POLICY.excludeSender as string,
  /** 独立模式管理 Token，空则仅本机调试可用部分接口 */
  adminToken: '',
  /** requireAck 时未确认是否视为需重投（登录补推） */
  requireAck: false,
}
