
/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-10-28 23:36:35
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-03-19 23:32:08
 */
const WebSocket = require('ws')
import { mapToObject } from '../utils'
import { SEND_TYPE, MSG_TYPE, WS_MSG_TYPE, METHOD_TYPE, NO_LOGIN_METHOD } from '../constant'
import { WSRequest, Feedback, RequestFeedback, SystemMsg, Notify, NotifyClient, Channel } from '../interface'
const port = 8030;


export class NotifyServer {
    private wsServer: any;
    private clientMap: Map<string, any>;
    private channelMap: Map<string, any>;
    constructor() {
        this.wsServer = new WebSocket.Server({
            port
        }, () => {
            console.log(`websocket run port ${port}`)
        });

        this.clientMap = new Map();
        this.channelMap = new Map();

        this.subscribeServer();
    }

    // 发布监听
    subscribeServer() {
        //每当有客户端链接的时候 就会有一个client对象
        this.wsServer.on('connection', (client: any) => {
            //主动向前端发送消息
            client.on('message', (msg: string) => {
                let msgObj = this.verifyMessageFormat(msg, client);
                if (!msgObj) {
                    return;
                }

                if (msgObj.type === SEND_TYPE.request) {
                    this.handleRequest(msgObj, client);
                }
                if (msgObj.type === SEND_TYPE.notify) {
                    this.handleNotify(msgObj);
                }

            })

            client.on('close', (msg: any) => {
                console.log('链接断开：', msg);
                let clientId: string = '';
                let channelMap: Map<string, any> = new Map();
                this.clientMap.forEach((clientInstance: NotifyClient, clientId: string) => {
                    if (clientInstance.client === client) {
                        clientId = clientInstance.clientId;
                        channelMap = clientInstance.channelMap;
                        return;
                    }
                })
                if (clientId) {
                    // 清理客户端信息
                    this.clientMap.delete(clientId);
                    channelMap.forEach((channel: Channel, channelName: string) => {
                        channel.clientMap.delete(clientId);
                    })
                }
            })
        })
    }

    // 验证消息格式
    verifyMessageFormat(msg: string, client: any) {
        let msgObj = null;
        try {
            msgObj = JSON.parse(msg);
            console.log('msgObj', msgObj);
        } catch (e) {
            let resultStr: string = this.getFeedbackStr(false, {
                msg: "格式错误",
                code: 400
            }, "error");
            client.send(resultStr)
        }

        return msgObj;
    }

    // 处理通知
    handleNotify(data: Notify) {
        let {
            notifyType,
            notifyMsg,
            channelName
        } = data;

        let notify: Notify = {
            type: WS_MSG_TYPE.notify,
            notifyType,
            notifyMsg,
            channelName
        }
        // 发送通知
        this.clientMap.forEach((clientInstance: NotifyClient) => {
            let {
                channelMap,
                client
            } = clientInstance;

            if (channelMap.get(channelName)) {
                client.send(JSON.stringify(notify));
            }
        })
        // 记录参数
        let channel = this.channelMap.get(channelName);
        if (channel) {
            const notifyKey = `${notifyType}:${channelName}`;
            channel.notifyParamMap.set(notifyKey, notifyMsg);
        }
    }

    // 处理请求
    handleRequest(data: WSRequest, client: any) {
        try {
            if (data.method === METHOD_TYPE.login) {
                this.login(data, client);
            } else {
                switch (data.method) {
                    case METHOD_TYPE.joinChannel:
                        this.joinChannel(data);
                        break;
                    case METHOD_TYPE.leaveChannel:
                        this.leaveChannel(data);
                        break;
                    case METHOD_TYPE.getAttributes:
                        this.getAttributes(data);
                        break;
                    default:
                        break;
                }
            }
        } catch (e) {
            let resultStr: string = this.getFeedbackStr(false, {
                msg: e,
                code: 400
            }, "error", data.requestId);
            client.send(resultStr)
        }

    }

    // 获取反馈结果字符串
    getFeedbackStr(status = false, data = {}, method = '', requestId = '') {
        const requestFeedback: RequestFeedback = {
            method,
            status,
            data
        };

        const feedback: Feedback = {
            type: WS_MSG_TYPE.feedback,
            requestId,
            res: requestFeedback
        };
        return JSON.stringify(feedback)
    }

    // 登录
    login(data: any, client: any) {
        if (data.token) {
            let clientInstance:NotifyClient = {
                // 客户端id
                clientId: data.clientId,
                // 用户id
                userId: data.userId,
                // 加入的频道map
                channelMap: new Map(),
                // 登录时间
                loginTime: new Date().getTime(),
                // ws客户端
                client
            }
            this.clientMap.set(data.clientId, clientInstance);

            let resultStr: string = this.getFeedbackStr(true, {
                userId: data.userId,
                token: data.token
            }, METHOD_TYPE.login, data.requestId);

            client.send(resultStr);
        }

    }

    // 加入频道
    joinChannel(data: any) {
        const channelName = data.channelName;

        let clientInstance:NotifyClient = this.clientMap.get(data.clientId);
        if (!clientInstance) {
            throw ("not login...");
        }
        let channel = {
            channelName,
            joinTime: new Date().getTime(),
        }
        clientInstance.channelMap.set(channelName, channel);

        let channelInfo = this.channelMap.get(channelName);
        if (!channelInfo) {
            // 初始化频道信息
            channelInfo = {
                channelName,
                createTime: new Date().getTime(),
                notifyParamMap: new Map(),
                clientMap: new Map([
                    [clientInstance.clientId, clientInstance.client]
                ])
            }
            this.channelMap.set(channelName, channelInfo);
        } else {
            channelInfo.clientMap.set(clientInstance.clientId, clientInstance.client)
        }

        let resultStr: string = this.getFeedbackStr(true, {
            channelName
        }, METHOD_TYPE.joinChannel, data.requestId);

        clientInstance.client.send(resultStr);

    }

    // 离开频道
    leaveChannel(data: any) {
        let clientInstance:NotifyClient = this.clientMap.get(data.clientId);
        clientInstance.channelMap.delete(data.channelName);

        let channelInstance:Channel = this.channelMap.get(data.channelName);
        channelInstance.clientMap.delete(data.clientId);

        let resultStr: string = this.getFeedbackStr(true, {
            channelName: data.channelName
        }, METHOD_TYPE.leaveChannel, data.requestId);

        clientInstance.client.send(resultStr);
    }

    // 获取属性
    getAttributes(data: any) {
        let clientInstance:NotifyClient = this.clientMap.get(data.clientId);

        let resultStr: string = this.getFeedbackStr(true, {}, METHOD_TYPE.getAttributes, data.requestId);

        clientInstance.client.send(resultStr);
    }
    // 获取某频道的属性
    getChannelAttribute(data: any) {
        let clientInstance:NotifyClient = this.clientMap.get(data.clientId);
        const channelName = data.channelName;
        let attribute = {};
        let resultStr = '';
        if (clientInstance.channelMap.get(channelName)) {
            let channel = this.channelMap.get(channelName);
            attribute = mapToObject(channel.notifyParamMap);
            resultStr = this.getFeedbackStr(true, {
                channelName,
                attribute
            }, METHOD_TYPE.getChannelAttribute, data.requestId);
        } else {
            resultStr = this.getFeedbackStr(false, {
                msg: "当前客户端未加入该频道",
                code: 403
            }, METHOD_TYPE.getChannelAttribute, data.requestId);
        }

        clientInstance.client.send(resultStr);
    }

}
