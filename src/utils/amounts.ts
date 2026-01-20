export function parseBigInt(value: string): bigint | null {
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

export function formatDecimalAmount(raw: bigint, decimals: number | null): string {
  if (decimals === null || decimals <= 0) return raw.toString()
  const negative = raw < 0n
  const abs = negative ? -raw : raw
  const base = abs.toString().padStart(decimals + 1, "0")
  const integer = base.slice(0, -decimals)
  const fractionRaw = base.slice(-decimals)
  const fraction = fractionRaw.replace(/0+$/, "")
  const value = fraction.length > 0 ? `${integer}.${fraction}` : integer
  return negative ? `-${value}` : value
}
