import type {
  PaymentPayloadV1Compat,
  PaymentPayloadV2Compat,
  PaymentRequirementsV1Compat,
  PaymentRequirementsV2Compat,
  PaymentRequiredV1Compat,
  PaymentRequiredV2Compat,
  StreamId,
  WsEvent,
  WsStatusEvent,
  WsX402Event
} from "../../types/stream.types.js"

type UnknownRecord = Record<string, unknown>

const STREAM_IDS = new Set<string>([
  "mempool-sniff",
  "new-mints",
  "whale-alert",
  "smart-money",
  "wallet-balance",
  "token-ticker",
  "swap-quotes",
  "swap-alerts",
  "liquidity-changes",
  "infrastructure-pulse",
  "sniper-feed",
  "pool-creations",
  "rug-detection",
  "market-depth",
  "pool-reserves",
  "token2022-extensions",
  "program-logs",
  "program-errors",
  "trending-leaderboard",
  "account-data"
])

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export function isNetworkV2(value: string): boolean {
  const idx = value.indexOf(":")
  return idx > 0 && idx < value.length - 1
}

export function isStreamId(value: string): value is StreamId {
  return STREAM_IDS.has(value)
}

export function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function isWsX402Event(value: unknown): value is WsX402Event {
  if (!isRecord(value)) return false
  if (typeof value.op !== "string") return false
  return ["hello", "renewal_reminder", "payment_required", "renewed", "error"].includes(value.op)
}

export function isWsStatusEvent(value: unknown): value is WsStatusEvent {
  if (!isRecord(value)) return false
  return value.type === "status" && typeof value.now === "string"
}

export type WsTypedEvent = Exclude<WsEvent, WsX402Event>

export function isWsEvent(value: unknown): value is WsTypedEvent {
  if (!isRecord(value)) return false
  return typeof value.type === "string"
}

function isResourceInfo(value: unknown): value is { url: string; description: string; mimeType: string } {
  if (!isRecord(value)) return false
  return isString(value.url) && isString(value.description) && isString(value.mimeType)
}

function isPaymentRequirementsV1(value: unknown): value is PaymentRequirementsV1Compat {
  if (!isRecord(value)) return false
  return (
    isString(value.scheme) &&
    isString(value.network) &&
    isString(value.maxAmountRequired) &&
    isString(value.resource) &&
    isString(value.description) &&
    isString(value.mimeType) &&
    isRecord(value.outputSchema) &&
    isString(value.payTo) &&
    isNumber(value.maxTimeoutSeconds) &&
    isString(value.asset) &&
    isRecord(value.extra)
  )
}

function isPaymentRequirementsV2(value: unknown): value is PaymentRequirementsV2Compat {
  if (!isRecord(value)) return false
  return (
    isString(value.scheme) &&
    isString(value.network) &&
    isNetworkV2(value.network) &&
    isString(value.amount) &&
    isString(value.asset) &&
    isString(value.payTo) &&
    isNumber(value.maxTimeoutSeconds) &&
    isRecord(value.extra)
  )
}

function isPaymentPayloadV1(value: unknown): value is PaymentPayloadV1Compat {
  if (!isRecord(value)) return false
  return value.x402Version === 1 && isString(value.scheme) && isString(value.network) && isRecord(value.payload)
}

function isPaymentPayloadV2(value: unknown): value is PaymentPayloadV2Compat {
  if (!isRecord(value)) return false
  return (
    value.x402Version === 2 &&
    isResourceInfo(value.resource) &&
    isPaymentRequirementsV2(value.accepted) &&
    isRecord(value.payload) &&
    (value.extensions === undefined || isRecord(value.extensions))
  )
}

function isPaymentRequiredV1(value: unknown): value is PaymentRequiredV1Compat {
  if (!isRecord(value)) return false
  if (value.x402Version !== 1) return false
  if (!Array.isArray(value.accepts) || !value.accepts.every(isPaymentRequirementsV1)) return false
  if (value.error !== undefined && !isString(value.error)) return false
  return true
}

function isPaymentRequiredV2(value: unknown): value is PaymentRequiredV2Compat {
  if (!isRecord(value)) return false
  if (value.x402Version !== 2) return false
  if (!isResourceInfo(value.resource)) return false
  if (!Array.isArray(value.accepts) || !value.accepts.every(isPaymentRequirementsV2)) return false
  if (value.extensions !== undefined && !isRecord(value.extensions)) return false
  if (value.error !== undefined && !isString(value.error)) return false
  return true
}

export const isPaymentRequired = (value: unknown): value is PaymentRequiredV1Compat | PaymentRequiredV2Compat =>
  isPaymentRequiredV1(value) || isPaymentRequiredV2(value)
export const isPaymentPayload = (value: unknown): value is PaymentPayloadV1Compat | PaymentPayloadV2Compat =>
  isPaymentPayloadV1(value) || isPaymentPayloadV2(value)
export const isPaymentRequirements = (
  value: unknown
): value is PaymentRequirementsV1Compat | PaymentRequirementsV2Compat =>
  isPaymentRequirementsV1(value) || isPaymentRequirementsV2(value)

export type Ws402StreamSchema = {
  protocol: "ws402"
  version: "1"
  websocketEndpoint: string
  pricing: { pricePerSecond: number; currency: string; estimatedDuration: number }
  paymentDetails: {
    scheme: "exact"
    network: string
    asset: string
    payTo: string
    maxAmountRequired: string
    maxTimeoutSeconds: number
  }
  stream: { id: StreamId; title: string; description: string }
}

export function isWs402StreamSchema(value: unknown): value is Ws402StreamSchema {
  if (!isRecord(value)) return false
  if (value.protocol !== "ws402") return false
  if (value.version !== "1") return false
  if (!isString(value.websocketEndpoint)) return false
  const pricing = value.pricing
  if (!isRecord(pricing)) return false
  if (!isNumber(pricing.pricePerSecond) || !isString(pricing.currency) || !isNumber(pricing.estimatedDuration)) {
    return false
  }

  const details = value.paymentDetails
  if (!isRecord(details)) return false
  if (
    details.scheme !== "exact" ||
    !isString(details.network) ||
    !isString(details.asset) ||
    !isString(details.payTo) ||
    !isString(details.maxAmountRequired) ||
    !isNumber(details.maxTimeoutSeconds)
  ) {
    return false
  }

  const stream = value.stream
  if (!isRecord(stream)) return false
  if (!isString(stream.id) || !isStreamId(stream.id)) return false
  if (!isString(stream.title) || !isString(stream.description)) return false
  return true
}
