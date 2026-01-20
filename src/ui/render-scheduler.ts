import blessed from "blessed"

export class RenderScheduler {
  private screen: blessed.Widgets.Screen
  private pendingRender = false
  private renderTimeout: NodeJS.Timeout | null = null
  private minInterval: number
  private lastRender = 0

  constructor(screen: blessed.Widgets.Screen, minIntervalMs = 50) {
    this.screen = screen
    this.minInterval = minIntervalMs
  }

  scheduleRender(): void {
    if (this.pendingRender) return

    const now = Date.now()
    const timeSinceLastRender = now - this.lastRender

    if (timeSinceLastRender >= this.minInterval) {
      this.render()
    } else {
      this.pendingRender = true
      this.renderTimeout = setTimeout(() => {
        this.render()
      }, this.minInterval - timeSinceLastRender)
    }
  }

  private render(): void {
    this.pendingRender = false
    this.lastRender = Date.now()
    this.screen.render()
  }

  destroy(): void {
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout)
      this.renderTimeout = null
    }
  }
}
