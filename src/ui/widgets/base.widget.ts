import blessed from "blessed"
import chalk from "chalk"
import { EventEmitter } from "eventemitter3"
import type { DexId, DexRouter } from "../../types/stream.types.js"
import type { Theme } from "../themes/dark.theme.js"

export interface WidgetEvents {
  update: () => void
  focus: () => void
  blur: () => void
}

export interface WidgetConfig {
  screen: blessed.Widgets.Screen
  theme: Theme
  label?: string
  border?: boolean
}

export abstract class BaseWidget extends EventEmitter<WidgetEvents> {
  protected screen: blessed.Widgets.Screen
  protected theme: Theme
  protected element: blessed.Widgets.BoxElement | null = null
  protected updateInterval: NodeJS.Timeout | null = null
  protected isVisible = true

  constructor(config: WidgetConfig) {
    super()
    this.screen = config.screen
    this.theme = config.theme
  }

  abstract render(): void
  abstract update(data: unknown): void

  show(): void {
    if (this.element) {
      this.element.show()
      this.isVisible = true
      this.screen.render()
    }
  }

  hide(): void {
    if (this.element) {
      this.element.hide()
      this.isVisible = false
      this.screen.render()
    }
  }

  focus(): void {
    if (this.element) {
      this.element.focus()
      this.emit("focus")
    }
  }

  destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
    }
    if (this.element) {
      this.element.destroy()
    }
  }

  getElement(): blessed.Widgets.BoxElement | null {
    return this.element
  }

  protected formatNumber(value: number, decimals = 2): string {
    if (Math.abs(value) >= 1_000_000_000) {
      return (value / 1_000_000_000).toFixed(decimals) + "B"
    }
    if (Math.abs(value) >= 1_000_000) {
      return (value / 1_000_000).toFixed(decimals) + "M"
    }
    if (Math.abs(value) >= 1_000) {
      return (value / 1_000).toFixed(decimals) + "K"
    }
    return value.toFixed(decimals)
  }

  protected formatPrice(value: number): string {
    if (value === 0) return "0"
    const abs = Math.abs(value)
    if (abs < 0.0001) return value.toFixed(8)
    if (abs < 1) return value.toFixed(6)
    if (abs < 100) return value.toFixed(4)
    return value.toFixed(2)
  }

  protected colorize(text: string, color: string): string {
    return `{${color}-fg}${text}{/${color}-fg}`
  }

  protected colorizeChange(value: number, text?: string): string {
    const displayText = text ?? this.formatNumber(value)
    if (value > 0) return this.colorize(`+${displayText}`, this.theme.colors.success)
    if (value < 0) return this.colorize(displayText, this.theme.colors.danger)
    return displayText
  }

  protected colorizeAnsi(text: string, color: string): string {
    return this.applyAnsiColor(color, text)
  }

  protected colorizeChangeAnsi(value: number, text?: string): string {
    const displayText = text ?? this.formatNumber(value)
    if (value > 0) return this.colorizeAnsi(`+${displayText}`, this.theme.colors.success)
    if (value < 0) return this.colorizeAnsi(displayText, this.theme.colors.danger)
    return displayText
  }

  protected formatDexLabel(dex: DexId, router?: DexRouter): string {
    const label = this.getDexLabel(dex)
    const coloredDex = this.colorizeAnsi(label, this.dexColor(dex))
    if (router === "jupiter") {
      const routerLabel = this.colorizeAnsi("JUP", this.theme.colors.primary)
      return `${routerLabel}/${coloredDex}`
    }
    return coloredDex
  }

  protected getDexLabel(dex: DexId): string {
    const labels: Record<DexId, string> = {
      raydium: "RAY",
      orca: "ORCA",
      meteora: "MET",
      pumpfun: "PUMP"
    }
    return labels[dex] ?? dex.toUpperCase()
  }

  protected dexColor(dex: DexId): string {
    switch (dex) {
      case "raydium":
        return this.theme.colors.info
      case "orca":
        return this.theme.colors.secondary
      case "meteora":
        return this.theme.colors.warning
      case "pumpfun":
        return this.theme.colors.success
      default:
        return this.theme.colors.foreground
    }
  }

  private applyAnsiColor(color: string, text: string): string {
    const normalized = color.trim().toLowerCase()
    if (normalized.startsWith("#")) {
      return chalk.hex(normalized)(text)
    }

    const palette: Record<string, (value: string) => string> = {
      black: chalk.black,
      red: chalk.red,
      green: chalk.green,
      yellow: chalk.yellow,
      blue: chalk.blue,
      magenta: chalk.magenta,
      cyan: chalk.cyan,
      white: chalk.white,
      gray: chalk.gray,
      grey: chalk.gray
    }

    const fn = palette[normalized]
    if (fn) {
      return fn(text)
    }

    return text
  }
}
