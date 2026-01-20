import blessed from "blessed"
import * as contrib from "blessed-contrib"
import { BaseWidget, type WidgetConfig } from "./base.widget.js"
import { TABLE_COLUMN_WIDTHS } from "../table-columns.js"

import { formatPairLabel, parsePairKey } from "../../utils/mints.js"
import type { DexId } from "../../types/stream.types.js"

export interface PriceData {
  pairKey: string
  pairLabel: string
  price: number
  dex: DexId
  slot: number
  changePct?: number | undefined
}

export interface PriceTickerConfig extends WidgetConfig {
  pairs: string[]
}

export class PriceTickerWidget extends BaseWidget {
  private table: ReturnType<typeof contrib.table> | null = null
  private prices: Map<string, PriceData> = new Map()
  private pairs: string[]
  private rowOrder: string[] = []

  constructor(config: PriceTickerConfig) {
    super(config)
    this.pairs = config.pairs
  }

  render(): void {
    if (this.table) {
      this.element = this.table
      this.updateTable()
      return
    }

    this.table = contrib.table({
      keys: true,
      fg: this.theme.colors.foreground,
      selectedFg: this.theme.colors.background,
      selectedBg: this.theme.colors.primary,
      label: " Price Ticker (token-ticker) [t] [enter] [x/X] ",
      border: { type: "line" },
      columnSpacing: 3,
      columnWidth: TABLE_COLUMN_WIDTHS.priceTicker,
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

  update(data: PriceData | PriceData[]): void {
    const items = Array.isArray(data) ? data : [data]

    for (const item of items) {
      this.prices.set(item.pairKey, item)
      if (!this.pairs.includes(item.pairKey)) {
        this.pairs.push(item.pairKey)
      }
    }

    this.updateTable()
    this.emit("update")
  }

  private updateTable(): void {
    if (!this.table) return

    const rows: string[][] = []

    const pairKeys = this.pairs.length > 0 ? this.pairs : Array.from(this.prices.keys())
    this.rowOrder = pairKeys

    for (const pairKey of pairKeys) {
      const data = this.prices.get(pairKey)
      const label = data?.pairLabel ?? this.formatPairKey(pairKey)
      if (data) {
        const change = data.changePct
        const changeLabel =
          change === undefined
            ? "-"
            : this.colorizeChangeAnsi(change, `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`)
        rows.push([
          label,
          `$${this.formatPrice(data.price)}`,
          changeLabel,
          this.formatDexLabel(data.dex),
          String(data.slot)
        ])
      } else {
        rows.push([label, "-", "-", "-", "-"])
      }
    }

    this.table.setData({
      headers: ["Pair", "Price", "Change", "DEX", "Slot"],
      data: rows
    })

    this.screen.render()
  }

  getSelectedPair(): { pairKey: string; data?: PriceData } | null {
    if (!this.table || this.rowOrder.length === 0) return null
    const selected = this.getSelectedIndex()
    if (selected === null) return null
    const pairKey = this.rowOrder[selected]
    if (!pairKey) return null
    const data = this.prices.get(pairKey)
    return data ? { pairKey, data } : { pairKey }
  }

  private getSelectedIndex(): number | null {
    const table = this.table as unknown as { rows?: blessed.Widgets.ListElement }
    const rows = table?.rows
    if (!rows) return null
    const selected = (rows as unknown as { selected?: number }).selected
    return typeof selected === "number" ? selected : null
  }

  private formatPairKey(value: string): string {
    const parsed = parsePairKey(value)
    if (!parsed) return value
    return formatPairLabel(parsed.baseMint, parsed.quoteMint)
  }
}
