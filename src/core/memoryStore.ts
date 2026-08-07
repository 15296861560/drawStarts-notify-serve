import {
  HistoryQuery,
  HistoryResult,
  NotifyStore,
  StoredNotifyMessage,
} from '../interface/store'

/** 默认内存实现：频道历史 + 用户离线箱 */
export class MemoryNotifyStore implements NotifyStore {
  private byId = new Map<string, StoredNotifyMessage>()
  private byChannel = new Map<string, string[]>()
  private offlineByUser = new Map<string, string[]>()

  async save(message: StoredNotifyMessage, offlineFor: string[] = []) {
    this.byId.set(message.messageId, {
      ...message,
      ackedUserIds: [...(message.ackedUserIds || [])],
    })

    if (message.channelName) {
      const list = this.byChannel.get(message.channelName) || []
      list.push(message.messageId)
      if (list.length > 1000) {
        list.splice(0, list.length - 1000)
      }
      this.byChannel.set(message.channelName, list)
    }

    offlineFor.forEach((uid) => {
      if (!uid) return
      const box = this.offlineByUser.get(uid) || []
      if (!box.includes(message.messageId)) {
        box.push(message.messageId)
        this.offlineByUser.set(uid, box)
      }
    })
  }

  async get(messageId: string) {
    return this.byId.get(messageId) || null
  }

  async ack(messageId: string, userId: string) {
    const msg = this.byId.get(messageId)
    if (!msg) {
      return false
    }
    if (!msg.ackedUserIds.includes(userId)) {
      msg.ackedUserIds.push(userId)
    }
    const box = this.offlineByUser.get(userId)
    if (box) {
      this.offlineByUser.set(
        userId,
        box.filter((id) => id !== messageId)
      )
    }
    return true
  }

  async listByChannel(query: HistoryQuery): Promise<HistoryResult> {
    const ids = this.byChannel.get(query.channelName) || []
    const limit = Math.max(1, Math.min(query.limit || 50, 200))
    let start = 0
    if (query.cursor) {
      const idx = ids.indexOf(query.cursor)
      start = idx >= 0 ? idx + 1 : 0
    }
    const slice = ids.slice(start, start + limit)
    const list = slice
      .map((id) => this.byId.get(id))
      .filter(Boolean) as StoredNotifyMessage[]
    const nextCursor =
      start + limit < ids.length ? slice[slice.length - 1] : undefined
    return { list, nextCursor }
  }

  async listOffline(userId: string, limit = 50): Promise<StoredNotifyMessage[]> {
    const ids = this.offlineByUser.get(userId) || []
    const slice = ids.slice(0, Math.max(1, Math.min(limit, 200)))
    return slice
      .map((id) => this.byId.get(id))
      .filter((m): m is StoredNotifyMessage => {
        if (!m) return false
        return !m.ackedUserIds.includes(userId)
      })
  }

  async markDelivered(userId: string, messageIds: string[]) {
    const box = this.offlineByUser.get(userId) || []
    const remove = new Set(messageIds)
    this.offlineByUser.set(
      userId,
      box.filter((id) => !remove.has(id))
    )
  }
}
