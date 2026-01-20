import * as contrib from "blessed-contrib"
import blessed from "blessed"
import { BaseWidget, type WidgetConfig } from "./base.widget.js"
import { TABLE_COLUMN_WIDTHS } from "../table-columns.js"
import { formatMint } from "../../utils/mints.js"
import type { WsPoolCreatedEvent } from "../../types/stream.types.js"

export interface PoolListConfig extends WidgetConfig {
  maxPools?: number
}

export class PoolListWidget extends BaseWidget {
  private table: ReturnType<typeof contrib.table> | null = null
  private pools: WsPoolCreatedEvent[] = []
  private maxPools: number
  private rowOrder: WsPoolCreatedEvent[] = []

  constructor(config: PoolListConfig) {
    super(config)
    this.maxPools = config.maxPools ?? 20
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
      label: " Pool Creations (pool-creations) [l] [enter] [x/X] ",
      border: { type: "line" },
      columnSpacing: 3,
      columnWidth: TABLE_COLUMN_WIDTHS.poolList,
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

  update(pool: WsPoolCreatedEvent): void {
    this.pools.unshift(pool)

    if (this.pools.length > this.maxPools) {
      this.pools.pop()
    }

    this.updateTable()
    this.emit("update")
  }

  private updateTable(): void {
    if (!this.table) return

    this.rowOrder = [...this.pools]

    const rows: string[][] = this.pools.map((pool) => {
      const pair = `${formatMint(pool.baseMint)}/${formatMint(pool.quoteMint)}`
      const address = pool.pool.slice(0, 8) + "..."
      return [this.formatDexLabel(pool.dex), pair, address, String(pool.slot)]
    })

    this.table.setData({
      headers: ["DEX", "Pair", "Pool", "Slot"],
      data: rows
    })

    this.screen.render()
  }

  getSelectedPool(): WsPoolCreatedEvent | null {
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
