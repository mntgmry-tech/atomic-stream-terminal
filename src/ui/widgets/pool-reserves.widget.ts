import * as contrib from "blessed-contrib"
import blessed from "blessed"
import { BaseWidget, type WidgetConfig } from "./base.widget.js"
import { TABLE_COLUMN_WIDTHS } from "../table-columns.js"
import { formatMint } from "../../utils/mints.js"
import type { WsPoolReservesEvent } from "../../types/stream.types.js"

export interface PoolReservesConfig extends WidgetConfig {
  maxRows?: number
}

export class PoolReservesWidget extends BaseWidget {
  private table: ReturnType<typeof contrib.table> | null = null
  private maxRows: number
  private rows: Map<string, WsPoolReservesEvent> = new Map()
  private rowOrder: WsPoolReservesEvent[] = []

  constructor(config: PoolReservesConfig) {
    super(config)
    this.maxRows = config.maxRows ?? 20
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
      label: " Pool Reserves (pool-reserves) [r] [enter] [x/X] ",
      border: { type: "line" },
      columnSpacing: 3,
      columnWidth: TABLE_COLUMN_WIDTHS.poolReserves,
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

  update(event: WsPoolReservesEvent): void {
    this.rows.set(event.pool, event)
    this.updateTable()
    this.emit("update")
  }

  private updateTable(): void {
    if (!this.table) return

    const events = [...this.rows.values()]
      .sort((a, b) => b.slot - a.slot)
      .slice(0, this.maxRows)

    this.rowOrder = events

    const rows: string[][] = events.map((event) => {
      const pair = `${formatMint(event.baseMint)}/${formatMint(event.quoteMint)}`
      const base = event.baseAmountUi ?? event.baseAmount
      const quote = event.quoteAmountUi ?? event.quoteAmount
      const price = event.price !== undefined ? this.formatPrice(event.price) : "-"
      return [this.formatDexLabel(event.dex), pair, String(base), String(quote), String(price)]
    })

    this.table.setData({
      headers: ["DEX", "Pair", "Base", "Quote", "Price"],
      data: rows
    })

    this.screen.render()
  }

  getSelectedReserve(): WsPoolReservesEvent | null {
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
}
