export type MintLabelMap = Record<string, string>

type KnownMintKey = "SOL" | "SOL_NATIVE" | "USDC" | "RAY" | "PUMP" | "JUP" | "MET"

type MintConfig = {
  knownMints?: Partial<Record<KnownMintKey, string>>
  mintLabels?: MintLabelMap
}

const DEFAULT_KNOWN_MINTS: Record<KnownMintKey, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  SOL_NATIVE: "So11111111111111111111111111111111111111111",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  PUMP: "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  MET: "METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL"
}

export const KNOWN_MINTS: Record<KnownMintKey, string> = { ...DEFAULT_KNOWN_MINTS }

export let SOL_MINT = KNOWN_MINTS.SOL
export let SOL_NATIVE_MINT = KNOWN_MINTS.SOL_NATIVE
export let USDC_MINT = KNOWN_MINTS.USDC
export let RAY_MINT = KNOWN_MINTS.RAY
export let PUMP_MINT = KNOWN_MINTS.PUMP
export let JUP_MINT = KNOWN_MINTS.JUP
export let MET_MINT = KNOWN_MINTS.MET

let mintLabels: MintLabelMap = {}
let labelIndex: Record<string, string> = {}

export function parseEnvMap(value: string | undefined): Record<string, string> {
  if (!value) return {}
  const entries = value.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean)
  const map: Record<string, string> = {}

  for (const entry of entries) {
    const separator = entry.includes("=") ? "=" : entry.includes(":") ? ":" : ""
    if (!separator) continue
    const [rawKey, rawValue] = entry.split(separator)
    const key = rawKey?.trim()
    const val = rawValue?.trim()
    if (!key || !val) continue
    map[key] = val
  }

  return map
}

export function parseKnownMintOverrides(value: string | undefined): Partial<Record<KnownMintKey, string>> {
  const map = parseEnvMap(value)
  const overrides: Partial<Record<KnownMintKey, string>> = {}
  for (const [key, val] of Object.entries(map)) {
    const upper = key.toUpperCase()
    if (upper in DEFAULT_KNOWN_MINTS) {
      overrides[upper as KnownMintKey] = val
    }
  }
  return overrides
}

export function parseMintLabels(value: string | undefined): MintLabelMap {
  const map = parseEnvMap(value)
  const labels: MintLabelMap = {}
  for (const [label, mint] of Object.entries(map)) {
    labels[mint] = label
  }
  return labels
}

function buildDefaultLabels(mints: Record<KnownMintKey, string>): MintLabelMap {
  return {
    [mints.SOL_NATIVE]: "SOL",
    [mints.SOL]: "SOL",
    [mints.USDC]: "USDC",
    [mints.RAY]: "RAY",
    [mints.PUMP]: "PUMP",
    [mints.JUP]: "JUP",
    [mints.MET]: "MET"
  }
}

function buildLabelIndex(labels: MintLabelMap): Record<string, string> {
  const index: Record<string, string> = {}
  for (const [mint, label] of Object.entries(labels)) {
    const key = label.trim().toUpperCase()
    if (!key) continue
    if (!index[key]) {
      index[key] = mint
    }
  }
  return index
}

function rebuildLabels(overrides?: MintLabelMap): void {
  mintLabels = {
    ...buildDefaultLabels(KNOWN_MINTS),
    ...(overrides ?? {})
  }
  labelIndex = buildLabelIndex(mintLabels)
}

rebuildLabels()

export function configureMintLabels(config: MintConfig): void {
  if (config.knownMints) {
    Object.assign(KNOWN_MINTS, DEFAULT_KNOWN_MINTS, config.knownMints)
    SOL_MINT = KNOWN_MINTS.SOL
    SOL_NATIVE_MINT = KNOWN_MINTS.SOL_NATIVE
    USDC_MINT = KNOWN_MINTS.USDC
    RAY_MINT = KNOWN_MINTS.RAY
    PUMP_MINT = KNOWN_MINTS.PUMP
    JUP_MINT = KNOWN_MINTS.JUP
    MET_MINT = KNOWN_MINTS.MET
  }
  rebuildLabels(config.mintLabels)
}

export function mergeMintLabels(labels: MintLabelMap): void {
  mintLabels = {
    ...mintLabels,
    ...labels
  }
  labelIndex = buildLabelIndex(mintLabels)
}

export function resolveMintInput(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const key = trimmed.toUpperCase()
  return labelIndex[key] ?? trimmed
}

export function formatMint(mint: string, labels: MintLabelMap = mintLabels): string {
  if (!mint) return ""
  return labels[mint] ?? `${mint.slice(0, 4)}..${mint.slice(-4)}`
}

export function formatPairLabel(
  baseMint: string,
  quoteMint: string,
  labels: MintLabelMap = mintLabels
): string {
  return `${formatMint(baseMint, labels)}/${formatMint(quoteMint, labels)}`
}

export function pairKey(baseMint: string, quoteMint: string): string {
  return `${baseMint}/${quoteMint}`
}

export function parsePairKey(value: string): { baseMint: string; quoteMint: string } | null {
  const parts = value.split("/")
  if (parts.length !== 2) return null
  const [baseMint, quoteMint] = parts
  if (!baseMint || !quoteMint) return null
  return { baseMint, quoteMint }
}
