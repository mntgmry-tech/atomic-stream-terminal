export type UpdateBatch<T extends Record<string, unknown>> = {
  [K in keyof T]?: T[K][]
}

export class UpdateBatcher<T extends Record<string, unknown>> {
  private updates: UpdateBatch<T> = {}
  private flushInterval: NodeJS.Timeout | null = null
  private flushCallback: (updates: UpdateBatch<T>) => void

  constructor(flushCallback: (updates: UpdateBatch<T>) => void, intervalMs = 100) {
    this.flushCallback = flushCallback
    this.flushInterval = setInterval(() => this.flush(), intervalMs)
  }

  add<K extends keyof T>(type: K, data: T[K]): void {
    const existing = this.updates[type]
    if (existing) {
      existing.push(data)
      return
    }
    this.updates[type] = [data]
  }

  flush(): void {
    if (Object.keys(this.updates).length === 0) return

    const updates = this.updates
    this.updates = {}
    this.flushCallback(updates)
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    this.flush()
  }
}
