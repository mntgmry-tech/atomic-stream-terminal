import { x402Client, x402HTTPClient, wrapFetchWithPayment } from "@x402/fetch"
import type { Network, PaymentRequired as CorePaymentRequired, PaymentRequirements as CorePaymentRequirements } from "@x402/fetch"
import { ExactSvmScheme, SOLANA_DEVNET_CAIP2, SOLANA_MAINNET_CAIP2, SOLANA_TESTNET_CAIP2 } from "@x402/svm"
import { ExactSvmSchemeV1 } from "@x402/svm/v1"
import { createKeyPairSignerFromBytes } from "@solana/kit"
import bs58 from "bs58"

import { isNetworkV2, isPaymentRequired, isRecord, isWs402StreamSchema } from "./protocol.js"
import type { PaymentRequiredV1Compat, PaymentRequiredV2Compat, StreamId } from "../../types/stream.types.js"

export type RenewMethod = "http" | "inband"
export type X402SchemaVersion = "v1" | "v2"

export type X402Context = {
  client: x402Client
  fetchWithPayment: typeof fetch
  httpClient: x402HTTPClient
}

export async function createX402Context(privateKeyBase58: string): Promise<X402Context> {
  const signer = await createKeyPairSignerFromBytes(bs58.decode(privateKeyBase58))
  const client = new x402Client()
  const schemeV1 = new ExactSvmSchemeV1(signer)
  const schemeV2 = new ExactSvmScheme(signer)
  const v2Networks: Network[] = [SOLANA_MAINNET_CAIP2, SOLANA_DEVNET_CAIP2, SOLANA_TESTNET_CAIP2]
  const v1Networks = new Set<string>(["solana", "solana-devnet", "solana-testnet", ...v2Networks])
  for (const network of v1Networks) client.registerV1(network, schemeV1)
  for (const network of v2Networks) client.register(network, schemeV2)
  return { client, fetchWithPayment: wrapFetchWithPayment(fetch, client), httpClient: new x402HTTPClient(client) }
}

export function parseSchemaVersion(schemaPath: string): X402SchemaVersion {
  const rawPath = (() => {
    if (!schemaPath.startsWith("http://") && !schemaPath.startsWith("https://")) {
      return schemaPath
    }
    try {
      return new URL(schemaPath).pathname
    } catch {
      return schemaPath
    }
  })()
  const match = rawPath.match(/^\/(v1|v2)\//)
  const version = match?.[1]
  return version === "v1" || version === "v2" ? version : "v1"
}

export function buildRenewUrl(httpBase: string, streamId: StreamId, version: X402SchemaVersion): string {
  return new URL(`/${version}/renew/stream/${streamId}`, httpBase).toString()
}

function parseTokenFromWsUrl(wsUrl: string): string {
  try {
    const parsed = new URL(wsUrl)
    return parsed.searchParams.get("t") ?? ""
  } catch {
    return ""
  }
}

export async function requestStreamSchema(
  ctx: X402Context,
  httpBase: string,
  schemaPath: string
): Promise<{ wsUrl: string; token: string; streamId: StreamId }> {
  const url = new URL(schemaPath, httpBase).toString()
  const resp = await ctx.fetchWithPayment(url, { method: "GET" })
  if (!resp.ok) throw new Error(`x402 schema failed: ${resp.status}`)
  const data = await resp.json()
  if (!isWs402StreamSchema(data)) {
    throw new Error("x402 schema response shape invalid")
  }
  const wsUrl = data.websocketEndpoint
  const token = parseTokenFromWsUrl(wsUrl)
  if (!token) throw new Error("x402 schema missing token")
  return { wsUrl, token, streamId: data.stream.id }
}

export async function fetchStreamChargePreview(
  httpBase: string,
  schemaPath: string
): Promise<{ amountRaw: string | null; asset: string | null }> {
  const url = new URL(schemaPath, httpBase).toString()
  const resp = await fetch(url, { method: "GET" })
  if (resp.ok) {
    const data = await resp.json()
    if (!isWs402StreamSchema(data)) {
      throw new Error("x402 schema response shape invalid")
    }
    return { amountRaw: data.paymentDetails.maxAmountRequired, asset: data.paymentDetails.asset }
  }

  if (resp.status === 402) {
    const getHeader = (name: string): string | null => resp.headers.get(name)
    let body: unknown = undefined
    const raw = await resp.text()
    if (raw) {
      try {
        body = JSON.parse(raw) as unknown
      } catch {
        body = undefined
      }
    }

    try {
      const httpClient = new x402HTTPClient(new x402Client())
      const paymentRequired = httpClient.getPaymentRequiredResponse(getHeader, body)
      const requirement = paymentRequired.accepts?.[0]
      if (requirement && typeof requirement.amount === "string" && typeof requirement.asset === "string") {
        return { amountRaw: requirement.amount, asset: requirement.asset }
      }
    } catch {
      // fall through to compat parsing
    }

    if (isPaymentRequired(body)) {
      const [requirement] = body.accepts
      if (requirement) {
        if ("amount" in requirement && typeof requirement.amount === "string") {
          return { amountRaw: requirement.amount, asset: requirement.asset }
        }
        if ("maxAmountRequired" in requirement && typeof requirement.maxAmountRequired === "string") {
          return { amountRaw: requirement.maxAmountRequired, asset: requirement.asset }
        }
      }
    }

    return { amountRaw: null, asset: null }
  }

  throw new Error(`x402 schema failed: ${resp.status}`)
}

function isRenewResponse(value: unknown): value is { token: string; expiresAt: string; sliceSeconds: number } {
  if (!isRecord(value)) return false
  return typeof value.token === "string" && typeof value.expiresAt === "string" && typeof value.sliceSeconds === "number"
}

export async function renewHttp(
  ctx: X402Context,
  renewUrl: string,
  oldToken: string
): Promise<{ token: string; expiresAt: string; sliceSeconds: number }> {
  const resp = await ctx.fetchWithPayment(renewUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: oldToken })
  })
  if (!resp.ok) throw new Error(`renew failed: ${resp.status}`)
  const data = await resp.json()
  if (!isRenewResponse(data)) {
    throw new Error("renew response shape invalid")
  }
  return data
}

export async function renewInband(
  ctx: X402Context,
  renewUrl: string,
  oldToken: string
): Promise<{ paymentRequired: PaymentRequiredV1Compat | PaymentRequiredV2Compat }> {
  const resp = await fetch(renewUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: oldToken })
  })
  if (resp.status !== 402) throw new Error(`expected 402 challenge, got ${resp.status}`)
  const decoded = await resp.json().catch(() => undefined)
  const paymentRequired = ctx.httpClient.getPaymentRequiredResponse((name) => resp.headers.get(name), decoded)
  if (!isPaymentRequired(paymentRequired)) {
    throw new Error("payment-required response shape invalid")
  }
  return { paymentRequired }
}

function isCoreNetwork(value: string): value is Network {
  return isNetworkV2(value)
}

export function toCorePaymentRequired(value: PaymentRequiredV2Compat): CorePaymentRequired {
  const accepts: CorePaymentRequirements[] = value.accepts.map((requirement) => {
    if (!isCoreNetwork(requirement.network)) {
      throw new Error(`invalid payment network: ${requirement.network}`)
    }
    return { ...requirement, network: requirement.network }
  })

  return {
    x402Version: value.x402Version,
    resource: value.resource,
    accepts,
    ...(value.extensions ? { extensions: value.extensions } : {}),
    ...(value.error ? { error: value.error } : {})
  }
}
