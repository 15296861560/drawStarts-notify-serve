import { ExternalInit } from '../interface/externalInterface'
import { NotifyStore } from '../interface/store'
import { MemoryNotifyStore } from '../core/memoryStore'

export class External {
  config: ExternalInit['config']
  store: NotifyStore
  logger?: ExternalInit['logger']

  constructor(external?: ExternalInit) {
    this.config = external?.config
    this.store = external?.notifyStore || new MemoryNotifyStore()
    this.logger = external?.logger
    if (external?.verifyToken) {
      this.verifyToken = external.verifyToken
    }
    if (external?.addLog) {
      this.addLog = external.addLog
    }
    if (external?.addNotify) {
      this.addNotify = external.addNotify
    }
  }

  verifyToken(_token: string): any | Promise<any> {
    return {}
  }

  addLog(
    _type: string,
    _hostname: string,
    _originalUrl: string,
    _content: string
  ): any | Promise<any> {
    return undefined
  }

  addNotify(
    _sendId: string,
    _receiveId: string,
    _notifyType: string,
    _notifyMsg: string,
    _messageId?: string
  ): any | Promise<any> {
    return undefined
  }
}
