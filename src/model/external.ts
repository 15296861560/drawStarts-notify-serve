/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2023-03-26 15:24:29
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-03-26 19:39:11
 * @Author: “lgy lgy-lgy@qq.com
 * @FilePath: \drawStarts-notify-serve\src\model\external.ts
 * 
 * Copyright (c) 2023 by ${git_name_email}, All Rights Reserved. 
 */

import { ExternalInit } from '../interface/externalInterface'
export class External {
    config: any;

    constructor(external?: ExternalInit) {
        external?.verifyToken && (this.verifyToken = external.verifyToken);
        external?.addLog && (this.addLog = external.addLog);
        external?.addNotify && (this.addNotify = external.addNotify);
    }
    // 验证token，获取用户信息
    verifyToken(token: string) {
        return {};
    }

    // 添加日志
    addLog(type: string, hostname: string, originalUrl: string, content: string) {
    }

    // 添加通知记录
    addNotify(sendId: string, receiveId: string, notifyType: string, notifyMsg: string) {

    }

}