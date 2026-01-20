export interface SamplerConfig {
  maxPoints: number
  aggregation: "last" | "average" | "max" | "min"
}

export class DataSampler<T extends { timestamp: number; value: number }> {
  private config: SamplerConfig
  private buckets: Map<number, T[]> = new Map()
  private bucketSize: number

  constructor(config: SamplerConfig, timeRangeMs: number) {
    this.config = config
    this.bucketSize = Math.ceil(timeRangeMs / config.maxPoints)
  }

  add(point: T): void {
    const bucketKey = Math.floor(point.timestamp / this.bucketSize)

    if (!this.buckets.has(bucketKey)) {
      this.buckets.set(bucketKey, [])
    }
    this.buckets.get(bucketKey)?.push(point)

    this.cleanup()
  }

  getSampled(): { timestamp: number; value: number }[] {
    const sortedKeys = Array.from(this.buckets.keys()).sort((a, b) => a - b)
    const result: { timestamp: number; value: number }[] = []

    for (const key of sortedKeys) {
      const points = this.buckets.get(key)
      if (!points || points.length === 0) continue

      const timestamp = key * this.bucketSize + this.bucketSize / 2
      const value = this.aggregate(points)

      result.push({ timestamp, value })
    }

    return result
  }

  private aggregate(points: T[]): number {
    const values = points.map((p) => p.value)

    switch (this.config.aggregation) {
      case "last":
        return values[values.length - 1] ?? 0
      case "average":
        return values.reduce((a, b) => a + b, 0) / values.length
      case "max":
        return Math.max(...values)
      case "min":
        return Math.min(...values)
      default:
        return 0
    }
  }

  private cleanup(): void {
    const now = Date.now()
    const oldestAllowed = Math.floor((now - this.bucketSize * this.config.maxPoints) / this.bucketSize)

    for (const key of this.buckets.keys()) {
      if (key < oldestAllowed) {
        this.buckets.delete(key)
      }
    }
  }
}
