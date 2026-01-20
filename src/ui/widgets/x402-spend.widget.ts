import * as contrib from "blessed-contrib"
import blessed from "blessed"
import { BaseWidget, type WidgetConfig } from "./base.widget.js"
import { formatDecimalAmount } from "../../utils/amounts.js"
import { TABLE_COLUMN_WIDTHS } from "../table-columns.js"
import type { StreamId } from "../../types/stream.types.js"

export type X402SpendEntry = {
  streamId: StreamId
  totalRaw: bigint
  assetLabel: string
  decimals: number | null
}

export interface X402SpendConfig extends WidgetConfig {
  title?: string
}

export class X402SpendWidget extends BaseWidget {
  private table: ReturnType<typeof contrib.table> | null = null
  private rows: X402SpendEntry[] = []
  private rowOrder: StreamId[] = []
  private title: string

  constructor(config: X402SpendConfig) {
    super(config)
    this.title = config.title ?? " x402 Spend [u] "
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
      label: this.title,
      border: { type: "line" },
      columnSpacing: 3,
      columnWidth: TABLE_COLUMN_WIDTHS.spendTracker,
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

  update(data: X402SpendEntry[] | X402SpendEntry): void {
    const rows = Array.isArray(data) ? data : [data]
    const next = new Map<StreamId, X402SpendEntry>()
    for (const row of this.rows) {
      next.set(row.streamId, row)
    }
    for (const row of rows) {
      next.set(row.streamId, row)
    }
    this.rows = Array.from(next.values()).sort((a, b) => a.streamId.localeCompare(b.streamId))
    this.updateTable()
    this.emit("update")
  }

  setRows(rows: X402SpendEntry[]): void {
    this.rows = [...rows].sort((a, b) => a.streamId.localeCompare(b.streamId))
    this.updateTable()
    this.emit("update")
  }

  getSelectedStreamId(): StreamId | null {
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

    this.rowOrder = this.rows.map((row) => row.streamId)

    let totalRaw = 0n
    let totalAssetLabel = ""
    let totalDecimals: number | null = null

    const data = this.rows.map((row) => {
      const spentLabel = formatDecimalAmount(row.totalRaw, row.decimals)
      totalRaw += row.totalRaw
      if (!totalAssetLabel) {
        totalAssetLabel = row.assetLabel
      } else if (totalAssetLabel !== row.assetLabel) {
        totalAssetLabel = "MIXED"
      }
      if (totalDecimals === null) {
        totalDecimals = row.decimals
      }
      return [row.streamId, `${spentLabel} ${row.assetLabel}`.trim()]
    })

    const totalLabel = formatDecimalAmount(totalRaw, totalDecimals)
    const totalDisplay = `${totalLabel} ${totalAssetLabel || "USDC"}`.trim()
    data.push(["Total", totalDisplay])

    this.table.setData({
      headers: ["Stream", "Spent"],
      data
    })

    this.screen.render()
  }
}
