export interface WSRequest {
    method?: string,
    type: string,
    sendTime?: number,
    userId: string,
    clientId: string,
    requestId?: string,
}

export interface Feedback {
    requestId: string,
    type: string,
    res: any,
}

export interface RequestFeedback {
    status: boolean,
    method: string,
    data: any,
}

export interface SystemMsg {
    type: string,
    msgType: string,
    data: any,
}

export interface Notify extends WSRequest {
    notifyType: string,
    channelName: string,
    notifyMsg: string,
}

export interface NotifyClient {
    // 客户端id
    clientId: string,
    // 用户id
    userId: string,
    // 用户信息
    userInfo: any,
    // 连接信息
    connectInfo: ConnectInfo,
    // ws客户端
    client: any,
    // 加入的频道map
    channelMap: Map<string, any>,
    // 登录时间
    loginTime: number
    // 过期时间
    expireTime: number
}

export interface ConnectInfo {
    host: string,
    origin: string,
    userAgent: string
}

export interface Channel {
    channelName: string,
    client: any,
    clientMap: Map<string, any>
}



// 特定方法参数
export interface LoginParam extends WSRequest {
    token: string,
}
