# 消息通知系统-服务端


## 使用
const notifyServer = require('drawstarts-notify-serve');
const port ='';
const verifyToken =()=>{};
const addLog =()=>{};
const addNotify =()=>{};

notifyServer.init({
    config: { port: '' }, verifyToken,
    addLog,
    addNotify
});;
