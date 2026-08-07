# 消息通知系统 - 服务端

`drawstarts-notify-serve@0.2.0` — 可嵌入 / 可独立部署的 WebSocket 实时通知中间件。

## 能力一览（含 M2）

- 登录鉴权、心跳、频道进退、频道/单播/全体推送
- `messageId`、ACK、频道历史、离线消息补推
- 内存 `NotifyStore`（可替换）
- Standalone HTTP：`/health` `/metrics` `/admin/*`
- 联调 Demo 页

## 快速接入

```js
const notifyServer = require('drawstarts-notify-serve').default

notifyServer.init({
  config: {
    port: 8030,
    httpPort: 8031,
    adminToken: 'secret',
    enableOffline: true,
  },
  verifyToken: async (token) => ({ userId: 'u1' }),
  addNotify: (sendId, receiveId, type, msg, messageId) => {},
})

notifyServer.notify({
  notifyType: 'order',
  notifyMsg: JSON.stringify({ id: 1 }),
  channelName: 'room-1',
  msgType: 'channel',
  needAck: true,
})
```

## 联调 Demo

```bash
npm run demo
```

打开 [http://127.0.0.1:8031/](http://127.0.0.1:8031/)

- 左/右两个客户端（alice / bob，token 即 userId）
- 支持频道通知、单播、历史、离线箱、Admin 推送

## HTTP 管理面

| 路径 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /metrics` | 运行指标 |
| `POST /admin/notify` | 管理推送（需 token） |
| `POST /admin/kick` | 踢人 |
| `POST /admin/broadcast` | 系统广播 |

Header：`X-Admin-Token: <adminToken>`（未配置 token 时仅本机可调管理接口）

## 新增协议方法

| method | 说明 |
|--------|------|
| `ack` | 确认 `messageId` |
| `pullHistory` | 频道历史（cursor/limit） |
| `pullOffline` | 拉取离线箱 |

配套前端：`drawstarts-notify@0.2.0`
