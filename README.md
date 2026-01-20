# Atomic Stream Terminal

Terminal UI dashboard for live Solana trading streams. This app connects to ws402 (x402) WebSocket streams exposed by `yellowstone-grpc-ws-bridge` and renders real-time market activity using `blessed` and `blessed-contrib`.

## Features

- Real-time price ticker for selected pairs.
- Live swap quotes and whale alert feeds.
- Jupiter-routed swaps labeled as `JUP/<DEX>` when the bridge is configured with `JUPITER_PROGRAM_IDS`.
- Pool creation feed and pool reserve snapshots.
- Interactive watchlists (add mints/pools at runtime without restarting).
- Automatic x402 renewal (HTTP or in-band).
- One-keystroke inspection links to Solscan for swaps and pools.
- x402 spend tracking per stream with totals.

## Requirements

- Node.js 20+
- A running ws402 server that exposes the Yellowstone stream schemas used below (typically `yellowstone-grpc-ws-bridge`)
- A Solana keypair for x402 payments (base58 secret key or a keypair JSON file)

## Install

```bash
npm install
```

## Configuration

Create `.env` in `atomic-stream-terminal/`:

```env
PUBLIC_HTTP_BASE_URL=http://localhost:8788
# Prefer SVM_PRIVATE_KEY_FILE or the default Solana keypair path. Use SVM_PRIVATE_KEY if you already have base58.
SVM_PRIVATE_KEY=
SVM_PRIVATE_KEY_FILE=~/.config/solana/id.json
RENEW_METHOD=http
POOL_LOOKUP_HTTP_BASE_URL=http://localhost:8788
WATCH_MINTS=So11111111111111111111111111111111111111112,EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
WATCH_RESERVE_POOLS=
WATCH_SWAP_POOLS=
PRICE_TICKER_PAIRS=
# Optional overrides for utils/mints.ts
# KNOWN_MINTS=SOL=So11111111111111111111111111111111111111112,USDC=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
# MINT_LABELS=BONK=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
# TOKEN_LIST_URLS=https://example.com/token-list.json
# TOKEN_LIST_PATHS=./tokens.json
```

Start from the provided example:
```bash
cp .env.example .env
```

Environment variables (from `src/config/env.ts`):

- `PUBLIC_HTTP_BASE_URL` (required): HTTP base URL for ws402 schema requests and renewals.
- `SVM_PRIVATE_KEY` (optional): Base58 Solana private key used to sign x402 payments.
- `SVM_PRIVATE_KEY_FILE` (optional): Path to a Solana `id.json` keypair file (created by `solana-keygen`).
- `RENEW_METHOD` (optional): `http` (default) or `inband`.
- `WATCH_MINTS` (optional): Comma- or space-separated mint addresses for swap streams and pool creations.
- `WATCH_RESERVE_POOLS` (optional): Comma- or space-separated pool addresses or mint pairs (`SOL/USDC`) for `pool-reserves` (requires pool lookup when using pairs).
- `WATCH_SWAP_POOLS` (optional): Comma- or space-separated pool addresses or mint pairs to filter swap streams.
- `PRICE_TICKER_PAIRS` (optional): Comma- or space-separated pairs as `baseMint/quoteMint`. When set, only these pairs show in the price ticker.
- `KNOWN_MINTS` (optional): Override known mint addresses as `SYMBOL=address` pairs.
- `MINT_LABELS` (optional): Add label mappings as `SYMBOL=address` pairs.
- `TOKEN_LIST_URLS` (optional): Comma-separated URLs to JSON token lists (merged into mint labels).
- `TOKEN_LIST_PATHS` (optional): Comma-separated file paths to JSON token lists.
- `POOL_LOOKUP_HTTP_BASE_URL` (optional): Base URL for `/pools/lookup` (defaults to `PUBLIC_HTTP_BASE_URL`).
- `WATCH_PROGRAMS` (optional): Parsed into config but not wired into the current runtime.
- `WATCH_POOLS` is deprecated and treated as `WATCH_RESERVE_POOLS`.
- `NODE_ENV`, `LOG_LEVEL`, `UI_REFRESH_RATE`, `MAX_SWAP_HISTORY`, `MAX_POOL_HISTORY` are parsed into config but not currently used by the app runtime.

Private key resolution order:

1. `SVM_PRIVATE_KEY`
2. `SVM_PRIVATE_KEY_FILE`
3. `~/.config/solana/id.json`

If you want a base58 secret from a keypair file:

```bash
npx ts-node scripts/solana-keypair-to-base58.ts ~/.config/solana/id.json
```

## Run

```bash
npm run dev
```

Build and run the compiled output:

```bash
npm run build
npm start
```

## Streams Used

The app connects to these ws402 schema endpoints (configured in `src/index.ts`):

- `token-ticker` (`/v2/schema/stream/token-ticker`)
  - Server emits all supported DEX swaps; client filters by `WATCH_MINTS` and `PRICE_TICKER_PAIRS` (if set)
  - Feeds the Price Ticker table
- `swap-quotes` (`/v2/schema/stream/swap-quotes`)
  - Filtered by `WATCH_MINTS` and optional `WATCH_SWAP_POOLS`
  - Feeds Swap Quotes + stats
- `swap-alerts` (`/v2/schema/stream/swap-alerts`)
  - Filtered by `WATCH_MINTS` and optional `WATCH_SWAP_POOLS`
  - Feeds Swap Alerts + stats
- `pool-creations` (`/v2/schema/stream/pool-creations`)
  - Filtered by `WATCH_MINTS`
  - Feeds Pool Creations table
- `pool-reserves` (`/v2/schema/stream/pool-reserves`)
  - Filtered by `WATCH_RESERVE_POOLS`
  - Feeds Pool Reserves table

## UI Layout

- **Price Ticker (top left):** Shows pairs from `PRICE_TICKER_PAIRS` when set; otherwise shows pairs as they appear for watched mints.
- **Dashboard Stats (top center):** Rolling totals and rates.
- **x402 Spend (top center-right):** Spend totals per stream plus a total row.
- **Streams (top right):** Connection and watchlist status per stream.
- **Pool Reserves (middle left):** Latest reserves for watched pool addresses.
- **Pool Creations (middle right):** Latest pools created for watched mints.
- **Swap Quotes (bottom left):** All swap quotes matching filters.
- **Swap Alerts (bottom right):** Whale alerts emitted by the server.

## Keyboard Shortcuts

- `Ctrl+C`: Quit
- `Tab` / `Shift+Tab`: Cycle focus
- `t/q/a/r/l/w/u/d`: Focus panels
- `Enter`: Open the selected row in your browser
- `x`: Collapse/expand focused panel
- `X`: Enable/disable focused stream
- `c`: Clear swap feeds
- `p`: Pause/resume stream processing
- `m`: Add watch mints (runtime)
- `M`: Remove watch mints (runtime)
- `s`: Add swap pools (runtime)
- `S`: Remove swap pools (runtime)
- `o`: Add reserve pools (runtime)
- `O`: Remove reserve pools (runtime)
- `?` / `h`: Help

## Inspecting Rows

- **Swap Quotes / Swap Alerts:** Open the transaction in Solscan.
- **Pool Creations / Pool Reserves:** Open the pool account in Solscan.
- **Price Ticker:** Opens the non-USDC mint when available.
- **x402 Spend:** Opens the Atomic Stream site.

You can click a panel to focus it and click a row to select it before pressing `Enter`.

## Charge Confirmation

On startup, the app fetches ws402 schema metadata to show the per-stream charge and a total.  
Press `Enter`/`Yes` to continue, or `Esc`/`No` to decline (streams remain disabled).

## Interactive Watchlists

You can add or remove mints and pools without restarting. This avoids paying x402 again just to update filters.

- Press `m` to add mint addresses.
  - Applies to `swap-quotes`, `swap-alerts`, `pool-creations`.
  - Also used to client-filter `token-ticker`.
- Press `M` to remove mint addresses.
- Press `s` to add swap pools.
  - Accepts pool IDs or mint pairs (`SOL/USDC`) when pool lookup is configured.
  - Applies to `swap-quotes` and `swap-alerts`.
- Press `S` to remove swap pools.
- Press `o` to add pool addresses for reserves.
  - Applies to `pool-reserves` only.
- Press `O` to remove reserve pools.

These updates are in-memory and apply to the current session only.

## Troubleshooting

**Price ticker is empty**
- If `PRICE_TICKER_PAIRS` is set, use `baseMint/quoteMint` addresses (not symbols).
- `token-ticker` only emits pairs quoted in SOL or USDC; use the WSOL mint `So11111111111111111111111111111111111111112` and USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- If `WATCH_MINTS` is set, make sure it includes the base mint you expect to see.
- SOL/USD is derived by inverting the `USDC/SOL` price. Tokens quoted in SOL are converted to USD once SOL price is known.

**Pool reserves are empty**
- `pool-reserves` only emits for watched pool addresses.
- Add pools with `o` or set `WATCH_RESERVE_POOLS`. Use pool IDs (not vaults), or mint pairs if `POOL_LOOKUP_HTTP_BASE_URL` is configured.
- The safest source is the Pool Creations table or `GET /pools/lookup` on the bridge health server.

**Swap alerts are empty**
- `swap-alerts` is server-filtered for large swaps. If you use `yellowstone-grpc-ws-bridge`, check `X402_WHALE_ALERT_USD_THRESHOLD` in `yellowstone-grpc-ws-bridge/.env.server`.

**Jupiter label missing in swap quotes**
- Ensure `JUPITER_PROGRAM_IDS` is set on the bridge so swaps routed via Jupiter can be detected.

**ECONNREFUSED / fetch failed**
- `PUBLIC_HTTP_BASE_URL` is wrong or the ws402 server is not running.

## Project Structure (Key Files)

- `src/index.ts`: App bootstrap and stream wiring.
- `src/app.ts`: Dashboard orchestration + keyboard shortcuts.
- `src/data/streams/stream-client.ts`: ws402 client and watchlist updates.
- `src/data/streams/x402.ts`: x402 schema + renew logic.
- `src/ui/layouts/main.layout.ts`: TUI layout.
- `src/ui/widgets/*`: Widgets for each dashboard panel.

## Notes

- The app uses `@x402/fetch` + `@x402/svm` for payments.
- Stream types and IDs are defined in `src/types/stream.types.ts`.
