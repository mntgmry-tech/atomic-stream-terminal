import { formatPairLabel, parsePairKey } from "../utils/mints.js"
import type { PriceData } from "../ui/widgets/price-ticker.widget.js"
import type { DexId, WsPoolCreatedEvent, WsPoolReservesEvent, WsSwapQuoteEvent } from "../types/stream.types.js"

export class MockDataGenerator {
  private basePrice = 100
  private volatility = 0.02
  private slot = 100

  generatePrice(pairKey: string): PriceData {
    const change = (Math.random() - 0.5) * 2 * this.volatility
    const price = this.basePrice * (1 + change)
    const label = this.formatPairKey(pairKey)

    return {
      pairKey,
      pairLabel: label,
      price,
      dex: this.randomDex(),
      slot: this.nextSlot()
    }
  }

  generateSwapQuote(stream: "swap-quotes" | "swap-alerts"): WsSwapQuoteEvent {
    const baseMint = this.randomMint()
    const quoteMint = this.randomMint()
    const baseAmount = this.randomAmountRaw()
    const quoteAmount = this.randomAmountRaw()

    return {
      type: "swap-quote",
      stream,
      dex: this.randomDex(),
      pool: this.randomAddress(),
      baseMint,
      quoteMint,
      baseAmount,
      quoteAmount,
      baseAmountUi: this.formatUiAmount(baseAmount, 6),
      quoteAmountUi: this.formatUiAmount(quoteAmount, 6),
      tokenIn: baseMint,
      tokenOut: quoteMint,
      amountIn: baseAmount,
      amountOut: quoteAmount,
      amountInUi: this.formatUiAmount(baseAmount, 6),
      amountOutUi: this.formatUiAmount(quoteAmount, 6),
      price: Math.random() * 100,
      executionPrice: Math.random() * 100,
      notionalUsd: stream === "swap-alerts" ? 10_000 + Math.random() * 50_000 : Math.random() * 5_000,
      slot: this.nextSlot(),
      signature: this.randomSignature()
    }
  }

  generatePoolCreated(): WsPoolCreatedEvent {
    return {
      type: "pool-created",
      stream: "pool-creations",
      dex: this.randomDex(),
      pool: this.randomAddress(),
      baseMint: this.randomMint(),
      quoteMint: this.randomMint(),
      baseVault: this.randomAddress(),
      quoteVault: this.randomAddress(),
      slot: this.nextSlot(),
      signature: this.randomSignature()
    }
  }

  generatePoolReserves(pool: WsPoolCreatedEvent): WsPoolReservesEvent {
    const baseAmount = this.randomAmountRaw()
    const quoteAmount = this.randomAmountRaw()
    return {
      type: "pool-reserves",
      stream: "pool-reserves",
      dex: pool.dex,
      pool: pool.pool,
      baseMint: pool.baseMint,
      quoteMint: pool.quoteMint,
      baseAmount,
      quoteAmount,
      baseAmountUi: this.formatUiAmount(baseAmount, 6),
      quoteAmountUi: this.formatUiAmount(quoteAmount, 6),
      price: Math.random() * 100,
      slot: this.nextSlot()
    }
  }

  private randomAddress(): string {
    const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    let result = ""
    for (let i = 0; i < 44; i += 1) {
      result += chars[Math.floor(Math.random() * chars.length)]
    }
    return result
  }

  private randomSignature(): string {
    return this.randomAddress() + this.randomAddress().slice(0, 44)
  }

  private randomDex(): DexId {
    const dexes: DexId[] = ["raydium", "orca", "meteora", "pumpfun"]
    return this.pickRandom(dexes)
  }

  private randomMint(): string {
    const mints = [
      "So11111111111111111111111111111111111111112",
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
    ]
    return this.pickRandom(mints)
  }

  private randomAmountRaw(): string {
    return String(Math.floor(Math.random() * 1_000_000_000) + 1)
  }

  private formatUiAmount(raw: string, decimals: number): string {
    const value = Number(raw) / Math.pow(10, decimals)
    return value.toFixed(6)
  }

  private formatPairKey(value: string): string {
    const parsed = parsePairKey(value)
    if (!parsed) return value
    return formatPairLabel(parsed.baseMint, parsed.quoteMint)
  }

  private nextSlot(): number {
    this.slot += 1
    return this.slot
  }

  private pickRandom<T>(items: T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty list")
    }
    const index = Math.floor(Math.random() * items.length)
    const selected = items[index]
    if (selected !== undefined) return selected
    const fallback = items[0]
    if (fallback === undefined) {
      throw new Error("Failed to select a random value")
    }
    return fallback
  }
}
