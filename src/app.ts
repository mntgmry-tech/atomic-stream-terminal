import { spawn } from "node:child_process"
import blessed from "blessed"
import { createScreen, setupScreenErrorHandling } from "./ui/screen.js"
import { createMainLayout, type LayoutWidgets } from "./ui/layouts/main.layout.js"
import { DashboardStore, type DashboardStats } from "./state/store.js"
import { StreamClient } from "./data/streams/stream-client.js"
import { createX402Context, fetchStreamChargePreview, type RenewMethod, type X402Context } from "./data/streams/x402.js"
import { PoolLookupClient } from "./data/pools/pool-lookup.js"
import { UpdateBatcher, type UpdateBatch } from "./ui/update-batcher.js"
import { RenderScheduler } from "./ui/render-scheduler.js"
import { FocusManager } from "./ui/focus-manager.js"
import type { PaymentCreatedContext } from "@x402/core/client"
import { parseList, parsePairList } from "./utils/parse.js"
import { formatDecimalAmount, parseBigInt } from "./utils/amounts.js"
import { formatMint, formatPairLabel, pairKey, parsePairKey, resolveMintInput, KNOWN_MINTS } from "./utils/mints.js"
import { isPaymentRequirements, isRecord, isStreamId, type WsTypedEvent } from "./data/streams/protocol.js"
import type { Theme } from "./ui/themes/dark.theme.js"
import type {
  ClientOptions,
  StreamId,
  WsPoolCreatedEvent,
  WsPoolReservesEvent,
  WsStatusEvent,
  WsSwapQuoteEvent,
  WsX402Event
} from "./types/stream.types.js"
import type { PriceData } from "./ui/widgets/price-ticker.widget.js"
import type { StatItem } from "./ui/widgets/stats-box.widget.js"
import type { StreamStatusRow } from "./ui/widgets/streams.widget.js"
import type { X402SpendEntry } from "./ui/widgets/x402-spend.widget.js"

export interface StreamConfig {
  streamId: StreamId
  schemaPath: string
  enabled?: boolean
  watchAccounts?: string[]
  watchPrograms?: string[]
  watchMints?: string[]
  options?: Partial<ClientOptions>
}

export interface AppConfig {
  theme: Theme
  pairs: string[]
  pairFilters?: string[]
  x402: {
    httpBase: string
    privateKey: string
    renewMethod: RenewMethod
    assetDecimals?: number
  }
  poolLookupHttpBase?: string
  streams: StreamConfig[]
}

type DashboardUpdateMap = {
  price: PriceData
  "swap:quote": WsSwapQuoteEvent
  "swap:alert": WsSwapQuoteEvent
  "pool:created": WsPoolCreatedEvent
  "pool:reserves": WsPoolReservesEvent
  stats: DashboardStats
}

type PanelId =
  | "price-ticker"
  | "swap-quotes"
  | "swap-alerts"
  | "pool-reserves"
  | "pool-creations"
  | "streams"
  | "spend-tracker"
  | "stats"

type PanelState = {
  id: PanelId
  streamId?: StreamId
  collapsed: boolean
}

type FocusableWithRows = blessed.Widgets.BoxElement & {
  rows?: blessed.Widgets.ListElement
}

type StreamRuntimeState = {
  streamId: StreamId
  enabled: boolean
  connected: boolean
  watchedAccounts?: number
  watchedMints?: number
  lastError?: string
}

type X402PriceHint = {
  amountRaw: bigint
  asset: string
}

type X402SpendState = {
  totalRaw: bigint
  asset: string
}

type StreamChargePreview = {
  streamId: StreamId
  amountRaw: bigint | null
  asset: string | null
  display: string
}

export class DashboardApp {
  private config: AppConfig
  private screen: blessed.Widgets.Screen
  private widgets!: LayoutWidgets
  private store: DashboardStore
  private streamClients: Map<StreamId, StreamClient> = new Map()
  private streamConfigs: Map<StreamId, StreamConfig> = new Map()
  private streamStates: Map<StreamId, StreamRuntimeState> = new Map()
  private panelStates: Map<PanelId, PanelState> = new Map()
  private panelElements: Map<PanelId, blessed.Widgets.BoxElement> = new Map()
  private pendingCharges: Map<StreamId, X402PriceHint> = new Map()
  private spendTotals: Map<StreamId, X402SpendState> = new Map()
  private x402Context: X402Context | null = null
  private pairFilters: Set<string>
  private watchMints: Set<string>
  private watchSwapPools: Set<string>
  private watchReservePools: Set<string>
  private pendingSwapPoolPairs: string[] = []
  private pendingReservePoolPairs: string[] = []
  private updateBatcher: UpdateBatcher<DashboardUpdateMap>
  private renderScheduler: RenderScheduler
  private focusManager: FocusManager<PanelId>
  private prompt: blessed.Widgets.PromptElement | null = null
  private promptActive = false
  private modalActive = false
  private paused = false
  private focusRenderPending = false
  private latestLeaseToken: string | null = null
  private leaseTokenWaiters: Array<(token: string) => void> = []
  private lastOpenedUrl: string | null = null
  private lastOpenedAt = 0
  private lastEnterAt = 0
  private solPriceUsd: number | null = null
  private poolLookupClient: PoolLookupClient | null = null
  private extraStats: Map<string, StatItem> = new Map()
  private lastStats: DashboardStats | null = null
  private swapQuotesLayout: {
    baseTop: number
    baseHeight: number
    expandedTop: number
    expandedHeight: number
  } | null = null

  constructor(config: AppConfig) {
    this.config = config
    this.screen = createScreen({ title: "Stream Dashboard" })
    this.store = new DashboardStore()
    this.pairFilters = new Set(config.pairFilters ?? [])
    this.watchMints = new Set()
    this.watchSwapPools = new Set()
    this.watchReservePools = new Set()
    this.streamConfigs = new Map(config.streams.map((stream) => [stream.streamId, stream]))
    this.initializePanelStates()
    this.seedWatchlists()

    this.renderScheduler = new RenderScheduler(this.screen, 50)
    this.updateBatcher = new UpdateBatcher<DashboardUpdateMap>((updates) => this.processBatchedUpdates(updates), 100)
    this.focusManager = new FocusManager<PanelId>(this.screen)
    this.poolLookupClient = config.poolLookupHttpBase ? new PoolLookupClient(config.poolLookupHttpBase) : null
    if (this.poolLookupClient) {
      this.poolLookupClient.setLeaseToken(this.latestLeaseToken)
    }

    setupScreenErrorHandling(this.screen)
  }

  async start(): Promise<void> {
    this.widgets = createMainLayout({
      screen: this.screen,
      theme: this.config.theme,
      pairs: this.config.pairs
    })

    this.captureSwapQuotesLayout()
    this.registerFocusableWidgets()
    this.applyInitialPanelState()
    this.setupStoreSubscriptions()
    this.initializePrompt()

    const confirmed = await this.confirmStreamCharges()
    if (!confirmed) {
      this.setAllStreamsDisabled()
      this.setExtraStat("Status", "Charge confirmation declined")
      this.screen.render()
      return
    }

    this.setupKeyboardShortcuts()
    this.setExtraStat("Paused", "No")
    await this.initializeDataSources()
    this.screen.render()
  }

  getStore(): DashboardStore {
    return this.store
  }

  async stop(): Promise<void> {
    for (const client of this.streamClients.values()) {
      client.disconnect()
    }
    this.updateBatcher.destroy()
    this.renderScheduler.destroy()
    this.screen.destroy()
  }

  private initializePanelStates(): void {
    const defaults: PanelState[] = [
      { id: "price-ticker", streamId: "token-ticker", collapsed: false },
      { id: "swap-quotes", streamId: "swap-quotes", collapsed: false },
      { id: "swap-alerts", streamId: "swap-alerts", collapsed: false },
      { id: "pool-reserves", streamId: "pool-reserves", collapsed: true },
      { id: "pool-creations", streamId: "pool-creations", collapsed: false },
      { id: "streams", collapsed: false },
      { id: "spend-tracker", collapsed: false },
      { id: "stats", collapsed: false }
    ]

    for (const panel of defaults) {
      this.panelStates.set(panel.id, panel)
    }
  }

  private applyInitialPanelState(): void {
    for (const state of this.panelStates.values()) {
      if (state.collapsed) {
        this.setPanelCollapsed(state.id, true)
      }
    }
  }

  private captureSwapQuotesLayout(): void {
    const swapElement = this.widgets.swapQuotes.getElement()
    const reservesElement = this.widgets.poolReserves.getElement()
    if (!swapElement || !reservesElement) return

    const baseTop = this.toNumber(swapElement.atop)
    const baseHeight = this.toNumber(swapElement.height)
    const reservesTop = this.toNumber(reservesElement.atop)

    if (baseTop === null || baseHeight === null || reservesTop === null) return

    const expandedHeight = baseTop + baseHeight - reservesTop
    if (expandedHeight <= 0) return

    this.swapQuotesLayout = {
      baseTop,
      baseHeight,
      expandedTop: reservesTop,
      expandedHeight
    }
  }

  private updateSwapQuotesLayout(): void {
    if (!this.swapQuotesLayout) return
    const swapElement = this.widgets.swapQuotes.getElement()
    if (!swapElement) return

    const reservesState = this.panelStates.get("pool-reserves")
    const expandSwapQuotes = reservesState?.collapsed ?? false
    const targetTop = expandSwapQuotes ? this.swapQuotesLayout.expandedTop : this.swapQuotesLayout.baseTop
    const targetHeight = expandSwapQuotes ? this.swapQuotesLayout.expandedHeight : this.swapQuotesLayout.baseHeight

    if (swapElement.top !== targetTop) {
      swapElement.top = targetTop
    }
    if (swapElement.height !== targetHeight) {
      swapElement.height = targetHeight
    }
    swapElement.emit("resize")
  }

  private toNumber(value: number | string): number | null {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null
    }
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  private seedWatchlists(): void {
    for (const stream of this.config.streams) {
      if (stream.watchMints) {
        for (const mint of stream.watchMints) {
          this.watchMints.add(mint)
        }
      }
      if (stream.watchAccounts) {
        const poolIds = stream.watchAccounts.filter((account) => !account.includes("/") && !account.includes(":"))
        if (stream.streamId === "swap-quotes" || stream.streamId === "swap-alerts") {
          for (const account of poolIds) {
            this.watchSwapPools.add(account)
          }
        }
        if (stream.streamId === "pool-reserves") {
          for (const account of poolIds) {
            this.watchReservePools.add(account)
          }
        }
      }
    }
  }

  private registerFocusableWidgets(): void {
    const registrations: Array<{ id: PanelId; element: blessed.Widgets.BoxElement | null }> = [
      { id: "price-ticker", element: this.widgets.priceTicker.getElement() },
      { id: "swap-quotes", element: this.widgets.swapQuotes.getElement() },
      { id: "swap-alerts", element: this.widgets.swapAlerts.getElement() },
      { id: "pool-reserves", element: this.widgets.poolReserves.getElement() },
      { id: "pool-creations", element: this.widgets.poolList.getElement() },
      { id: "streams", element: this.widgets.streams.getElement() },
      { id: "spend-tracker", element: this.widgets.spendTracker.getElement() },
      { id: "stats", element: this.widgets.statsBox.getElement() }
    ]

    for (const { id, element } of registrations) {
      if (element) {
        this.focusManager.register(id, element)
        this.panelElements.set(id, element)
        this.bindPanelFocusStyle(id, element)
      }
    }

    this.applyPanelFocusStyle(this.focusManager.getCurrentId())
  }

  private bindPanelFocusStyle(id: PanelId, element: blessed.Widgets.BoxElement): void {
    const handleFocus = (): void => {
      this.applyPanelFocusStyle(id)
    }

    this.setBorderColor(element, this.config.theme.colors.border)
    element.on("focus", handleFocus)

    const withRows = element as FocusableWithRows
    if (withRows.rows) {
      withRows.rows.on("focus", handleFocus)
    }
  }

  private applyPanelFocusStyle(focusedId: PanelId | null): void {
    for (const [id, element] of this.panelElements.entries()) {
      const color = id === focusedId ? this.getFocusedBorderColor() : this.config.theme.colors.border
      this.setBorderColor(element, color)
    }
    this.scheduleFocusRender()
  }

  private setBorderColor(element: blessed.Widgets.BoxElement, color: string): void {
    if (!element.style) {
      element.style = {}
    }
    if (!element.style.border) {
      element.style.border = {}
    }
    element.style.border.fg = color
  }

  private getFocusedBorderColor(): string {
    return "#ff8800"
  }

  private scheduleFocusRender(): void {
    if (this.focusRenderPending) return
    this.focusRenderPending = true
    setTimeout(() => {
      this.focusRenderPending = false
      this.renderScheduler.scheduleRender()
    }, 0)
  }

  private setupStoreSubscriptions(): void {
    this.store.on("price:update", (data) => this.updateBatcher.add("price", data))
    this.store.on("swap:quote", (swap) => this.updateBatcher.add("swap:quote", swap))
    this.store.on("swap:alert", (swap) => this.updateBatcher.add("swap:alert", swap))
    this.store.on("pool:created", (pool) => this.updateBatcher.add("pool:created", pool))
    this.store.on("pool:reserves", (reserves) => this.updateBatcher.add("pool:reserves", reserves))
    this.store.on("stats:update", (stats) => this.updateBatcher.add("stats", stats))
  }

  private initializePrompt(): void {
    if (this.prompt) return

    this.prompt = blessed.prompt({
      parent: this.screen,
      top: "center",
      left: "center",
      width: "80%",
      height: 9,
      border: { type: "line" },
      label: " Watchlist Input ",
      tags: true,
      hidden: true,
      style: {
        border: { fg: this.config.theme.colors.primary }
      }
    })
  }

  private processBatchedUpdates(updates: UpdateBatch<DashboardUpdateMap>): void {
    let didUpdate = false

    const prices = updates.price
    if (prices && prices.length > 0 && this.isPanelActive("price-ticker")) {
      this.widgets.priceTicker.update(prices)
      didUpdate = true
    }

    const swapQuotes = updates["swap:quote"]
    if (swapQuotes && this.isPanelActive("swap-quotes")) {
      for (const swap of swapQuotes) {
        this.widgets.swapQuotes.update(swap)
      }
      didUpdate = true
    }

    const swapAlerts = updates["swap:alert"]
    if (swapAlerts && this.isPanelActive("swap-alerts")) {
      for (const swap of swapAlerts) {
        this.widgets.swapAlerts.update(swap)
      }
      didUpdate = true
    }

    const pools = updates["pool:created"]
    if (pools && this.isPanelActive("pool-creations")) {
      for (const pool of pools) {
        this.widgets.poolList.update(pool)
      }
      didUpdate = true
    }

    const reserves = updates["pool:reserves"]
    if (reserves && this.isPanelActive("pool-reserves")) {
      for (const reserve of reserves) {
        this.widgets.poolReserves.update(reserve)
      }
      didUpdate = true
    }

    const stats = updates.stats
    if (stats && stats.length > 0) {
      const latestStats = stats[stats.length - 1]
      if (latestStats) {
        this.renderStats(latestStats)
        didUpdate = true
      }
    }

    if (didUpdate) {
      this.renderScheduler.scheduleRender()
    }
  }

  private formatStats(stats: DashboardStats): StatItem[] {
    const largestSwapUsd = stats.largestSwapUsd

    return [
      { label: "Total Swaps", value: stats.totalSwaps },
      { label: "Swap Alerts", value: stats.totalSwapAlerts },
      { label: "Notional (USDC)", value: `$${this.formatNumber(stats.totalNotionalUsd)}` },
      { label: "Swaps/min", value: stats.swapsPerMinute },
      { label: "Alerts/min", value: stats.alertsPerMinute },
      {
        label: "Largest Swap",
        value: largestSwapUsd !== undefined ? `$${this.formatNumber(largestSwapUsd)}` : "-"
      }
    ]
  }

  private renderStats(stats: DashboardStats): void {
    this.lastStats = stats
    const items = [...this.formatStats(stats), ...Array.from(this.extraStats.values())]
    this.widgets.statsBox.update(items)
  }

  private setExtraStat(label: string, value: string | number): void {
    this.extraStats.set(label, { label, value })
    const stats = this.lastStats ?? this.store.getStats()
    this.renderStats(stats)
  }

  private updateLeaseToken(token: string): void {
    this.latestLeaseToken = token
    this.poolLookupClient?.setLeaseToken(token)
    if (this.leaseTokenWaiters.length > 0) {
      const waiters = this.leaseTokenWaiters
      this.leaseTokenWaiters = []
      for (const resolve of waiters) {
        resolve(token)
      }
    }
    if (this.pendingSwapPoolPairs.length > 0 || this.pendingReservePoolPairs.length > 0) {
      void this.resolvePendingPoolPairs()
    }
  }

  private waitForLeaseToken(): Promise<string> {
    if (this.latestLeaseToken) {
      return Promise.resolve(this.latestLeaseToken)
    }
    return new Promise((resolve) => {
      this.leaseTokenWaiters.push(resolve)
    })
  }

  private async confirmStreamCharges(): Promise<boolean> {
    const previews = await this.loadStreamChargePreviews()
    if (previews.length === 0) return true

    const labelWidth = Math.max(6, ...previews.map((preview) => preview.streamId.length))
    const lines: string[] = [
      " Stream Charges (per stream) ",
      "",
      ...previews.map((preview) => `  ${preview.streamId.padEnd(labelWidth)}  ${preview.display}`),
      "",
      ` Total: ${this.formatChargeTotal(previews)}`,
      "",
      " Continue?"
    ]
    const content = lines.join("\n")
    const width = Math.max(
      60,
      ...lines.map((line) => line.length).filter((length) => length > 0).map((length) => length + 4)
    )
    const height = lines.length + 6

    return new Promise((resolve) => {
      let resolved = false
      this.modalActive = true
      const box = blessed.box({
        parent: this.screen,
        top: "center",
        left: "center",
        width,
        height,
        border: { type: "line" },
        label: " Confirm Charges ",
        style: {
          border: { fg: this.config.theme.colors.primary }
        },
        content,
        tags: true
      })

      const buttonWidth = 10
      const buttonGap = 4
      const buttonsWidth = buttonWidth * 2 + buttonGap
      const buttonLeft = Math.max(1, Math.floor((width - buttonsWidth) / 2))

      const yesButton = blessed.button({
        parent: box,
        mouse: true,
        keys: true,
        shrink: true,
        content: " Yes ",
        bottom: 1,
        left: buttonLeft,
        width: buttonWidth,
        height: 1,
        style: {
          fg: this.config.theme.colors.foreground,
          bg: this.config.theme.colors.success,
          focus: { bg: this.config.theme.colors.success, fg: this.config.theme.colors.background }
        }
      })

      const noButton = blessed.button({
        parent: box,
        mouse: true,
        keys: true,
        shrink: true,
        content: " No ",
        bottom: 1,
        left: buttonLeft + buttonWidth + buttonGap,
        width: buttonWidth,
        height: 1,
        style: {
          fg: this.config.theme.colors.foreground,
          bg: this.config.theme.colors.danger,
          focus: { bg: this.config.theme.colors.danger, fg: this.config.theme.colors.background }
        }
      })

      const cleanup = (result: boolean): void => {
        if (resolved) return
        resolved = true
        this.modalActive = false
        box.destroy()
        this.screen.render()
        resolve(result)
      }

      yesButton.on("press", () => cleanup(true))
      noButton.on("press", () => cleanup(false))
      box.key(["enter"], () => yesButton.press())
      box.key(["escape"], () => noButton.press())

      yesButton.focus()
      this.screen.render()
    })
  }

  private async loadStreamChargePreviews(): Promise<StreamChargePreview[]> {
    const targets = this.config.streams.filter((stream) => stream.enabled !== false)
    if (targets.length === 0) return []

    const decimals = this.config.x402.assetDecimals ?? 6
    const previews = await Promise.all(
      targets.map(async (stream) => {
        try {
          const preview = await fetchStreamChargePreview(this.config.x402.httpBase, stream.schemaPath)
          const asset = preview.asset
          const amountRawValue = preview.amountRaw ? parseBigInt(preview.amountRaw) : null
          const assetLabel = asset ? this.formatAssetLabel(asset) : ""
          const display =
            amountRawValue && asset
              ? `${formatDecimalAmount(amountRawValue, decimals)} ${assetLabel}`
              : preview.amountRaw && asset
                ? `${preview.amountRaw} ${assetLabel}`
                : "unknown"
          return {
            streamId: stream.streamId,
            amountRaw: amountRawValue,
            asset,
            display
          }
        } catch (error) {
          return {
            streamId: stream.streamId,
            amountRaw: null,
            asset: null,
            display: "unknown"
          }
        }
      })
    )

    return previews
  }

  private formatChargeTotal(previews: StreamChargePreview[]): string {
    const decimals = this.config.x402.assetDecimals ?? 6
    let totalRaw = 0n
    let asset: string | null = null

    for (const preview of previews) {
      if (preview.amountRaw === null || !preview.asset) {
        return "unknown"
      }
      if (!asset) {
        asset = preview.asset
      } else if (asset !== preview.asset) {
        return "mixed"
      }
      totalRaw += preview.amountRaw
    }

    if (!asset) return "unknown"
    return `${formatDecimalAmount(totalRaw, decimals)} ${this.formatAssetLabel(asset)}`
  }

  private async initializeDataSources(): Promise<void> {
    if (this.config.streams.length === 0) return

    this.x402Context = await createX402Context(this.config.x402.privateKey)
    this.registerX402PaymentHooks(this.x402Context)

    for (const stream of this.config.streams) {
      let watchAccounts = stream.watchAccounts
      if (
        watchAccounts &&
        (stream.streamId === "swap-quotes" || stream.streamId === "swap-alerts" || stream.streamId === "pool-reserves")
      ) {
        const { poolIds, pairInputs } = this.splitPoolInputs(watchAccounts)
        watchAccounts = poolIds
        stream.watchAccounts = poolIds
        if (stream.streamId === "pool-reserves") {
          this.watchReservePools.clear()
          this.mergeNewItems(this.watchReservePools, poolIds)
          this.pendingReservePoolPairs.push(...pairInputs)
        } else {
          this.mergeNewItems(this.watchSwapPools, poolIds)
          this.pendingSwapPoolPairs.push(...pairInputs)
        }
      }

      const enabled = stream.enabled !== false
      this.streamStates.set(stream.streamId, {
        streamId: stream.streamId,
        enabled,
        connected: false
      })
    }

    this.updateStreamsPanel()
    this.updateSpendPanel()

    for (const stream of this.config.streams) {
      if (stream.enabled === false) {
        this.collapsePanelForStream(stream.streamId)
        continue
      }
      await this.enableStream(stream.streamId)
    }

    await this.resolvePendingPoolPairs()
  }

  private registerX402PaymentHooks(ctx: X402Context): void {
    ctx.client.onAfterPaymentCreation(async (context) => {
      try {
        this.recordSchemaSpend(context)
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        this.logError("x402", err)
      }
    })
  }

  private recordSchemaSpend(context: PaymentCreatedContext): void {
    const resourceUrl = this.extractX402ResourceUrl(context)
    if (!resourceUrl) return
    const streamId = this.parseSchemaStreamId(resourceUrl)
    if (!streamId) return
    const charge = this.parsePaymentCharge(context.selectedRequirements)
    if (!charge) return
    this.applySpendCharge(streamId, charge)
  }

  private extractX402ResourceUrl(context: PaymentCreatedContext): string | null {
    const fromRequired = this.extractResourceUrlFromPayload(context.paymentRequired)
    if (fromRequired) return fromRequired
    const fromPayload = this.extractResourceUrlFromPayload(context.paymentPayload)
    if (fromPayload) return fromPayload
    return this.extractResourceUrlFromRequirements(context.selectedRequirements)
  }

  private extractResourceUrlFromPayload(value: unknown): string | null {
    if (!isRecord(value)) return null
    const resource = value.resource
    if (!isRecord(resource)) return null
    return typeof resource.url === "string" ? resource.url : null
  }

  private extractResourceUrlFromRequirements(value: unknown): string | null {
    if (!isRecord(value)) return null
    return typeof value.resource === "string" ? value.resource : null
  }

  private parseSchemaStreamId(resourceUrl: string): StreamId | null {
    const path = this.normalizeResourcePath(resourceUrl)
    if (path.includes("/renew/")) return null
    const marker = "/schema/stream/"
    const idx = path.indexOf(marker)
    if (idx === -1) return null
    const streamId = path.slice(idx + marker.length).split("/")[0]
    if (!streamId) return null
    return isStreamId(streamId) ? streamId : null
  }

  private normalizeResourcePath(resourceUrl: string): string {
    try {
      return new URL(resourceUrl, "http://localhost").pathname
    } catch {
      return resourceUrl
    }
  }

  private parsePaymentCharge(value: unknown): X402PriceHint | null {
    if (!isPaymentRequirements(value)) return null
    const asset = value.asset
    const amount =
      "amount" in value && typeof value.amount === "string"
        ? value.amount
        : "maxAmountRequired" in value && typeof value.maxAmountRequired === "string"
          ? value.maxAmountRequired
          : null
    if (!amount || !asset) return null
    try {
      return { amountRaw: BigInt(amount), asset }
    } catch {
      return null
    }
  }

  private applySpendCharge(streamId: StreamId, charge: X402PriceHint): void {
    const current = this.spendTotals.get(streamId)
    const totalRaw = (current?.totalRaw ?? 0n) + charge.amountRaw
    const asset = current?.asset ?? charge.asset
    this.spendTotals.set(streamId, { totalRaw, asset })
    this.updateSpendPanel()
  }

  private async enableStream(streamId: StreamId): Promise<void> {
    if (this.streamClients.has(streamId)) {
      this.updateStreamState(streamId, { enabled: true })
      return
    }

    const stream = this.streamConfigs.get(streamId)
    if (!stream) {
      this.logError("streams", new Error(`Unknown stream: ${streamId}`))
      return
    }
    if (!this.x402Context) {
      this.logError("streams", new Error("x402 context not initialized"))
      return
    }

    const watchAccounts = this.getWatchAccountsForStream(stream)
    const watchMints = this.getWatchMintsForStream(stream)
    stream.enabled = true

    const client = new StreamClient({
      httpBase: this.config.x402.httpBase,
      schemaPath: stream.schemaPath,
      streamId: stream.streamId,
      renewMethod: this.config.x402.renewMethod,
      x402: this.x402Context,
      ...(watchAccounts && watchAccounts.length > 0 ? { watchAccounts } : {}),
      ...(stream.watchPrograms ? { watchPrograms: stream.watchPrograms } : {}),
      ...(watchMints && watchMints.length > 0 ? { watchMints } : {}),
      ...(stream.options ? { options: stream.options } : {})
    })

    client.on("connected", () => {
      this.updateStreamState(streamId, { connected: true })
    })

    client.on("disconnected", () => {
      this.updateStreamState(streamId, { connected: false })
    })

    client.on("status", (status: WsStatusEvent) => {
      this.setExtraStat("WS Status", status.grpcConnected ? "Connected" : "Degraded")
      this.setExtraStat("Node", status.nodeHealthy ? "Healthy" : "Unhealthy")
      this.setExtraStat("Accounts", status.watchedAccounts)
      this.setExtraStat("Mints", status.watchedMints)
      this.setExtraStat("Status Stream", streamId)
      this.updateStreamState(streamId, {
        watchedAccounts: status.watchedAccounts,
        watchedMints: status.watchedMints
      })
    })

    client.on("x402", (event: WsX402Event) => {
      this.handleX402Event(streamId, event)
    })

    client.on("event", (event: WsTypedEvent) => {
      if (this.paused) return
      this.handleStreamEvent(event)
    })

    client.on("lease", (token) => {
      this.updateLeaseToken(token)
    })

    client.on("error", (err) => {
      this.updateStreamState(streamId, { lastError: err.message })
      this.logError(streamId, err)
    })

    this.streamClients.set(streamId, client)
    this.updateStreamState(streamId, { enabled: true, connected: false })

    try {
      await client.connect()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.updateStreamState(streamId, { lastError: err.message, connected: false })
      this.logError(streamId, err)
    }
  }

  private disableStream(streamId: StreamId): void {
    const stream = this.streamConfigs.get(streamId)
    if (stream) {
      stream.enabled = false
    }
    const client = this.streamClients.get(streamId)
    if (client) {
      client.disconnect()
      this.streamClients.delete(streamId)
    }
    this.pendingCharges.delete(streamId)
    this.updateStreamState(streamId, { enabled: false, connected: false })
  }

  private getWatchAccountsForStream(stream: StreamConfig): string[] | undefined {
    if (stream.streamId === "swap-quotes" || stream.streamId === "swap-alerts") {
      return Array.from(this.watchSwapPools)
    }
    if (stream.streamId === "pool-reserves") {
      return Array.from(this.watchReservePools)
    }
    return stream.watchAccounts
  }

  private getWatchMintsForStream(stream: StreamConfig): string[] | undefined {
    if (stream.streamId === "swap-quotes" || stream.streamId === "swap-alerts" || stream.streamId === "pool-creations") {
      return Array.from(this.watchMints)
    }
    return stream.watchMints
  }

  private updateStreamState(streamId: StreamId, patch: Partial<StreamRuntimeState>): void {
    const existing = this.streamStates.get(streamId) ?? {
      streamId,
      enabled: false,
      connected: false
    }
    const next: StreamRuntimeState = { ...existing, ...patch, streamId }
    this.streamStates.set(streamId, next)
    this.updateStreamsPanel()
    this.updateSpendPanel()
  }

  private updateStreamsPanel(): void {
    if (!this.isPanelActive("streams")) return
    const rows: StreamStatusRow[] = []

    for (const state of this.streamStates.values()) {
      const localCounts = this.getLocalWatchCounts(state.streamId)
      rows.push({
        streamId: state.streamId,
        enabled: state.enabled,
        connected: state.connected,
        watchedAccounts: state.watchedAccounts ?? localCounts.accounts,
        watchedMints: state.watchedMints ?? localCounts.mints
      })
    }

    this.widgets.streams.setRows(rows)
  }

  private getLocalWatchCounts(streamId: StreamId): { accounts?: number; mints?: number } {
    if (streamId === "swap-quotes" || streamId === "swap-alerts") {
      return { accounts: this.watchSwapPools.size, mints: this.watchMints.size }
    }
    if (streamId === "pool-reserves") {
      return { accounts: this.watchReservePools.size }
    }
    if (streamId === "pool-creations") {
      return { mints: this.watchMints.size }
    }
    return {}
  }

  private updateSpendPanel(): void {
    if (!this.isPanelActive("spend-tracker")) return
    const rows: X402SpendEntry[] = []
    const decimals = this.config.x402.assetDecimals ?? 6

    for (const state of this.streamStates.values()) {
      const spend = this.spendTotals.get(state.streamId)
      const asset = spend?.asset ?? "USDC"
      rows.push({
        streamId: state.streamId,
        totalRaw: spend?.totalRaw ?? 0n,
        assetLabel: this.formatAssetLabel(asset),
        decimals
      })
    }

    this.widgets.spendTracker.setRows(rows)
  }

  private setAllStreamsDisabled(): void {
    this.streamStates.clear()
    for (const stream of this.config.streams) {
      this.streamStates.set(stream.streamId, {
        streamId: stream.streamId,
        enabled: false,
        connected: false
      })
    }
    this.updateStreamsPanel()
    this.updateSpendPanel()
  }

  private handleX402Event(streamId: StreamId, event: WsX402Event): void {
    if (event.op === "renewal_reminder" || event.op === "payment_required") {
      const hint = event.renew?.http?.priceHint ?? event.renew?.inband?.priceHint
      if (hint) {
        const parsed = this.parsePriceHint(hint)
        if (parsed) {
          this.pendingCharges.set(streamId, parsed)
          if (!this.spendTotals.has(streamId)) {
            this.spendTotals.set(streamId, { totalRaw: 0n, asset: parsed.asset })
            this.updateSpendPanel()
          }
        }
      }
      return
    }

    if (event.op === "renewed") {
      const pending = this.pendingCharges.get(streamId)
      if (!pending) return
      const current = this.spendTotals.get(streamId) ?? { totalRaw: 0n, asset: pending.asset }
      const totalRaw = current.totalRaw + pending.amountRaw
      this.spendTotals.set(streamId, { totalRaw, asset: pending.asset })
      this.pendingCharges.delete(streamId)
      this.updateSpendPanel()
      return
    }

    if (event.op === "error") {
      this.updateStreamState(streamId, { lastError: event.message })
    }
  }

  private parsePriceHint(hint: string): X402PriceHint | null {
    const parts = hint.trim().split(/\s+/)
    let amount: string | null = null
    let asset: string | null = null

    for (const part of parts) {
      const [key, value] = part.split("=")
      if (!key || !value) continue
      if (key === "amount" || key === "maxAmount") {
        amount = value
      } else if (key === "asset") {
        asset = value
      }
    }

    if (!amount || !asset) return null

    try {
      return { amountRaw: BigInt(amount), asset }
    } catch {
      return null
    }
  }

  private formatAssetLabel(asset: string): string {
    const trimmed = asset.trim()
    if (!trimmed) return "USDC"
    if (trimmed.length <= 8 && !trimmed.includes(":")) {
      return trimmed.toUpperCase()
    }
    return formatMint(trimmed)
  }

  private isPanelActive(panelId: PanelId): boolean {
    const state = this.panelStates.get(panelId)
    return state ? !state.collapsed : true
  }

  private setPanelCollapsed(panelId: PanelId, collapsed: boolean): void {
    const state = this.panelStates.get(panelId)
    if (!state) return
    state.collapsed = collapsed
    const widget = this.getPanelWidget(panelId)
    if (widget) {
      if (collapsed) {
        widget.hide()
      } else {
        widget.show()
      }
    }
    this.focusManager.setEnabled(panelId, !collapsed)
    if (!collapsed) {
      if (panelId === "streams") {
        this.updateStreamsPanel()
      } else if (panelId === "spend-tracker") {
        this.updateSpendPanel()
      }
    }
    if (panelId === "pool-reserves") {
      this.updateSwapQuotesLayout()
    }
    this.renderScheduler.scheduleRender()
  }

  private togglePanelCollapsed(panelId: PanelId): void {
    const state = this.panelStates.get(panelId)
    if (!state) return
    this.setPanelCollapsed(panelId, !state.collapsed)
  }

  private collapsePanelForStream(streamId: StreamId): void {
    const panelId = this.panelIdForStream(streamId)
    if (!panelId) return
    this.setPanelCollapsed(panelId, true)
  }

  private panelIdForStream(streamId: StreamId): PanelId | null {
    switch (streamId) {
      case "token-ticker":
        return "price-ticker"
      case "swap-quotes":
        return "swap-quotes"
      case "swap-alerts":
        return "swap-alerts"
      case "pool-reserves":
        return "pool-reserves"
      case "pool-creations":
        return "pool-creations"
      default:
        return null
    }
  }

  private getPanelWidget(panelId: PanelId): { show: () => void; hide: () => void } | null {
    switch (panelId) {
      case "price-ticker":
        return this.widgets.priceTicker
      case "swap-quotes":
        return this.widgets.swapQuotes
      case "swap-alerts":
        return this.widgets.swapAlerts
      case "pool-reserves":
        return this.widgets.poolReserves
      case "pool-creations":
        return this.widgets.poolList
      case "streams":
        return this.widgets.streams
      case "spend-tracker":
        return this.widgets.spendTracker
      case "stats":
        return this.widgets.statsBox
      default:
        return null
    }
  }

  private toggleFocusedPanelCollapsed(): void {
    const panelId = this.focusManager.getCurrentId()
    if (!panelId) return
    this.togglePanelCollapsed(panelId)
  }

  private toggleFocusedStream(): void {
    const panelId = this.focusManager.getCurrentId()
    if (!panelId) return

    if (panelId === "streams") {
      const selected = this.widgets.streams.getSelectedStreamId()
      if (selected) {
        this.toggleStream(selected)
      }
      return
    }

    const streamId = this.panelStates.get(panelId)?.streamId
    if (streamId) {
      this.toggleStream(streamId)
    }
  }

  private toggleStream(streamId: StreamId): void {
    if (this.isStreamEnabled(streamId)) {
      this.disableStream(streamId)
      this.collapsePanelForStream(streamId)
      this.setActionStat(`Disabled stream: ${streamId}`)
      return
    }

    this.enableStream(streamId).catch((error) => {
      this.logError(streamId, error instanceof Error ? error : new Error(String(error)))
    })
    const panelId = this.panelIdForStream(streamId)
    if (panelId) {
      this.setPanelCollapsed(panelId, false)
    }
    this.setActionStat(`Enabled stream: ${streamId}`)
  }

  private isStreamEnabled(streamId: StreamId): boolean {
    return this.streamStates.get(streamId)?.enabled ?? false
  }

  private handleStreamEvent(event: WsTypedEvent): void {
    if (event.type === "ticker") {
      const baseMint = event.baseMint
      const quoteMint = event.quoteMint
      const price = event.price

      const updates: Array<{ pairKey: string; pairLabel: string; price: number }> = []

      const rawKey = pairKey(baseMint, quoteMint)
      if (quoteMint === KNOWN_MINTS.USDC && this.shouldTrackPair(rawKey, baseMint, quoteMint)) {
        updates.push({
          pairKey: rawKey,
          pairLabel: formatPairLabel(baseMint, quoteMint),
          price
        })
      } else if (this.pairFilters.has(rawKey) && this.shouldTrackPair(rawKey, baseMint, quoteMint)) {
        updates.push({
          pairKey: rawKey,
          pairLabel: formatPairLabel(baseMint, quoteMint),
          price
        })
      }

      if (baseMint === KNOWN_MINTS.USDC && quoteMint === KNOWN_MINTS.SOL && price > 0) {
        const solUsd = 1 / price
        this.solPriceUsd = solUsd
        const solUsdKey = pairKey(KNOWN_MINTS.SOL, KNOWN_MINTS.USDC)
        if (this.shouldTrackPair(solUsdKey, KNOWN_MINTS.SOL, KNOWN_MINTS.USDC)) {
          updates.push({
            pairKey: solUsdKey,
            pairLabel: formatPairLabel(KNOWN_MINTS.SOL, KNOWN_MINTS.USDC),
            price: solUsd
          })
        }
      }

      if (quoteMint === KNOWN_MINTS.SOL && baseMint !== KNOWN_MINTS.USDC && this.solPriceUsd) {
        const usdPrice = price * this.solPriceUsd
        if (Number.isFinite(usdPrice) && usdPrice > 0) {
          const usdKey = pairKey(baseMint, KNOWN_MINTS.USDC)
          if (this.shouldTrackPair(usdKey, baseMint, KNOWN_MINTS.USDC)) {
            updates.push({
              pairKey: usdKey,
              pairLabel: formatPairLabel(baseMint, KNOWN_MINTS.USDC),
              price: usdPrice
            })
          }
        }
      }

      for (const update of updates) {
        this.store.updatePrice({
          pairKey: update.pairKey,
          pairLabel: update.pairLabel,
          price: update.price,
          dex: event.dex,
          slot: event.slot
        })
      }
      return
    }

    if (event.type === "swap-quote") {
      if (event.stream === "swap-quotes") {
        this.store.addSwapQuote(event)
        return
      }
      if (event.stream === "swap-alerts") {
        this.store.addSwapAlert(event)
      }
      return
    }

    if (event.type === "pool-created") {
      this.store.addPool(event)
      return
    }

    if (event.type === "pool-reserves") {
      this.store.updateReserves(event)
    }
  }

  private promptForMints(): void {
    this.openPrompt(" Add Watch Mints ", "Enter token mints (comma or space separated):", (value) => {
      const added = this.addWatchMints(parseList(value).map(resolveMintInput).filter(Boolean))
      if (added === 0) return
    })
  }

  private promptForRemoveMints(): void {
    this.openPrompt(" Remove Watch Mints ", "Enter token mints to remove:", (value) => {
      const removed = this.removeWatchMints(parseList(value).map(resolveMintInput).filter(Boolean))
      if (removed === 0) return
    })
  }

  private promptForSwapPools(): void {
    this.openPrompt(" Add Swap Pools ", "Enter pool addresses or mint pairs (e.g. SOL/USDC):", async (value) => {
      const pools = await this.resolvePoolsFromInput(value)
      const added = this.addWatchSwapPools(pools)
      if (added === 0) return
    })
  }

  private promptForRemoveSwapPools(): void {
    this.openPrompt(" Remove Swap Pools ", "Enter pool addresses or mint pairs to remove:", async (value) => {
      const pools = await this.resolvePoolsFromInput(value)
      const removed = this.removeWatchSwapPools(pools)
      if (removed === 0) return
    })
  }

  private promptForReservePools(): void {
    this.openPrompt(" Add Reserve Pools ", "Enter pool addresses or mint pairs (e.g. SOL/USDC):", async (value) => {
      const pools = await this.resolvePoolsFromInput(value)
      const added = this.addWatchReservePools(pools)
      if (added === 0) return
    })
  }

  private promptForRemoveReservePools(): void {
    this.openPrompt(" Remove Reserve Pools ", "Enter pool addresses or mint pairs to remove:", async (value) => {
      const pools = await this.resolvePoolsFromInput(value)
      const removed = this.removeWatchReservePools(pools)
      if (removed === 0) return
    })
  }

  private openPrompt(title: string, promptText: string, onSubmit: (value: string) => void | Promise<void>): void {
    if (!this.prompt || this.promptActive) return
    this.promptActive = true
    this.prompt.setLabel(` ${title} `)
    this.prompt.readInput(promptText, "", (err, value) => {
      this.promptActive = false
      this.prompt?.hide()
      if (!err) {
        Promise.resolve(onSubmit(value ?? "")).catch((error) => {
          this.logError("prompt", error instanceof Error ? error : new Error(String(error)))
        })
      }
      this.renderScheduler.scheduleRender()
    })
    this.prompt.setFront()
    this.screen.render()
  }

  private addWatchMints(mints: string[]): number {
    const added = this.mergeNewItems(this.watchMints, mints)
    if (added.length === 0) return 0
    this.addMintsToStreams(added)
    this.updateStreamsPanel()
    return added.length
  }

  private addMintsToStreams(mints: string[]): void {
    const targets: StreamId[] = ["swap-quotes", "swap-alerts", "pool-creations"]
    for (const streamId of targets) {
      this.streamClients.get(streamId)?.addMints(mints)
    }
  }

  private addWatchSwapPools(pools: string[]): number {
    const added = this.mergeNewItems(this.watchSwapPools, pools)
    if (added.length === 0) return 0
    this.addSwapPoolsToStreams(added)
    this.updateStreamsPanel()
    return added.length
  }

  private addSwapPoolsToStreams(pools: string[]): void {
    const targets: StreamId[] = ["swap-quotes", "swap-alerts"]
    for (const streamId of targets) {
      this.streamClients.get(streamId)?.addAccounts(pools)
    }
  }

  private addWatchReservePools(pools: string[]): number {
    const added = this.mergeNewItems(this.watchReservePools, pools)
    if (added.length === 0) return 0
    this.addReservePoolsToStreams(added)
    this.updateStreamsPanel()
    return added.length
  }

  private addReservePoolsToStreams(pools: string[]): void {
    const targets: StreamId[] = ["pool-reserves"]
    for (const streamId of targets) {
      this.streamClients.get(streamId)?.addAccounts(pools)
    }
  }

  private removeWatchMints(mints: string[]): number {
    const removed = this.removeItems(this.watchMints, mints)
    if (removed.length === 0) return 0
    this.removeMintsFromStreams(removed)
    this.updateStreamsPanel()
    return removed.length
  }

  private removeMintsFromStreams(mints: string[]): void {
    const targets: StreamId[] = ["swap-quotes", "swap-alerts", "pool-creations"]
    for (const streamId of targets) {
      this.streamClients.get(streamId)?.removeMints(mints)
    }
  }

  private removeWatchSwapPools(pools: string[]): number {
    const removed = this.removeItems(this.watchSwapPools, pools)
    if (removed.length === 0) return 0
    this.removeSwapPoolsFromStreams(removed)
    this.updateStreamsPanel()
    return removed.length
  }

  private removeSwapPoolsFromStreams(pools: string[]): void {
    const targets: StreamId[] = ["swap-quotes", "swap-alerts"]
    for (const streamId of targets) {
      this.streamClients.get(streamId)?.removeAccounts(pools)
    }
  }

  private removeWatchReservePools(pools: string[]): number {
    const removed = this.removeItems(this.watchReservePools, pools)
    if (removed.length === 0) return 0
    this.removeReservePoolsFromStreams(removed)
    this.updateStreamsPanel()
    return removed.length
  }

  private removeReservePoolsFromStreams(pools: string[]): void {
    const targets: StreamId[] = ["pool-reserves"]
    for (const streamId of targets) {
      this.streamClients.get(streamId)?.removeAccounts(pools)
    }
  }

  private splitPoolInputs(values: string[]): { poolIds: string[]; pairInputs: string[] } {
    const poolIds = values.filter((item) => !item.includes("/") && !item.includes(":"))
    const pairInputs = values.filter((item) => item.includes("/") || item.includes(":"))
    return { poolIds, pairInputs }
  }

  private async resolvePendingPoolPairs(): Promise<void> {
    if (!this.poolLookupClient) return
    if (this.pendingSwapPoolPairs.length === 0 && this.pendingReservePoolPairs.length === 0) return
    if (!this.config.streams.some((stream) => stream.enabled !== false)) return

    await this.waitForLeaseToken()

    if (this.pendingSwapPoolPairs.length > 0) {
      const pending = this.pendingSwapPoolPairs
      this.pendingSwapPoolPairs = []
      const resolved = await this.resolvePoolsFromInput(pending)
      if (resolved.length > 0) {
        this.addWatchSwapPools(resolved)
      }
    }

    if (this.pendingReservePoolPairs.length > 0) {
      const pending = this.pendingReservePoolPairs
      this.pendingReservePoolPairs = []
      const resolved = await this.resolvePoolsFromInput(pending)
      if (resolved.length > 0) {
        this.addWatchReservePools(resolved)
      }
    }
  }

  private async resolvePoolsFromInput(value: string | string[]): Promise<string[]> {
    const entries = Array.isArray(value) ? value : parseList(value)
    const { poolIds, pairInputs } = this.splitPoolInputs(entries)

    const pairs = parsePairList(pairInputs.join(","))
      .map((pair) => ({
        baseMint: resolveMintInput(pair.baseMint),
        quoteMint: resolveMintInput(pair.quoteMint)
      }))
      .filter((pair) => pair.baseMint && pair.quoteMint)

    if (pairs.length === 0) {
      return poolIds
    }

    if (!this.poolLookupClient) {
      this.logError("pool-lookup", new Error("Pool lookup is not configured"))
      return poolIds
    }

    if (!this.latestLeaseToken) {
      return poolIds
    }

    const resolved = await this.lookupPoolsForPairs(pairs)
    return this.uniqueList([...poolIds, ...resolved])
  }

  private async lookupPoolsForPairs(pairs: Array<{ baseMint: string; quoteMint: string }>): Promise<string[]> {
    const client = this.poolLookupClient
    if (!client) return []
    const results = await Promise.all(
      pairs.map(async (pair) => {
        try {
          const response = await client.lookupPair(pair.baseMint, pair.quoteMint)
          return response.pools.map((pool) => pool.pool)
        } catch (error) {
          this.logError("pool-lookup", error instanceof Error ? error : new Error(String(error)))
          return []
        }
      })
    )
    return this.uniqueList(results.flat())
  }

  private mergeNewItems(target: Set<string>, incoming: string[]): string[] {
    const added: string[] = []
    for (const item of incoming) {
      if (!target.has(item)) {
        target.add(item)
        added.push(item)
      }
    }
    return added
  }

  private uniqueList(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  }

  private shouldTrackPair(pairKeyValue: string, baseMint: string, quoteMint: string): boolean {
    if (this.pairFilters.size > 0 && !this.pairFilters.has(pairKeyValue)) return false
    if (this.watchMints.size === 0) return true
    return this.watchMints.has(baseMint) || this.watchMints.has(quoteMint)
  }

  private removeItems(target: Set<string>, incoming: string[]): string[] {
    const removed: string[] = []
    for (const item of incoming) {
      if (target.delete(item)) {
        removed.push(item)
      }
    }
    return removed
  }

  private setupKeyboardShortcuts(): void {
    this.screen.on("keypress", (ch, key) => {
      if (this.promptActive || this.modalActive) return

      const rawName = typeof key?.name === "string" ? key.name : ""
      const rawChar = typeof ch === "string" ? ch : ""
      const normalized = (rawName || rawChar).toLowerCase()
      const full = typeof key?.full === "string" ? key.full : normalized
      const sequence = typeof key?.sequence === "string" ? key.sequence : ""
      const isShift = Boolean(key?.shift)
      let handled = false

      if (normalized === "tab" || full === "tab" || sequence === "\t" || full === "C-i") {
        this.focusManager.focusNext()
        handled = true
      } else if (full === "S-tab" || (isShift && normalized === "tab") || sequence === "\x1b[Z") {
        this.focusManager.focusPrevious()
        handled = true
      } else if (normalized === "enter" || full === "enter" || sequence === "\r") {
        if (this.shouldHandleEnter()) {
          this.handleEnterAction()
          handled = true
        }
      } else if (normalized === "x" && !isShift) {
        this.toggleFocusedPanelCollapsed()
        handled = true
      } else if ((normalized === "x" && isShift) || full === "X") {
        this.toggleFocusedStream()
        handled = true
      } else if (normalized === "t") {
        this.focusManager.focusById("price-ticker")
        handled = true
      } else if (normalized === "q") {
        this.focusManager.focusById("swap-quotes")
        handled = true
      } else if (normalized === "a") {
        this.focusManager.focusById("swap-alerts")
        handled = true
      } else if (normalized === "r") {
        this.focusManager.focusById("pool-reserves")
        handled = true
      } else if (normalized === "l") {
        this.focusManager.focusById("pool-creations")
        handled = true
      } else if (normalized === "w") {
        this.focusManager.focusById("streams")
        handled = true
      } else if (normalized === "u") {
        this.focusManager.focusById("spend-tracker")
        handled = true
      } else if (normalized === "d") {
        this.focusManager.focusById("stats")
        handled = true
      } else if (normalized === "c") {
        this.widgets.swapQuotes.clear()
        this.widgets.swapAlerts.clear()
        handled = true
      } else if (normalized === "p") {
        this.paused = !this.paused
        this.setExtraStat("Paused", this.paused ? "Yes" : "No")
        handled = true
      } else if ((normalized === "m" && isShift) || full === "M") {
        this.promptForRemoveMints()
        handled = true
      } else if (normalized === "m") {
        this.promptForMints()
        handled = true
      } else if ((normalized === "s" && isShift) || full === "S") {
        this.promptForRemoveSwapPools()
        handled = true
      } else if (normalized === "s") {
        this.promptForSwapPools()
        handled = true
      } else if ((normalized === "o" && isShift) || full === "O") {
        this.promptForRemoveReservePools()
        handled = true
      } else if (normalized === "o") {
        this.promptForReservePools()
        handled = true
      } else if (normalized === "h" || normalized === "?" || full === "?" || rawChar === "?") {
        this.showHelp()
        handled = true
      }

      if (handled) {
        this.renderScheduler.scheduleRender()
      }
    })
  }

  private handleEnterAction(): void {
    const panelId = this.focusManager.getCurrentId()
    if (!panelId) return

    if (panelId === "price-ticker") {
      const selected = this.widgets.priceTicker.getSelectedPair()
      if (!selected) return
      const parsed = parsePairKey(selected.pairKey)
      if (!parsed) return
      const mint = this.pickInspectMint(parsed.baseMint, parsed.quoteMint)
      if (!mint) return
      this.openSolscanAccount(mint)
      return
    }

    if (panelId === "pool-creations") {
      const pool = this.widgets.poolList.getSelectedPool()
      if (!pool) return
      this.openSolscanAccount(pool.pool)
      return
    }

    if (panelId === "pool-reserves") {
      const reserve = this.widgets.poolReserves.getSelectedReserve()
      if (!reserve) return
      this.openSolscanAccount(reserve.pool)
      return
    }

    if (panelId === "swap-quotes") {
      const swap = this.widgets.swapQuotes.getSelectedSwap()
      if (!swap) return
      this.openSolscanTransaction(swap.signature)
      return
    }

    if (panelId === "swap-alerts") {
      const swap = this.widgets.swapAlerts.getSelectedSwap()
      if (!swap) return
      this.openSolscanTransaction(swap.signature)
      return
    }

    if (panelId === "spend-tracker") {
      this.openExternalUrl("https://atomicstream.net/streams/")
    }
  }

  private shouldHandleEnter(): boolean {
    const now = Date.now()
    if (now - this.lastEnterAt < 250) {
      return false
    }
    this.lastEnterAt = now
    return true
  }

  private pickInspectMint(baseMint: string, quoteMint: string): string | null {
    if (baseMint === KNOWN_MINTS.USDC && quoteMint) return quoteMint
    if (quoteMint === KNOWN_MINTS.USDC && baseMint) return baseMint
    return baseMint || quoteMint || null
  }

  private openSolscanAccount(address: string): void {
    if (!address) return
    this.openExternalUrl(`https://solscan.io/account/${address}`)
  }

  private openSolscanTransaction(signature: string | undefined): void {
    if (!signature) return
    this.openExternalUrl(`https://solscan.io/tx/${signature}`)
  }

  private openExternalUrl(url: string): void {
    const now = Date.now()
    if (this.lastOpenedUrl === url && now - this.lastOpenedAt < 500) {
      return
    }
    this.lastOpenedUrl = url
    this.lastOpenedAt = now

    const platform = process.platform
    const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open"
    const args = platform === "win32" ? ["/c", "start", "", url] : [url]

    try {
      const child = spawn(command, args, { stdio: "ignore", detached: true })
      child.on("error", (error) => {
        const err = error instanceof Error ? error : new Error(String(error))
        this.logError("open-url", err)
      })
      child.unref()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.logError("open-url", err)
    }
  }

  private toggleWatchSwapPool(pool: string): void {
    if (!pool) return
    if (this.watchSwapPools.has(pool)) {
      this.removeWatchSwapPools([pool])
      this.setActionStat(`Removed swap pool: ${pool.slice(0, 8)}...`)
    } else {
      this.addWatchSwapPools([pool])
      this.setActionStat(`Added swap pool: ${pool.slice(0, 8)}...`)
    }
  }

  private toggleWatchReservePool(pool: string): void {
    if (!pool) return
    if (this.watchReservePools.has(pool)) {
      this.removeWatchReservePools([pool])
      this.setActionStat(`Removed reserve pool: ${pool.slice(0, 8)}...`)
    } else {
      this.addWatchReservePools([pool])
      this.setActionStat(`Added reserve pool: ${pool.slice(0, 8)}...`)
    }
  }

  private setActionStat(message: string): void {
    this.setExtraStat("Last Action", message)
  }

  private showHelp(): void {
    if (this.modalActive) return
    this.modalActive = true
    const helpContent = `
  Ctrl+C          - Quit
  Tab             - Next widget
  Shift+Tab       - Previous widget
  t/q/a/r/l/w/u/d - Focus panels
  Enter           - Open selected row in browser
  x               - Collapse/expand panel
  X               - Enable/disable panel stream
  c               - Clear swap feeds
  p               - Pause/resume
  m/M             - Add/remove watch mints
  s/S             - Add/remove swap pools
  o/O             - Add/remove reserve pools
  ?               - Show help

  Swap columns: Time | DEX | In | Out | Price | USDC
  Press Esc or Enter to close
      `
    const helpWidth = Math.max(
      50,
      ...helpContent
        .split("\n")
        .map((line) => line.length)
        .filter((length) => length > 0)
        .map((length) => length + 4)
    )
    const helpBox = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      width: helpWidth,
      height: 20,
      border: { type: "line" },
      label: " Keyboard Shortcuts ",
      style: {
        border: { fg: this.config.theme.colors.primary }
      },
      content: helpContent,
      tags: true
    })

    helpBox.key(["escape", "enter", "?"], () => {
      this.modalActive = false
      helpBox.destroy()
      this.screen.render()
    })

    helpBox.focus()
    this.screen.render()
  }

  private logError(source: string, error: Error): void {
    console.error(`[${source}] Error:`, error.message)
  }

  private formatNumber(value: number): string {
    if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + "B"
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + "M"
    if (value >= 1_000) return (value / 1_000).toFixed(2) + "K"
    return value.toFixed(2)
  }
}
