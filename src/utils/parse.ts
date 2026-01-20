export function parseList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parsePairList(value: string | undefined): Array<{ baseMint: string; quoteMint: string }> {
  const entries = parseList(value)
  const pairs: Array<{ baseMint: string; quoteMint: string }> = []

  for (const entry of entries) {
    const [baseMint, quoteMint] = entry.split(/[/:]/).map((item) => item?.trim())
    if (!baseMint || !quoteMint) continue
    pairs.push({ baseMint, quoteMint })
  }

  return pairs
}
