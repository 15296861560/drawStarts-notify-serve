export class Metrics {
  connections = 0
  channels = 0
  notifySent = 0
  notifyDelivered = 0
  notifyFailed = 0
  authFailed = 0
  ackCount = 0
  offlineSaved = 0
  offlinePushed = 0
  startedAt = Date.now()

  snapshot(extra: Record<string, unknown> = {}) {
    return {
      uptimeMs: Date.now() - this.startedAt,
      connections: this.connections,
      channels: this.channels,
      notifySent: this.notifySent,
      notifyDelivered: this.notifyDelivered,
      notifyFailed: this.notifyFailed,
      authFailed: this.authFailed,
      ackCount: this.ackCount,
      offlineSaved: this.offlineSaved,
      offlinePushed: this.offlinePushed,
      ...extra,
    }
  }
}
