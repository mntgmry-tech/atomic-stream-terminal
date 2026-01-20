import { readFile } from "node:fs/promises"
import { resolve as resolvePath } from "node:path"
import type { MintLabelMap } from "./mints.js"

type UnknownRecord = Record<string, unknown>

type TokenListEntry = {
  address?: unknown
  mint?: unknown
  tokenAddress?: unknown
  symbol?: unknown
  name?: unknown
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toStringValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return null
}

function extractEntries(payload: unknown): TokenListEntry[] {
  if (Array.isArray(payload)) return payload as TokenListEntry[]
  if (!isRecord(payload)) return []
  if (Array.isArray(payload.tokens)) return payload.tokens as TokenListEntry[]
  if (Array.isArray(payload.data)) return payload.data as TokenListEntry[]
  return []
}

function extractMint(entry: TokenListEntry): string | null {
  return (
    toStringValue(entry.address) ??
    toStringValue(entry.mint) ??
    toStringValue(entry.tokenAddress)
  )
}

function extractLabel(entry: TokenListEntry): string | null {
  return toStringValue(entry.symbol) ?? toStringValue(entry.name)
}

function parseTokenList(payload: unknown): MintLabelMap {
  const entries = extractEntries(payload)
  const labels: MintLabelMap = {}

  for (const entry of entries) {
    if (!isRecord(entry)) continue
    const mint = extractMint(entry)
    const label = extractLabel(entry)
    if (!mint || !label) continue
    labels[mint] = label
  }

  return labels
}

async function loadFromUrl(url: string): Promise<MintLabelMap> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`token list fetch failed: ${response.status}`)
  }
  const payload = (await response.json()) as unknown
  return parseTokenList(payload)
}

async function loadFromFile(path: string): Promise<MintLabelMap> {
  const resolved = resolvePath(path)
  const raw = await readFile(resolved, "utf8")
  const payload = JSON.parse(raw) as unknown
  return parseTokenList(payload)
}

export async function loadTokenLabels(sources: { urls: string[]; paths: string[] }): Promise<MintLabelMap> {
  const labels: MintLabelMap = {}

  for (const url of sources.urls) {
    try {
      const loaded = await loadFromUrl(url)
      Object.assign(labels, loaded)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[token-list] failed to load ${url}: ${message}`)
    }
  }

  for (const path of sources.paths) {
    try {
      const loaded = await loadFromFile(path)
      Object.assign(labels, loaded)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[token-list] failed to load ${path}: ${message}`)
    }
  }

  return labels
}
