import blessed from "blessed"

export interface ScreenConfig {
  title?: string
  smartCSR?: boolean
  fullUnicode?: boolean
  debug?: boolean
}

export function createScreen(config: ScreenConfig = {}): blessed.Widgets.Screen {
  const screen = blessed.screen({
    smartCSR: config.smartCSR ?? true,
    fullUnicode: config.fullUnicode ?? true,
    title: config.title ?? "Stream Dashboard",
    debug: config.debug ?? false,
    dockBorders: true,
    autoPadding: true,
    keys: true,
    mouse: true,
    input: process.stdin,
    output: process.stdout,
    terminal: "xterm-256color",
    sendFocus: true
  })

  screen.key(["C-c"], () => {
    process.exit(0)
  })

  screen.enableInput()

  screen.on("resize", () => {
    screen.render()
  })

  return screen
}

export function setupScreenErrorHandling(screen: blessed.Widgets.Screen): void {
  process.on("uncaughtException", (err) => {
    screen.destroy()
    console.error("Uncaught Exception:", err)
    process.exit(1)
  })

  process.on("unhandledRejection", (reason) => {
    screen.destroy()
    console.error("Unhandled Rejection:", reason)
    process.exit(1)
  })
}
