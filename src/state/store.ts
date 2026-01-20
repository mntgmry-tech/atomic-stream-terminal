import { EventEmitter } from "eventemitter3"
import { RingBuffer } from "./buffers/ring-buffer.js"
import type { PriceData } from "../ui/widgets/price-ticker.widget.js"
import type { WsPoolCreatedEvent, WsPoolReservesEvent, WsSwapQuoteEvent } from "../types/stream.types.js"

export interface StoreEvents {
  "price:update": (data: PriceData) => void
  "swap:quote": (swap: WsSwapQuoteEvent) => void
  "swap:alert": (swap: WsSwapQuoteEvent) => void
  "pool:created": (pool: WsPoolCreatedEvent) => void
  "pool:reserves": (reserves: WsPoolReservesEvent) => void
  "stats:update": (stats: DashboardStats) => void
}

export interface DashboardStats {
  totalSwaps: number
  totalSwapAlerts: number
  totalNotionalUsd: number
  swapsPerMinute: number
  alertsPerMinute: number
  largestSwapUsd?: number
}

export interface StoreConfig {
  priceHistoryLength?: number
  swapHistoryLength?: number
  poolHistoryLength?: number
}

export class DashboardStore extends EventEmitter<StoreEvents> {
  private prices: Map<string, PriceData> = new Map()
  private priceHistory: Map<string, RingBuffer<{ price: number; timestamp: number }>> = new Map()
  private swaps: RingBuffer<WsSwapQuoteEvent>
  private swapAlerts: RingBuffer<WsSwapQuoteEvent>
  private pools: RingBuffer<WsPoolCreatedEvent>
  private reserves: Map<string, WsPoolReservesEvent> = new Map()
  private stats: DashboardStats
  private swapTimestamps: RingBuffer<number>
  private alertTimestamps: RingBuffer<number>
  private priceHistoryLength: number

  constructor(config: StoreConfig = {}) {
    super()

    this.priceHistoryLength = config.priceHistoryLength ?? 300
    const swapHistoryLength = config.swapHistoryLength ?? 1000
    const poolHistoryLength = config.poolHistoryLength ?? 100

    this.swaps = new RingBuffer(swapHistoryLength)
    this.swapAlerts = new RingBuffer(swapHistoryLength)
    this.pools = new RingBuffer(poolHistoryLength)
    this.swapTimestamps = new RingBuffer(1000)
    this.alertTimestamps = new RingBuffer(1000)

    this.stats = {
      totalSwaps: 0,
      totalSwapAlerts: 0,
      totalNotionalUsd: 0,
      swapsPerMinute: 0,
      alertsPerMinute: 0
    }
  }

  updatePrice(data: PriceData): void {
    const previous = this.prices.get(data.pairKey)
    const changePct =
      previous && previous.price > 0 ? ((data.price - previous.price) / previous.price) * 100 : undefined
    const next: PriceData = { ...data, changePct }
    this.prices.set(data.pairKey, next)

    if (!this.priceHistory.has(data.pairKey)) {
      this.priceHistory.set(data.pairKey, new RingBuffer(this.priceHistoryLength))
    }
    this.priceHistory.get(data.pairKey)?.push({
      price: data.price,
      timestamp: Date.now()
    })

    this.emit("price:update", next)
  }

  getPrice(pairKey: string): PriceData | undefined {
    return this.prices.get(pairKey)
  }

  getPriceHistory(pairKey: string): { price: number; timestamp: number }[] {
    return this.priceHistory.get(pairKey)?.toArray() ?? []
  }

  getAllPrices(): PriceData[] {
    return Array.from(this.prices.values())
  }

  addSwapQuote(swap: WsSwapQuoteEvent): void {
    this.swaps.push(swap)
    this.swapTimestamps.push(Date.now())
    this.stats.totalSwaps += 1

    if (swap.notionalUsd !== undefined && Number.isFinite(swap.notionalUsd)) {
      this.stats.totalNotionalUsd += swap.notionalUsd
      if (this.stats.largestSwapUsd === undefined || swap.notionalUsd > this.stats.largestSwapUsd) {
        this.stats.largestSwapUsd = swap.notionalUsd
      }
    }

    this.updateSwapsPerMinute()
    this.emit("swap:quote", swap)
    this.emit("stats:update", this.stats)
  }

  addSwapAlert(swap: WsSwapQuoteEvent): void {
    this.swapAlerts.push(swap)
    this.alertTimestamps.push(Date.now())
    this.stats.totalSwapAlerts += 1
    this.updateAlertsPerMinute()
    this.emit("swap:alert", swap)
    this.emit("stats:update", this.stats)
  }

  getRecentSwaps(count = 50): WsSwapQuoteEvent[] {
    return this.swaps.toArray().slice(-count)
  }

  addPool(pool: WsPoolCreatedEvent): void {
    this.pools.push(pool)
    this.emit("pool:created", pool)
  }

  getRecentPools(count = 20): WsPoolCreatedEvent[] {
    return this.pools.toArray().slice(-count)
  }

  updateReserves(reserves: WsPoolReservesEvent): void {
    this.reserves.set(reserves.pool, reserves)
    this.emit("pool:reserves", reserves)
  }

  getStats(): DashboardStats {
    return { ...this.stats }
  }

  private updateSwapsPerMinute(): void {
    const now = Date.now()
    const oneMinuteAgo = now - 60000

    const timestamps = this.swapTimestamps.toArray()
    const recentCount = timestamps.filter((t) => t > oneMinuteAgo).length

    this.stats.swapsPerMinute = recentCount
  }

  private updateAlertsPerMinute(): void {
    const now = Date.now()
    const oneMinuteAgo = now - 60000
    const timestamps = this.alertTimestamps.toArray()
    const recentCount = timestamps.filter((t) => t > oneMinuteAgo).length

    this.stats.alertsPerMinute = recentCount
  }
}
