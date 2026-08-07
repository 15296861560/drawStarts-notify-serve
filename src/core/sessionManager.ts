import { NotifyClient } from '../interface'

export class SessionManager {
  private clientMap = new Map<string, NotifyClient>()
  /** userId -> Set<clientId> 便于单播 */
  private userIndex = new Map<string, Set<string>>()

  get size() {
    return this.clientMap.size
  }

  get(clientId: string) {
    return this.clientMap.get(clientId)
  }

  set(client: NotifyClient) {
    const prev = this.clientMap.get(client.clientId)
    if (prev) {
      this.removeUserIndex(prev.userId, prev.clientId)
    }
    this.clientMap.set(client.clientId, client)
    this.addUserIndex(client.userId, client.clientId)
  }

  delete(clientId: string) {
    const client = this.clientMap.get(clientId)
    if (!client) {
      return
    }
    this.removeUserIndex(client.userId, clientId)
    this.clientMap.delete(clientId)
  }

  findBySocket(socket: any): NotifyClient | undefined {
    for (const client of this.clientMap.values()) {
      if (client.client === socket) {
        return client
      }
    }
    return undefined
  }

  getByUserId(userId: string): NotifyClient[] {
    const ids = this.userIndex.get(userId)
    if (!ids) {
      return []
    }
    const list: NotifyClient[] = []
    ids.forEach((id) => {
      const c = this.clientMap.get(id)
      if (c) {
        list.push(c)
      }
    })
    return list
  }

  forEach(cb: (client: NotifyClient) => void) {
    this.clientMap.forEach(cb)
  }

  values() {
    return this.clientMap.values()
  }

  touch(clientId: string) {
    const client = this.clientMap.get(clientId)
    if (client) {
      client.lastActiveTime = Date.now()
    }
  }

  private addUserIndex(userId: string, clientId: string) {
    if (!userId) {
      return
    }
    let set = this.userIndex.get(userId)
    if (!set) {
      set = new Set()
      this.userIndex.set(userId, set)
    }
    set.add(clientId)
  }

  private removeUserIndex(userId: string, clientId: string) {
    const set = this.userIndex.get(userId)
    if (!set) {
      return
    }
    set.delete(clientId)
    if (set.size === 0) {
      this.userIndex.delete(userId)
    }
  }
}
