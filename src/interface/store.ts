export interface StoredNotifyMessage {
  messageId: string
  notifyType: string
  notifyMsg: string
  channelName?: string
  msgType: string
  sendUserId: string
  sendClientId?: string
  targetUserId?: string | string[]
  targetClientId?: string
  createdAt: number
  /** 已确认的 userId 集合 */
  ackedUserIds: string[]
  /** 是否需要 ACK */
  needAck?: boolean
}

export interface HistoryQuery {
  channelName: string
  cursor?: string
  limit?: number
}

export interface HistoryResult {
  list: StoredNotifyMessage[]
  nextCursor?: string
}

/** 消息持久化 / 离线 / ACK 扩展点 */
export interface NotifyStore {
  /**
   * @param offlineFor 需要写入离线箱的 userId 列表（仅这些用户会在登录时补推）
   */
  save(message: StoredNotifyMessage, offlineFor?: string[]): void | Promise<void>
  get(messageId: string): StoredNotifyMessage | null | Promise<StoredNotifyMessage | null>
  ack(messageId: string, userId: string): boolean | Promise<boolean>
  listByChannel(query: HistoryQuery): HistoryResult | Promise<HistoryResult>
  listOffline(userId: string, limit?: number): StoredNotifyMessage[] | Promise<StoredNotifyMessage[]>
  markDelivered?(userId: string, messageIds: string[]): void | Promise<void>
}
