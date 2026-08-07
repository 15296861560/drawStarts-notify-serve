import { ERROR_CODE } from '../constant'

export class ProtocolError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'ProtocolError'
  }
}

export function toProtocolError(err: unknown): ProtocolError {
  if (err instanceof ProtocolError) {
    return err
  }
  const message = err instanceof Error ? err.message : String(err || 'internal error')
  return new ProtocolError(ERROR_CODE.INTERNAL, message)
}
