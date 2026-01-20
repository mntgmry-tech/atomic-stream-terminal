export const SWAP_FEED_COLUMNS = {
  time: 8,
  dex: 8,
  tokenIn: 20,
  tokenOut: 20,
  price: 14,
  usd: 14
} as const

export const TABLE_COLUMN_WIDTHS = {
  priceTicker: [12, 10, 9, 9, 10],
  spendTracker: [14, 10],
  poolReserves: [10, 20, 14, 14, 10],
  poolList: [10, 24, 18, 10],
  streams: [14, 5, 5, 5],
  swapFeed: [
    SWAP_FEED_COLUMNS.time,
    SWAP_FEED_COLUMNS.dex,
    SWAP_FEED_COLUMNS.tokenIn,
    SWAP_FEED_COLUMNS.tokenOut,
    SWAP_FEED_COLUMNS.price,
    SWAP_FEED_COLUMNS.usd
  ]
}
