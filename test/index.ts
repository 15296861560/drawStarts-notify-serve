/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2023-03-26 23:12:04
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-04-05 22:49:55
 * @Author: “lgy lgy-lgy@qq.com
 * @FilePath: \drawStarts-notify-serve\test\index.ts
 * 
 * Copyright (c) 2023 by ${git_name_email}, All Rights Reserved. 
 */
const notifyServer = require("../dist/draw-starts-notify-serve.umd.js")
const testPort=8032;


const testFun = function () {
    console.log(...arguments)
}

const verifyToken = function () {
    return {
        userId: 'testUserId',
        userName: "testUser"
    }
}

notifyServer.init({
    config: { port: testPort }, verifyToken,
    addLog: testFun,
    addNotify: testFun
});