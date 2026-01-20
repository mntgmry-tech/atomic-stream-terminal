import { DashboardApp } from "./app.js"
import { loadConfig } from "./config/index.js"
import { darkTheme } from "./ui/themes/dark.theme.js"
import {
  configureMintLabels,
  mergeMintLabels,
  parseKnownMintOverrides,
  parseMintLabels,
  pairKey,
  resolveMintInput,
  KNOWN_MINTS
} from "./utils/mints.js"
import { defaultSolanaKeypairPath, readKeypairFileBase58 } from "./utils/solana-keypair.js"
import { loadTokenLabels } from "./utils/token-registry.js"
import { parseList, parsePairList } from "./utils/parse.js"

function suppressExperimentalEd25519Warning(): void {
  const original = process.emitWarning.bind(process) as (warning: string | Error, ...args: unknown[]) => void
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const message = typeof warning === "string" ? warning : warning.message
    const name =
      typeof warning === "string"
        ? typeof args[0] === "string"
          ? args[0]
          : ""
        : warning.name
    if (name === "ExperimentalWarning" && message.includes("Ed25519 Web Crypto API")) {
      return
    }
    original(warning, ...args)
  }) as typeof process.emitWarning
}

async function resolvePrivateKey(env: ReturnType<typeof loadConfig>): Promise<string> {
  const direct = env.SVM_PRIVATE_KEY.trim()
  if (direct) return direct

  const filePath = env.SVM_PRIVATE_KEY_FILE?.trim()
  if (filePath) {
    const encoded = await readKeypairFileBase58(filePath)
    if (!encoded) {
      throw new Error(`Invalid keypair file: ${filePath}`)
    }
    return encoded
  }

  const fallbackPath = defaultSolanaKeypairPath()
  const encoded = await readKeypairFileBase58(fallbackPath).catch(() => null)
  if (encoded) return encoded

  throw new Error(
    "Missing SVM_PRIVATE_KEY. Set SVM_PRIVATE_KEY, SVM_PRIVATE_KEY_FILE, or ~/.config/solana/id.json."
  )
}

async function main(): Promise<void> {
  suppressExperimentalEd25519Warning()
  const env = loadConfig()
  const privateKey = await resolvePrivateKey(env)

  configureMintLabels({
    knownMints: parseKnownMintOverrides(env.KNOWN_MINTS),
    mintLabels: parseMintLabels(env.MINT_LABELS)
  })

  const tokenLabels = await loadTokenLabels({
    urls: parseList(env.TOKEN_LIST_URLS),
    paths: parseList(env.TOKEN_LIST_PATHS)
  })
  if (Object.keys(tokenLabels).length > 0) {
    mergeMintLabels(tokenLabels)
  }

  const watchMints = parseList(env.WATCH_MINTS).map(resolveMintInput).filter(Boolean)
  const watchSwapPools = parseList(env.WATCH_SWAP_POOLS)
  const watchReservePools = parseList(env.WATCH_RESERVE_POOLS)
  const configuredPairs = parsePairList(env.PRICE_TICKER_PAIRS).map((pair) =>
    pairKey(resolveMintInput(pair.baseMint), resolveMintInput(pair.quoteMint))
  )
  const defaultPairs = [
    pairKey(KNOWN_MINTS.SOL, KNOWN_MINTS.USDC),
    pairKey(KNOWN_MINTS.PUMP, KNOWN_MINTS.USDC),
    pairKey(KNOWN_MINTS.JUP, KNOWN_MINTS.USDC),
    pairKey(KNOWN_MINTS.RAY, KNOWN_MINTS.USDC),
    pairKey(KNOWN_MINTS.MET, KNOWN_MINTS.USDC)
  ]
  const displayPairs = configuredPairs.length > 0 ? configuredPairs : defaultPairs

  const app = new DashboardApp({
    theme: darkTheme,
    pairs: displayPairs,
    ...(configuredPairs.length > 0 ? { pairFilters: configuredPairs } : {}),
    x402: {
      httpBase: env.PUBLIC_HTTP_BASE_URL,
      privateKey,
      renewMethod: env.RENEW_METHOD,
      assetDecimals: env.X402_ASSET_DECIMALS
    },
    poolLookupHttpBase: env.POOL_LOOKUP_HTTP_BASE_URL ?? env.PUBLIC_HTTP_BASE_URL,
    streams: [
      {
        streamId: "token-ticker",
        schemaPath: "/v2/schema/stream/token-ticker"
      },
      {
        streamId: "swap-quotes",
        schemaPath: "/v2/schema/stream/swap-quotes",
        watchAccounts: watchSwapPools,
        watchMints
      },
      {
        streamId: "swap-alerts",
        schemaPath: "/v2/schema/stream/swap-alerts",
        watchAccounts: watchSwapPools,
        watchMints
      },
      {
        streamId: "pool-creations",
        schemaPath: "/v2/schema/stream/pool-creations",
        watchMints
      },
      {
        streamId: "pool-reserves",
        schemaPath: "/v2/schema/stream/pool-reserves",
        watchAccounts: watchReservePools,
        enabled: false
      }
    ]
  })

  await app.start()
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
