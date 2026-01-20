import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import bs58 from "bs58"

function isByteArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
}

function extractKeyBytes(value: unknown): Uint8Array | null {
  if (isByteArray(value)) return Uint8Array.from(value)
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    if (isByteArray(record.secretKey)) return Uint8Array.from(record.secretKey)
    if (isByteArray(record.privateKey)) return Uint8Array.from(record.privateKey)
    if (isByteArray(record.keypair)) return Uint8Array.from(record.keypair)
  }
  return null
}

export function defaultSolanaKeypairPath(): string {
  return join(homedir(), ".config", "solana", "id.json")
}

export async function readKeypairFileBase58(filePath: string): Promise<string | null> {
  const resolvedPath =
    filePath.startsWith("~/") || filePath.startsWith("~\\") ? join(homedir(), filePath.slice(2)) : filePath
  const raw = await readFile(resolvedPath, "utf8")
  const json = JSON.parse(raw) as unknown
  const bytes = extractKeyBytes(json)
  if (!bytes) return null
  return bs58.encode(bytes)
}
