import * as contrib from "blessed-contrib"
import blessed from "blessed"
import { BaseWidget, type WidgetConfig } from "./base.widget.js"
import { SWAP_FEED_COLUMNS, TABLE_COLUMN_WIDTHS } from "../table-columns.js"
import { formatMint } from "../../utils/mints.js"
import type { WsSwapQuoteEvent } from "../../types/stream.types.js"

export interface SwapFeedConfig extends WidgetConfig {
  maxItems?: number
  title?: string
}

export class SwapFeedWidget extends BaseWidget {
  private table: ReturnType<typeof contrib.table> | null = null
  private maxItems: number
  private swaps: WsSwapQuoteEvent[] = []
  private title: string
  private rowOrder: WsSwapQuoteEvent[] = []

  constructor(config: SwapFeedConfig) {
    super(config)
    this.maxItems = config.maxItems ?? 100
    this.title = config.title ?? " Swap Quotes (swap-quotes) [q] [enter] [x/X] "
  }

  render(): void {
    if (this.table) {
      this.element = this.table
      this.updateTable()
      return
    }

    this.table = contrib.table({
      fg: this.theme.colors.foreground,
      selectedFg: this.theme.colors.background,
      selectedBg: this.theme.colors.primary,
      label: this.title,
      border: { type: "line" },
      columnSpacing: 3,
      columnWidth: TABLE_COLUMN_WIDTHS.swapFeed,
      keys: true,
      mouse: true,
      tags: true
    })

    this.element = this.table
    this.updateTable()
  }

  bindTable(table: ReturnType<typeof contrib.table>): void {
    this.table = table
    this.element = table
    this.updateTable()
  }

  update(swap: WsSwapQuoteEvent): void {
    if (!this.table) return

    this.swaps.unshift(swap)
    if (this.swaps.length > this.maxItems) {
      this.swaps.pop()
    }

    this.updateTable()
    this.emit("update")
  }

  getSelectedSwap(): WsSwapQuoteEvent | null {
    if (!this.table || this.rowOrder.length === 0) return null
    const selected = this.getSelectedIndex()
    if (selected === null) return null
    return this.rowOrder[selected] ?? null
  }

  private getSelectedIndex(): number | null {
    const table = this.table as unknown as { rows?: blessed.Widgets.ListElement }
    const rows = table?.rows
    if (!rows) return null
    const selected = (rows as unknown as { selected?: number }).selected
    return typeof selected === "number" ? selected : null
  }

  private updateTable(): void {
    if (!this.table) return

    this.rowOrder = [...this.swaps]

    const rows = this.swaps.map((swap) => this.formatSwapRow(swap))

    this.table.setData({
      headers: ["Time", "DEX", "In", "Out", "Price", "USDC"],
      data: rows
    })

    this.screen.render()
  }

  private formatSwapRow(swap: WsSwapQuoteEvent): string[] {
    const time = this.formatTime(new Date())
    const dexLabel = this.formatDexLabel(swap.dex, swap.router)
    const tokenIn = swap.tokenIn ?? swap.baseMint
    const tokenOut = swap.tokenOut ?? swap.quoteMint
    const amountIn = swap.amountInUi ?? swap.amountIn ?? swap.baseAmountUi ?? swap.baseAmount
    const amountOut = swap.amountOutUi ?? swap.amountOut ?? swap.quoteAmountUi ?? swap.quoteAmount
    const inLabel = this.formatAmount(
      amountIn,
      tokenIn,
      SWAP_FEED_COLUMNS.tokenIn
    )
    const outLabel = this.formatAmount(
      amountOut,
      tokenOut,
      SWAP_FEED_COLUMNS.tokenOut
    )
    const price = swap.executionPrice ?? swap.price
    const priceLabel = this.formatNumericColumn(
      price !== undefined ? this.formatPrice(price) : "-",
      SWAP_FEED_COLUMNS.price
    )
    const notional = this.formatNumericColumn(
      swap.notionalUsd !== undefined ? `$${swap.notionalUsd.toFixed(6)}` : "-",
      SWAP_FEED_COLUMNS.usd
    )

    return [time, dexLabel, inLabel, outLabel, priceLabel, notional]
  }

  private formatAmount(amount: string | undefined, token: string, maxWidth: number): string {
    const value = amount ?? "-"
    const tokenLabel = formatMint(token)
    const reserved = tokenLabel ? tokenLabel.length + 1 : 0
    const valueWidth = Math.max(0, maxWidth - reserved)
    const trimmedValue = valueWidth > 0 ? this.trimValue(String(value), valueWidth) : ""
    const combined = `${trimmedValue} ${tokenLabel}`.trim()
    return this.trimValue(combined, maxWidth)
  }

  private trimValue(value: string, max: number): string {
    if (value.length <= max) return value
    return value.slice(0, max)
  }

  private formatNumericColumn(value: string, maxWidth: number): string {
    const trimmed = this.trimValue(value, maxWidth)
    return this.padLeft(trimmed, maxWidth)
  }

  private padLeft(value: string, width: number): string {
    if (value.length >= width) return value
    return " ".repeat(width - value.length) + value
  }

  private formatTime(value: Date): string {
    return value.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    })
  }

  clear(): void {
    this.swaps = []
    this.rowOrder = []
    if (!this.table) return
    this.table.setData({
      headers: ["Time", "DEX", "In", "Out", "Price", "USDC"],
      data: []
    })
    this.emit("update")
  }
}
