export interface ExternalInit {
    config:any,
    verifyToken: (token: string) => any,
    addLog: (type: string, hostname: string, originalUrl: string, content: string) => any,
    addNotify: (sendId: string, receiveId: string, notifyType: string, notifyMsg: string) => any,
}
export interface ExternalConfig {
    port: number;
}