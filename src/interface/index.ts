export interface WSRequest {
  method?: string
  type: string
  sendTime?: number
  userId?: string
  clientId: string
  requestId?: string
  channelName?: string
  token?: string
  msgType?: string
  targetUserId?: string | string[]
  targetClientId?: string
  messageId?: string
  cursor?: string
  limit?: number
  excludeSender?: boolean
}

export interface Feedback {
  requestId: string
  type: string
  res: RequestFeedback
}

export interface RequestFeedback {
  status: boolean
  method: string
  code: number
  message: string
  data: any
}

export interface SystemMsg {
  type: string
  msgType: string
  event?: string
  data: any
}

export interface Notify extends WSRequest {
  notifyType: string
  channelName: string
  notifyMsg: string
  msgType?: string
  targetUserId?: string | string[]
  targetClientId?: string
  messageId?: string
  needAck?: boolean
  createdAt?: number
}

export interface ConnectInfo {
  host: string
  origin: string
  userAgent: string
  remoteAddress?: string
}

export interface ClientChannelInfo {
  channelName: string
  joinTime: number
}

export interface NotifyClient {
  clientId: string
  userId: string
  userInfo: any
  connectInfo: ConnectInfo
  client: any
  channelMap: Map<string, ClientChannelInfo>
  loginTime: number
  expireTime: number
  lastActiveTime: number
}

export interface Channel {
  channelName: string
  createTime: number
  notifyParamMap: Map<string, string>
  clientMap: Map<string, NotifyClient>
}

export interface LoginParam extends WSRequest {
  token: string
}

export interface ServerNotifyOptions {
  notifyType: string
  notifyMsg: string
  channelName?: string
  msgType?: string
  userId?: string
  targetUserId?: string | string[]
  targetClientId?: string
  clientId?: string
  excludeSender?: boolean
  needAck?: boolean
  messageId?: string
  /** 目标用户全离线时是否写入离线箱 */
  saveOffline?: boolean
}
