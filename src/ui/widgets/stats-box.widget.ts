import blessed from "blessed"
import { BaseWidget, type WidgetConfig } from "./base.widget.js"

export interface StatItem {
  label: string
  value: string | number
  change?: number
  color?: string
}

export interface StatsBoxConfig extends WidgetConfig {
  title: string
}

export class StatsBoxWidget extends BaseWidget {
  private box: blessed.Widgets.BoxElement | null = null
  private stats: StatItem[] = []
  private title: string

  constructor(config: StatsBoxConfig) {
    super(config)
    this.title = config.title
  }

  render(): void {
    if (this.box) {
      this.element = this.box
      return
    }

    this.box = blessed.box({
      label: ` ${this.title} `,
      border: { type: "line" },
      style: {
        border: { fg: this.theme.colors.border },
        label: { fg: this.theme.colors.foreground }
      },
      tags: true,
      padding: { left: 1, right: 1 },
      keys: true,
      mouse: true
    })

    this.element = this.box
  }

  bindBox(box: blessed.Widgets.BoxElement): void {
    this.box = box
    this.element = box
  }

  update(stats: StatItem[]): void {
    if (!this.box) return

    this.stats = stats

    const lines: string[] = []

    for (const stat of stats) {
      let line = `{${this.theme.colors.muted}-fg}${stat.label}:{/${this.theme.colors.muted}-fg} `

      const valueColor = stat.color ?? this.theme.colors.foreground
      const value = typeof stat.value === "number" ? this.formatNumber(stat.value) : stat.value
      line += `{${valueColor}-fg}${value}{/${valueColor}-fg}`

      if (stat.change !== undefined) {
        const changeStr = this.colorizeChange(stat.change)
        line += ` (${changeStr})`
      }

      lines.push(line)
    }

    this.box.setContent(lines.join("\n"))
    this.screen.render()
    this.emit("update")
  }

  setStat(label: string, value: string | number, change?: number): void {
    const existing = this.stats.find((stat) => stat.label === label)
    if (existing) {
      existing.value = value
      if (change === undefined) {
        delete existing.change
      } else {
        existing.change = change
      }
    } else {
      const next: StatItem = { label, value }
      if (change !== undefined) {
        next.change = change
      }
      this.stats.push(next)
    }
    this.update(this.stats)
  }
}
