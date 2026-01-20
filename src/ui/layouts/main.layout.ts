import blessed from "blessed"
import * as contrib from "blessed-contrib"
import type { Theme } from "../themes/dark.theme.js"
import { TABLE_COLUMN_WIDTHS } from "../table-columns.js"
import { PriceTickerWidget } from "../widgets/price-ticker.widget.js"
import { SwapFeedWidget } from "../widgets/swap-feed.widget.js"
import { PoolReservesWidget } from "../widgets/pool-reserves.widget.js"
import { PoolListWidget } from "../widgets/pool-list.widget.js"
import { StatsBoxWidget } from "../widgets/stats-box.widget.js"
import { StreamsWidget } from "../widgets/streams.widget.js"
import { X402SpendWidget } from "../widgets/x402-spend.widget.js"

export interface LayoutWidgets {
  priceTicker: PriceTickerWidget
  swapQuotes: SwapFeedWidget
  swapAlerts: SwapFeedWidget
  poolReserves: PoolReservesWidget
  poolList: PoolListWidget
  statsBox: StatsBoxWidget
  streams: StreamsWidget
  spendTracker: X402SpendWidget
}

export interface MainLayoutConfig {
  screen: blessed.Widgets.Screen
  theme: Theme
  pairs: string[]
}

export function createMainLayout(config: MainLayoutConfig): LayoutWidgets {
  const { screen, theme, pairs } = config

  const grid = new contrib.grid({
    rows: 12,
    cols: 12,
    screen
  })

  const priceTickerElement = grid.set(0, 0, 3, 4, contrib.table, {
    keys: true,
    fg: theme.colors.foreground,
    selectedFg: theme.colors.background,
    selectedBg: theme.colors.primary,
    label: " Price Ticker (token-ticker) [t] [enter] [x/X] ",
    border: { type: "line" },
    columnSpacing: 3,
    columnWidth: TABLE_COLUMN_WIDTHS.priceTicker,
    mouse: true,
    tags: true
  })

  const statsBoxElement = grid.set(0, 4, 3, 2, blessed.box, {
    label: " Dashboard Stats [?] [d] ",
    border: { type: "line" },
    style: { border: { fg: theme.colors.border } },
    tags: true,
    padding: { left: 1, right: 1 },
    keys: true,
    mouse: true
  })

  const spendTrackerElement = grid.set(0, 6, 3, 2, contrib.table, {
    keys: true,
    fg: theme.colors.foreground,
    selectedFg: theme.colors.background,
    selectedBg: theme.colors.primary,
    label: " x402 Spend [u] ",
    border: { type: "line" },
    columnSpacing: 3,
    columnWidth: TABLE_COLUMN_WIDTHS.spendTracker,
    mouse: true,
    tags: true
  })

  const poolReservesElement = grid.set(3, 0, 3, 6, contrib.table, {
    keys: true,
    fg: theme.colors.foreground,
    selectedFg: theme.colors.background,
    selectedBg: theme.colors.primary,
    label: " Pool Reserves (pool-reserves) [r] [enter] [x/X] ",
    border: { type: "line" },
    columnSpacing: 3,
    columnWidth: TABLE_COLUMN_WIDTHS.poolReserves,
    mouse: true,
    tags: true
  })

  const poolListElement = grid.set(3, 6, 3, 6, contrib.table, {
    keys: true,
    fg: theme.colors.foreground,
    selectedFg: theme.colors.background,
    selectedBg: theme.colors.primary,
    label: " Pool Creations (pool-creations) [l] [enter] [x/X] ",
    border: { type: "line" },
    columnSpacing: 3,
    columnWidth: TABLE_COLUMN_WIDTHS.poolList,
    mouse: true,
    tags: true
  })

  const streamsElement = grid.set(0, 8, 3, 4, contrib.table, {
    keys: true,
    fg: theme.colors.foreground,
    selectedFg: theme.colors.background,
    selectedBg: theme.colors.primary,
    label: " Streams [w] [enter] ",
    border: { type: "line" },
    columnSpacing: 3,
    columnWidth: TABLE_COLUMN_WIDTHS.streams,
    mouse: true,
    tags: true
  })

  const swapQuotesElement = grid.set(6, 0, 6, 6, contrib.table, {
    keys: true,
    fg: theme.colors.foreground,
    selectedFg: theme.colors.background,
    selectedBg: theme.colors.primary,
    label: " Swap Quotes (swap-quotes) [q] [enter] [x/X] ",
    border: { type: "line" },
    columnSpacing: 3,
    columnWidth: TABLE_COLUMN_WIDTHS.swapFeed,
    mouse: true,
    tags: true
  })

  const swapAlertsElement = grid.set(6, 6, 6, 6, contrib.table, {
    keys: true,
    fg: theme.colors.foreground,
    selectedFg: theme.colors.background,
    selectedBg: theme.colors.primary,
    label: " Swap Alerts (swap-alerts) [a] [enter] [x/X] ",
    border: { type: "line" },
    columnSpacing: 3,
    columnWidth: TABLE_COLUMN_WIDTHS.swapFeed,
    mouse: true,
    tags: true
  })

  const priceTicker = new PriceTickerWidget({ screen, theme, pairs })
  const swapQuotes = new SwapFeedWidget({
    screen,
    theme,
    title: " Swap Quotes (swap-quotes) [q] [enter] [x/X] "
  })
  const swapAlerts = new SwapFeedWidget({
    screen,
    theme,
    title: " Swap Alerts (swap-alerts) [a] [enter] [x/X] "
  })
  const poolReserves = new PoolReservesWidget({ screen, theme })
  const poolList = new PoolListWidget({ screen, theme })
  const statsBox = new StatsBoxWidget({ screen, theme, title: "Dashboard Stats" })
  const streams = new StreamsWidget({ screen, theme, title: " Streams [w] [enter] " })
  const spendTracker = new X402SpendWidget({ screen, theme, title: " x402 Spend [u] " })

  priceTicker.bindTable(priceTickerElement)
  swapQuotes.bindTable(swapQuotesElement)
  swapAlerts.bindTable(swapAlertsElement)
  poolReserves.bindTable(poolReservesElement)
  poolList.bindTable(poolListElement)
  statsBox.bindBox(statsBoxElement)
  streams.bindTable(streamsElement)
  spendTracker.bindTable(spendTrackerElement)

  return {
    priceTicker,
    swapQuotes,
    swapAlerts,
    poolReserves,
    poolList,
    statsBox,
    streams,
    spendTracker
  }
}
