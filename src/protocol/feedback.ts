import { WS_MSG_TYPE, ERROR_CODE } from '../constant'
import { Feedback, RequestFeedback, SystemMsg } from '../interface'
import { MSG_TYPE } from '../constant'

export function buildFeedback(
  status: boolean,
  method: string,
  data: any = {},
  requestId = '',
  code: number = status ? ERROR_CODE.OK : ERROR_CODE.INTERNAL,
  message = status ? 'ok' : 'error'
): string {
  const res: RequestFeedback = {
    status,
    method,
    code,
    message,
    data,
  }
  const feedback: Feedback = {
    type: WS_MSG_TYPE.feedback,
    requestId,
    res,
  }
  return JSON.stringify(feedback)
}

export function buildSysMsg(
  msgType: MSG_TYPE | string,
  event: string,
  data: any = {}
): string {
  const msg: SystemMsg = {
    type: WS_MSG_TYPE.sys,
    msgType,
    event,
    data,
  }
  return JSON.stringify(msg)
}
