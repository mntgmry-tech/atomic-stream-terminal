import { config as loadDotEnv } from "dotenv"

loadDotEnv()

export interface AppEnvironment {
  NODE_ENV: "development" | "production" | "test"
  LOG_LEVEL: "debug" | "info" | "warn" | "error"
  PUBLIC_HTTP_BASE_URL: string
  SVM_PRIVATE_KEY: string
  SVM_PRIVATE_KEY_FILE?: string
  RENEW_METHOD: "http" | "inband"
  WATCH_POOLS?: string
  WATCH_SWAP_POOLS?: string
  WATCH_RESERVE_POOLS?: string
  WATCH_MINTS?: string
  WATCH_PROGRAMS?: string
  PRICE_TICKER_PAIRS?: string
  KNOWN_MINTS?: string
  MINT_LABELS?: string
  TOKEN_LIST_URLS?: string
  TOKEN_LIST_PATHS?: string
  POOL_LOOKUP_HTTP_BASE_URL?: string
  X402_ASSET_DECIMALS: number
  UI_REFRESH_RATE: number
  MAX_SWAP_HISTORY: number
  MAX_POOL_HISTORY: number
}

function parseNodeEnv(value: string | undefined): AppEnvironment["NODE_ENV"] {
  switch (value) {
    case "development":
    case "production":
    case "test":
      return value
    default:
      return "development"
  }
}

function parseLogLevel(value: string | undefined): AppEnvironment["LOG_LEVEL"] {
  switch (value) {
    case "debug":
    case "info":
    case "warn":
    case "error":
      return value
    default:
      return "info"
  }
}

function parseIntWithDefault(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function loadConfig(): AppEnvironment {
  const base: AppEnvironment = {
    NODE_ENV: parseNodeEnv(process.env.NODE_ENV),
    LOG_LEVEL: parseLogLevel(process.env.LOG_LEVEL),
    PUBLIC_HTTP_BASE_URL: process.env.PUBLIC_HTTP_BASE_URL ?? "http://localhost:3000",
    SVM_PRIVATE_KEY: process.env.SVM_PRIVATE_KEY ?? "",
    ...(process.env.SVM_PRIVATE_KEY_FILE ? { SVM_PRIVATE_KEY_FILE: process.env.SVM_PRIVATE_KEY_FILE } : {}),
    RENEW_METHOD: process.env.RENEW_METHOD === "inband" ? "inband" : "http",
    X402_ASSET_DECIMALS: parseIntWithDefault(process.env.X402_ASSET_DECIMALS, 6),
    UI_REFRESH_RATE: parseIntWithDefault(process.env.UI_REFRESH_RATE, 50),
    MAX_SWAP_HISTORY: parseIntWithDefault(process.env.MAX_SWAP_HISTORY, 1000),
    MAX_POOL_HISTORY: parseIntWithDefault(process.env.MAX_POOL_HISTORY, 100)
  }

  if (process.env.WATCH_POOLS) {
    base.WATCH_POOLS = process.env.WATCH_POOLS
  }
  if (process.env.WATCH_SWAP_POOLS) {
    base.WATCH_SWAP_POOLS = process.env.WATCH_SWAP_POOLS
  }
  if (process.env.WATCH_RESERVE_POOLS) {
    base.WATCH_RESERVE_POOLS = process.env.WATCH_RESERVE_POOLS
  } else if (process.env.WATCH_POOLS) {
    base.WATCH_RESERVE_POOLS = process.env.WATCH_POOLS
  }
  if (process.env.WATCH_MINTS) {
    base.WATCH_MINTS = process.env.WATCH_MINTS
  }
  if (process.env.WATCH_PROGRAMS) {
    base.WATCH_PROGRAMS = process.env.WATCH_PROGRAMS
  }
  if (process.env.PRICE_TICKER_PAIRS) {
    base.PRICE_TICKER_PAIRS = process.env.PRICE_TICKER_PAIRS
  }
  if (process.env.KNOWN_MINTS) {
    base.KNOWN_MINTS = process.env.KNOWN_MINTS
  }
  if (process.env.MINT_LABELS) {
    base.MINT_LABELS = process.env.MINT_LABELS
  }
  if (process.env.TOKEN_LIST_URLS) {
    base.TOKEN_LIST_URLS = process.env.TOKEN_LIST_URLS
  }
  if (process.env.TOKEN_LIST_PATHS) {
    base.TOKEN_LIST_PATHS = process.env.TOKEN_LIST_PATHS
  }
  if (process.env.POOL_LOOKUP_HTTP_BASE_URL) {
    base.POOL_LOOKUP_HTTP_BASE_URL = process.env.POOL_LOOKUP_HTTP_BASE_URL
  }

  return base
}
