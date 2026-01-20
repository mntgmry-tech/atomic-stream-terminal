import * as contrib from "blessed-contrib"
import blessed from "blessed"
import { BaseWidget, type WidgetConfig } from "./base.widget.js"

export interface SparklineConfig extends WidgetConfig {
  title: string
  maxDataPoints?: number
}

export interface SparklineData {
  label: string
  values: number[]
}

export class SparklineWidget extends BaseWidget {
  private sparkline: ReturnType<typeof contrib.sparkline> | null = null
  private maxDataPoints: number
  private data: Map<string, number[]> = new Map()
  private title: string

  constructor(config: SparklineConfig) {
    super(config)
    this.title = config.title
    this.maxDataPoints = config.maxDataPoints ?? 60
  }

  render(): void {
    if (this.sparkline) {
      this.element = this.sparkline
      return
    }

    this.sparkline = contrib.sparkline({
      label: ` ${this.title} `,
      tags: true,
      style: { fg: this.theme.colors.primary, titleFg: this.theme.colors.foreground },
      border: { type: "line" }
    })

    this.element = this.sparkline
  }

  update(data: SparklineData | SparklineData[]): void {
    if (!this.sparkline) return

    const items = Array.isArray(data) ? data : [data]

    for (const item of items) {
      let values = this.data.get(item.label) ?? []
      values = [...values, ...item.values]

      if (values.length > this.maxDataPoints) {
        values = values.slice(-this.maxDataPoints)
      }

      this.data.set(item.label, values)
    }

    const titles = Array.from(this.data.keys())
    const dataArrays = Array.from(this.data.values())

    this.sparkline.setData(titles, dataArrays)
    this.screen.render()
    this.emit("update")
  }

  addValue(label: string, value: number): void {
    this.update({ label, values: [value] })
  }

  clear(): void {
    this.data.clear()
    if (this.sparkline) {
      this.sparkline.setData([], [])
      this.screen.render()
    }
  }
}
