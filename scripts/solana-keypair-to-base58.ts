import { readKeypairFileBase58 } from "../src/utils/solana-keypair.js"

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: npx ts-node scripts/solana-keypair-to-base58.ts <path-to-keypair.json>')
    process.exit(1)
  }

  try {
    const encoded = await readKeypairFileBase58(filePath)
    if (!encoded) {
      console.error("Expected a JSON array of byte values (0-255), or an object with secretKey/privateKey/keypair.")
      process.exit(1)
    }
    console.log(encoded)
  } catch (err) {
    console.error(`Failed to read/parse JSON file: ${filePath}`)
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
