import { DashboardApp } from "./app.js"
import { darkTheme } from "./ui/themes/dark.theme.js"
import { MockDataGenerator } from "./testing/mock-data.js"
import { pairKey, KNOWN_MINTS } from "./utils/mints.js"

async function runDemo(): Promise<void> {
  const app = new DashboardApp({
    theme: darkTheme,
    pairs: [
      pairKey(KNOWN_MINTS.SOL, KNOWN_MINTS.USDC),
      pairKey(KNOWN_MINTS.JUP, KNOWN_MINTS.USDC),
      pairKey(KNOWN_MINTS.RAY, KNOWN_MINTS.USDC)
    ],
    x402: {
      httpBase: "http://localhost:3000",
      privateKey: "demo",
      renewMethod: "http"
    },
    streams: []
  })

  await app.start()

  const generator = new MockDataGenerator()
  const store = app.getStore()
  const pricePairs = [
    pairKey(KNOWN_MINTS.SOL, KNOWN_MINTS.USDC),
    pairKey(KNOWN_MINTS.JUP, KNOWN_MINTS.USDC),
    pairKey(KNOWN_MINTS.RAY, KNOWN_MINTS.USDC)
  ]

  setInterval(() => {
    for (const pairKeyValue of pricePairs) {
      store.updatePrice(generator.generatePrice(pairKeyValue))
    }
  }, 1000)

  const generateSwapQuote = (): void => {
    store.addSwapQuote(generator.generateSwapQuote("swap-quotes"))
    setTimeout(generateSwapQuote, 200 + Math.random() * 300)
  }
  generateSwapQuote()

  const generateSwapAlert = (): void => {
    store.addSwapAlert(generator.generateSwapQuote("swap-alerts"))
    setTimeout(generateSwapAlert, 1000 + Math.random() * 1000)
  }
  generateSwapAlert()

  const generatePool = (): void => {
    const pool = generator.generatePoolCreated()
    store.addPool(pool)
    store.updateReserves(generator.generatePoolReserves(pool))
    setTimeout(generatePool, 5000 + Math.random() * 10000)
  }
  generatePool()
}

runDemo().catch((err) => {
  console.error("Demo error:", err)
  process.exit(1)
})
