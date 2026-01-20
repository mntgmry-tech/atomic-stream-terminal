import type { DexId } from "../../types/stream.types.js"

type PoolLookupEntry = {
  dex: DexId
  pool: string
  baseMint: string
  quoteMint: string
  baseVault: string
  quoteVault: string
}

type PoolLookupResponse = {
  baseMint: string
  quoteMint: string
  pools: PoolLookupEntry[]
}

type PoolLookupOptions = {
  dexes?: DexId[]
  limit?: number
}

export class PoolLookupClient {
  private leaseToken: string | null = null

  constructor(private baseUrl: string) {}

  setLeaseToken(token: string | null): void {
    const trimmed = token?.trim()
    this.leaseToken = trimmed ? trimmed : null
  }

  async lookupPair(baseMint: string, quoteMint: string, options: PoolLookupOptions = {}): Promise<PoolLookupResponse> {
    const url = new URL("/pools/lookup", this.baseUrl)
    url.searchParams.set("baseMint", baseMint)
    url.searchParams.set("quoteMint", quoteMint)

    if (options.dexes && options.dexes.length > 0) {
      url.searchParams.set("dex", options.dexes.join(","))
    }
    if (options.limit && Number.isFinite(options.limit) && options.limit > 0) {
      url.searchParams.set("limit", String(Math.trunc(options.limit)))
    }
    if (this.leaseToken) {
      url.searchParams.set("t", this.leaseToken)
    }

    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error(`pool lookup failed: ${response.status}`)
    }

    const payload = (await response.json()) as PoolLookupResponse
    if (!payload || !Array.isArray(payload.pools)) {
      throw new Error("pool lookup invalid response")
    }

    return payload
  }
}
