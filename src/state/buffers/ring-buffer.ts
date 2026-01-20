export class RingBuffer<T> {
  private buffer: Array<T | undefined>
  private head = 0
  private tail = 0
  private count = 0
  private capacity: number

  constructor(capacity: number) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error("RingBuffer capacity must be a positive number")
    }
    this.capacity = Math.floor(capacity)
    this.buffer = new Array(this.capacity)
  }

  push(item: T): void {
    this.buffer[this.tail] = item

    if (this.count === this.capacity) {
      this.head = (this.head + 1) % this.capacity
    } else {
      this.count += 1
    }

    this.tail = (this.tail + 1) % this.capacity
  }

  toArray(): T[] {
    const result: T[] = []
    for (let i = 0; i < this.count; i += 1) {
      const index = (this.head + i) % this.capacity
      const item = this.buffer[index]
      if (item !== undefined) {
        result.push(item)
      }
    }
    return result
  }

  get length(): number {
    return this.count
  }

  get size(): number {
    return this.capacity
  }

  isFull(): boolean {
    return this.count === this.capacity
  }

  isEmpty(): boolean {
    return this.count === 0
  }

  clear(): void {
    this.buffer = new Array(this.capacity)
    this.head = 0
    this.tail = 0
    this.count = 0
  }

  *[Symbol.iterator](): Iterator<T> {
    let index = this.head
    for (let i = 0; i < this.count; i += 1) {
      const item = this.buffer[index]
      if (item !== undefined) {
        yield item
      }
      index = (index + 1) % this.capacity
    }
  }
}
