/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2023-02-25 22:02:14
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-03-19 19:13:26
 */

export enum SEND_TYPE {
    request = "request",
    notify = "notify",
}

export enum MSG_TYPE {
    all = "all",
    channel = "channel",
    single = "single",
}

export enum WS_MSG_TYPE {
    feedback = "feedback",
    sys = "sys",
    notify = "notify",
}

export enum METHOD_TYPE {
    login = "login",
    logout = "logout",
    joinChannel = "joinChannel",
    leaveChannel = "leaveChannel",
    getAttributes = "getAttributes",
    getChannelAttribute = "getChannelAttribute",
}

export const NO_LOGIN_METHOD = [String(METHOD_TYPE.login)];

export const DAY_DURATION = 1000 * 60 * 60 * 24;