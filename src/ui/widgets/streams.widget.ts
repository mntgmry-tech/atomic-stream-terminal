import * as contrib from "blessed-contrib"
import blessed from "blessed"
import { BaseWidget, type WidgetConfig } from "./base.widget.js"
import { TABLE_COLUMN_WIDTHS } from "../table-columns.js"
import type { StreamId } from "../../types/stream.types.js"

export type StreamStatusRow = {
  streamId: StreamId
  enabled: boolean
  connected: boolean
  watchedAccounts?: number | undefined
  watchedMints?: number | undefined
}

export interface StreamsWidgetConfig extends WidgetConfig {
  title?: string
}

export class StreamsWidget extends BaseWidget {
  private table: ReturnType<typeof contrib.table> | null = null
  private rows: StreamStatusRow[] = []
  private rowOrder: StreamId[] = []
  private title: string

  constructor(config: StreamsWidgetConfig) {
    super(config)
    this.title = config.title ?? " Streams [w] [enter] "
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
      columnWidth: TABLE_COLUMN_WIDTHS.streams,
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

  update(data: StreamStatusRow[] | StreamStatusRow): void {
    const rows = Array.isArray(data) ? data : [data]
    const next = new Map<StreamId, StreamStatusRow>()
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

  setRows(rows: StreamStatusRow[]): void {
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

    const data = this.rows.map((row) => {
      const enabledLabel = row.enabled
        ? this.colorizeAnsi("on", this.theme.colors.success)
        : this.colorizeAnsi("off", this.theme.colors.muted)
      const connectedLabel = row.connected
        ? this.colorizeAnsi("up", this.theme.colors.success)
        : this.colorizeAnsi("down", this.theme.colors.danger)
      const accounts = row.watchedAccounts !== undefined ? String(row.watchedAccounts) : "-"
      const mints = row.watchedMints !== undefined ? String(row.watchedMints) : "-"
      return [row.streamId, enabledLabel, connectedLabel, `${accounts}/${mints}`]
    })

    this.table.setData({
      headers: ["Stream", "On", "Conn", "A/M"],
      data
    })

    this.screen.render()
  }
}
