import { randomBytes } from 'crypto'

export function generateId(len = 16): string {
  const bytes = Math.ceil(len / 2)
  return randomBytes(bytes).toString('hex').slice(0, len)
}

export function mapToObject(map: Map<string, any>): Record<string, any> {
  const obj: Record<string, any> = {}
  map.forEach((value, key) => {
    obj[key] = value
  })
  return obj
}

export function safeJsonParse(msg: string): any | null {
  try {
    return JSON.parse(msg)
  } catch {
    return null
  }
}

export function createLogger(
  custom?: (level: string, message: string, meta?: Record<string, unknown>) => void
) {
  return (level: string, message: string, meta?: Record<string, unknown>) => {
    if (custom) {
      custom(level, message, meta)
      return
    }
    const line = meta ? `${message} ${JSON.stringify(meta)}` : message
    if (level === 'error') {
      console.error(`[notify-serve] ${line}`)
    } else if (level === 'warn') {
      console.warn(`[notify-serve] ${line}`)
    } else {
      console.log(`[notify-serve] ${line}`)
    }
  }
}
