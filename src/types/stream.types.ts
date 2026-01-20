export type StreamId =
  | "mempool-sniff"
  | "new-mints"
  | "whale-alert"
  | "smart-money"
  | "wallet-balance"
  | "token-ticker"
  | "swap-quotes"
  | "swap-alerts"
  | "liquidity-changes"
  | "infrastructure-pulse"
  | "sniper-feed"
  | "pool-creations"
  | "rug-detection"
  | "market-depth"
  | "pool-reserves"
  | "token2022-extensions"
  | "program-logs"
  | "program-errors"
  | "trending-leaderboard"
  | "account-data"

export type EventFormat = "raw" | "enhanced"
export type DexId = "raydium" | "orca" | "meteora" | "pumpfun"
export type DexRouter = "jupiter"

export type PaymentRequirementsV1Compat = {
  scheme: "exact"
  network: string
  maxAmountRequired: string
  resource: string
  description: string
  mimeType: string
  outputSchema: Record<string, unknown>
  payTo: string
  maxTimeoutSeconds: number
  asset: string
  extra: Record<string, unknown>
}

export type PaymentPayloadV1Compat = {
  x402Version: 1
  scheme: string
  network: string
  payload: Record<string, unknown>
}

export type PaymentRequiredV1Compat = {
  x402Version: 1
  accepts: PaymentRequirementsV1Compat[]
  error?: string
}

export type PaymentRequirementsV2Compat = {
  scheme: "exact"
  network: string
  amount: string
  asset: string
  payTo: string
  maxTimeoutSeconds: number
  extra: Record<string, unknown>
}

export type PaymentPayloadV2Compat = {
  x402Version: 2
  resource: { url: string; description: string; mimeType: string }
  accepted: PaymentRequirementsV2Compat
  payload: Record<string, unknown>
  extensions?: Record<string, unknown>
}

export type PaymentRequiredV2Compat = {
  x402Version: 2
  resource: { url: string; description: string; mimeType: string }
  accepts: PaymentRequirementsV2Compat[]
  extensions?: Record<string, unknown>
  error?: string
}

export type ClientMsg =
  | { op: "resume"; clientId: string }
  | { op: "renew_token"; token: string }
  | {
      op: "renew_inband"
      paymentRequirements: PaymentRequirementsV1Compat | PaymentRequirementsV2Compat
      paymentPayload: PaymentPayloadV1Compat | PaymentPayloadV2Compat
    }
  | { op: "setAccounts"; accounts: string[] }
  | { op: "setPrograms"; programs: string[] }
  | { op: "addAccounts"; accounts: string[] }
  | { op: "removeAccounts"; accounts: string[] }
  | { op: "setMints"; mints: string[] }
  | { op: "addMints"; mints: string[] }
  | { op: "removeMints"; mints: string[] }
  | {
      op: "setOptions"
      includeAccounts?: boolean
      includeTokenBalanceChanges?: boolean
      includeLogs?: boolean
      includeInstructions?: boolean
      eventFormat?: EventFormat
      filterTokenBalances?: boolean
    }
  | { op: "getState" }
  | { op: "ping" }

export type ClientOptions = {
  includeAccounts: boolean
  includeTokenBalanceChanges: boolean
  includeLogs: boolean
  includeInstructions: boolean
  eventFormat: EventFormat
  filterTokenBalances: boolean
}

export type NativeTransfer = {
  fromUserAccount: string
  toUserAccount: string
  amount: number
}

export type TokenTransfer = {
  fromTokenAccount: string
  toTokenAccount: string
  fromUserAccount: string
  toUserAccount: string
  tokenAmount: number
  mint: string
  tokenStandard: string
}

export type RawTokenAmount = {
  tokenAmount: string
  decimals: number
}

export type TokenBalanceChange = {
  userAccount: string
  tokenAccount: string
  rawTokenAmount: RawTokenAmount
  mint: string
}

export type AccountData = {
  account: string
  nativeBalanceChange: number
  tokenBalanceChanges: TokenBalanceChange[]
}

export type InnerInstruction = {
  programId: string
  accounts: string[]
  data: string
}

export type Instruction = {
  programId: string
  accounts: string[]
  data: string
  innerInstructions: InnerInstruction[]
}

export type YellowstoneTokenBalanceChange = {
  account: string
  mint: string
  owner?: string
  decimals: number
  preAmount: string
  preAmountUi: string
  postAmount: string
  postAmountUi: string
  delta: string
  deltaUi: string
}

export type EnhancedTransactionEvent = {
  type: "transaction"
  commitment: "processed" | "confirmed"
  slot: number
  signature: string
  timestamp: number | null
  isVote: boolean
  index: number
  err: object | null
  fee: number
  feePayer: string
  accounts?: string[]
  nativeTransfers: NativeTransfer[]
  tokenTransfers: TokenTransfer[]
  accountData: AccountData[]
  instructions?: Instruction[]
  computeUnitsConsumed: number
  logs?: string[]
}

export type RawTransactionEvent = {
  type: "transaction"
  commitment: "processed" | "confirmed"
  slot: number
  signature: string
  isVote: boolean
  index: number
  err: object | null
  accounts?: string[]
  tokenBalanceChanges?: YellowstoneTokenBalanceChange[]
  logs?: string[]
  computeUnitsConsumed: number
}

export type WsStatusEvent = {
  type: "status"
  clientId?: string
  now: string
  grpcConnected: boolean
  nodeHealthy: boolean
  processedHeadSlot?: number
  confirmedHeadSlot?: number
  watchedAccounts: number
  watchedMints: number
}

export type WsTransactionEvent = EnhancedTransactionEvent | RawTransactionEvent

export type WsAccountEvent = {
  type: "account"
  stream: StreamId
  pubkey: string
  owner: string
  lamports: string
  executable: boolean
  rentEpoch: string
  data: string
  dataEncoding: "base64" | "hex"
  writeVersion: string
  slot: number
  txnSignature?: string
}

export type WsSlotEvent = {
  type: "slot"
  stream: "infrastructure-pulse"
  slot: number
  parent?: number
  status: string
  tps?: number
  samplePeriodSeconds?: number
  sampleTransactions?: number
  sampleSlots?: number
  sampleSlot?: number
}

export type WsPulseEvent = {
  type: "pulse"
  blockhash: string
  lastValidBlockHeight: number
  slot: number
  timestamp: string
}

export type WsTickerEvent = {
  type: "ticker"
  baseMint: string
  quoteMint: string
  price: number
  dex: DexId
  slot: number
  signature: string
}

export type WsSwapQuoteEvent = {
  type: "swap-quote"
  stream: "swap-quotes" | "swap-alerts"
  dex: DexId
  router?: DexRouter
  pool: string
  baseMint: string
  quoteMint: string
  baseAmount: string
  quoteAmount: string
  baseAmountUi?: string
  quoteAmountUi?: string
  tokenIn?: string
  tokenOut?: string
  amountIn?: string
  amountOut?: string
  amountInUi?: string
  amountOutUi?: string
  price?: number
  executionPrice?: number
  notionalUsd?: number
  slot: number
  signature: string
}

export type WsPoolCreatedEvent = {
  type: "pool-created"
  stream: "pool-creations"
  dex: DexId
  pool: string
  baseMint: string
  quoteMint: string
  baseVault: string
  quoteVault: string
  slot: number
  signature: string
}

export type WsPoolReservesEvent = {
  type: "pool-reserves"
  stream: "pool-reserves"
  dex: DexId
  pool: string
  baseMint: string
  quoteMint: string
  baseAmount: string
  quoteAmount: string
  baseAmountUi?: string
  quoteAmountUi?: string
  price?: number
  slot: number
  txnSignature?: string
}

export type WsLeaderboardEvent = {
  type: "leaderboard"
  windowSeconds: number
  intervalSeconds: number
  asOf: string
  items: Array<{ mint: string; volumeUsd: number }>
}

export type RenewHints = {
  http: { endpoint: string; method: "POST"; priceHint: string }
  inband: { challengeEndpoint: string; method: "POST"; priceHint: string }
}

export type WsX402Event =
  | { op: "hello"; clientId: string; expiresAt: string; sliceSeconds: number }
  | { op: "renewal_reminder"; expiresAt: string; msUntilExpiry: number; renew: RenewHints }
  | { op: "payment_required"; reason: "expired"; renew: RenewHints }
  | { op: "renewed"; expiresAt: string; method: "http" | "inband" }
  | { op: "error"; message: string }

export type WsEvent =
  | WsStatusEvent
  | WsTransactionEvent
  | WsAccountEvent
  | WsSlotEvent
  | WsPulseEvent
  | WsTickerEvent
  | WsSwapQuoteEvent
  | WsPoolCreatedEvent
  | WsPoolReservesEvent
  | WsLeaderboardEvent
  | WsX402Event
