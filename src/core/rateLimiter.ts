export class RateLimiter {
  private windowMs: number
  private max: number
  private buckets = new Map<string, { count: number; resetAt: number }>()

  constructor(windowMs: number, max: number) {
    this.windowMs = windowMs
    this.max = max
  }

  update(windowMs: number, max: number) {
    this.windowMs = windowMs
    this.max = max
  }

  /** @returns true 表示允许通过 */
  check(key: string): boolean {
    const now = Date.now()
    let bucket = this.buckets.get(key)
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.windowMs }
      this.buckets.set(key, bucket)
    }
    bucket.count += 1
    return bucket.count <= this.max
  }

  clear(key: string) {
    this.buckets.delete(key)
  }
}
