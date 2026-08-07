import { Channel, NotifyClient } from '../interface'
import { mapToObject } from '../utils'

export class ChannelManager {
  private channelMap = new Map<string, Channel>()

  get(channelName: string) {
    return this.channelMap.get(channelName)
  }

  getOrCreate(channelName: string): Channel {
    let channel = this.channelMap.get(channelName)
    if (!channel) {
      channel = {
        channelName,
        createTime: Date.now(),
        notifyParamMap: new Map(),
        clientMap: new Map(),
      }
      this.channelMap.set(channelName, channel)
    }
    return channel
  }

  join(channelName: string, client: NotifyClient) {
    const channel = this.getOrCreate(channelName)
    channel.clientMap.set(client.clientId, client)
    client.channelMap.set(channelName, {
      channelName,
      joinTime: Date.now(),
    })
    return channel
  }

  leave(channelName: string, clientId: string) {
    const channel = this.channelMap.get(channelName)
    if (channel) {
      channel.clientMap.delete(clientId)
      if (channel.clientMap.size === 0) {
        this.channelMap.delete(channelName)
      }
    }
  }

  leaveAll(client: NotifyClient) {
    const names = Array.from(client.channelMap.keys())
    names.forEach((name) => {
      this.leave(name, client.clientId)
      client.channelMap.delete(name)
    })
  }

  cacheNotify(channelName: string, notifyType: string, notifyMsg: string) {
    const channel = this.channelMap.get(channelName)
    if (!channel) {
      return
    }
    channel.notifyParamMap.set(`${notifyType}:${channelName}`, notifyMsg)
  }

  getNotifyAttributes(channelName: string) {
    const channel = this.channelMap.get(channelName)
    if (!channel) {
      return {}
    }
    return mapToObject(channel.notifyParamMap)
  }

  get size() {
    return this.channelMap.size
  }
}
