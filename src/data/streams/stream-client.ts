import { EventEmitter } from "eventemitter3"
import WebSocket from "ws"

import {
  buildRenewUrl,
  parseSchemaVersion,
  renewHttp,
  renewInband,
  requestStreamSchema,
  toCorePaymentRequired,
  type RenewMethod,
  type X402Context
} from "./x402.js"
import { isPaymentPayload, isWsEvent, isWsStatusEvent, isWsX402Event, safeJsonParse } from "./protocol.js"
import type { WsTypedEvent } from "./protocol.js"
import type { ClientMsg, ClientOptions, StreamId, WsStatusEvent, WsX402Event } from "../../types/stream.types.js"

export interface StreamClientEvents {
  event: (event: WsTypedEvent) => void
  status: (event: WsStatusEvent) => void
  x402: (event: WsX402Event) => void
  lease: (token: string) => void
  connected: () => void
  disconnected: () => void
  error: (error: Error) => void
}

export interface StreamClientConfig {
  httpBase: string
  schemaPath: string
  renewMethod: RenewMethod
  streamId: StreamId
  x402: X402Context
  options?: Partial<ClientOptions>
  watchAccounts?: string[]
  watchPrograms?: string[]
  watchMints?: string[]
}

export class StreamClient extends EventEmitter<StreamClientEvents> {
  private config: StreamClientConfig
  private ws: WebSocket | null = null
  private currentToken: string | null = null
  private renewUrl: string | null = null
  private schemaVersion: "v1" | "v2"

  constructor(config: StreamClientConfig) {
    super()
    this.config = config
    this.schemaVersion = parseSchemaVersion(config.schemaPath)
  }

  async connect(): Promise<void> {
    const { wsUrl, token, streamId } = await requestStreamSchema(
      this.config.x402,
      this.config.httpBase,
      this.config.schemaPath
    )
    if (streamId !== this.config.streamId) {
      throw new Error(`schema stream mismatch: expected ${this.config.streamId} got ${streamId}`)
    }

    this.setLeaseToken(token)
    this.renewUrl = buildRenewUrl(this.config.httpBase, streamId, this.schemaVersion)
    this.ws = new WebSocket(wsUrl)

    this.ws.on("open", () => {
      this.emit("connected")
      this.applyOptionsAndWatchlists()
      this.send({ op: "getState" })
    })

    this.ws.on("message", async (data: WebSocket.RawData) => {
      const raw = this.decodeMessage(data)
      if (!raw) return

      const decoded = safeJsonParse(raw)
      if (!decoded) return

      if (isWsX402Event(decoded)) {
        this.emit("x402", decoded)
        await this.handleX402(decoded)
        return
      }

      if (isWsStatusEvent(decoded)) {
        this.emit("status", decoded)
      }

      if (isWsEvent(decoded)) {
        this.emit("event", decoded)
      }
    })

    this.ws.on("close", () => {
      this.emit("disconnected")
    })

    this.ws.on("error", (err) => {
      this.emit("error", err instanceof Error ? err : new Error(String(err)))
    })
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  send(message: ClientMsg): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify(message))
  }

  addMints(mints: string[]): void {
    const normalized = this.normalizeList(mints)
    if (normalized.length === 0) return
    const { next, added } = this.mergeList(this.config.watchMints, normalized)
    if (added.length === 0) return
    this.config.watchMints = next
    this.send({ op: "addMints", mints: added })
  }

  removeMints(mints: string[]): void {
    const normalized = this.normalizeList(mints)
    if (normalized.length === 0) return
    const { next, removed } = this.subtractList(this.config.watchMints, normalized)
    if (removed.length === 0) return
    this.config.watchMints = next
    this.send({ op: "removeMints", mints: removed })
  }

  addAccounts(accounts: string[]): void {
    const normalized = this.normalizeList(accounts)
    if (normalized.length === 0) return
    const { next, added } = this.mergeList(this.config.watchAccounts, normalized)
    if (added.length === 0) return
    this.config.watchAccounts = next
    this.send({ op: "addAccounts", accounts: added })
  }

  removeAccounts(accounts: string[]): void {
    const normalized = this.normalizeList(accounts)
    if (normalized.length === 0) return
    const { next, removed } = this.subtractList(this.config.watchAccounts, normalized)
    if (removed.length === 0) return
    this.config.watchAccounts = next
    this.send({ op: "removeAccounts", accounts: removed })
  }

  private applyOptionsAndWatchlists(): void {
    if (this.config.options) {
      this.send({ op: "setOptions", ...this.config.options })
    }
    if (this.config.watchAccounts?.length) {
      this.send({ op: "setAccounts", accounts: this.config.watchAccounts })
    }
    if (this.config.watchPrograms?.length) {
      this.send({ op: "setPrograms", programs: this.config.watchPrograms })
    }
    if (this.config.watchMints?.length) {
      this.send({ op: "setMints", mints: this.config.watchMints })
    }
  }

  private normalizeList(values: string[]): string[] {
    return values.map((value) => value.trim()).filter(Boolean)
  }

  private mergeList(
    current: string[] | undefined,
    incoming: string[]
  ): { next: string[]; added: string[] } {
    const nextSet = new Set(current ?? [])
    const added: string[] = []

    for (const value of incoming) {
      if (!nextSet.has(value)) {
        nextSet.add(value)
        added.push(value)
      }
    }

    return { next: Array.from(nextSet), added }
  }

  private subtractList(
    current: string[] | undefined,
    incoming: string[]
  ): { next: string[]; removed: string[] } {
    const nextSet = new Set(current ?? [])
    const removed: string[] = []

    for (const value of incoming) {
      if (nextSet.delete(value)) {
        removed.push(value)
      }
    }

    return { next: Array.from(nextSet), removed }
  }

  private async handleX402(event: WsX402Event): Promise<void> {
    if (!this.renewUrl || !this.currentToken) return
    if (event.op !== "renewal_reminder" && event.op !== "payment_required") return

    try {
      if (this.config.renewMethod === "http") {
        const renewed = await renewHttp(this.config.x402, this.renewUrl, this.currentToken)
        this.setLeaseToken(renewed.token)
        this.send({ op: "renew_token", token: renewed.token })
        return
      }

      if (this.schemaVersion !== "v2") {
        this.emit("error", new Error("inband renewal requires v2 schema"))
        return
      }

      const { paymentRequired } = await renewInband(this.config.x402, this.renewUrl, this.currentToken)
      if (paymentRequired.x402Version !== 2) {
        throw new Error(`unsupported payment version: ${paymentRequired.x402Version}`)
      }
      if (paymentRequired.accepts.length === 0) {
        throw new Error("payment-required missing accepts")
      }

      const coreRequired = toCorePaymentRequired(paymentRequired)
      const paymentPayload = await this.config.x402.client.createPaymentPayload(coreRequired)
      if (!isPaymentPayload(paymentPayload)) {
        throw new Error("payment payload shape invalid")
      }
      if (paymentPayload.x402Version !== 2) {
        throw new Error(`unexpected payment payload version: ${paymentPayload.x402Version}`)
      }

      const [selected] = paymentRequired.accepts
      if (!selected) {
        throw new Error("payment-required missing accepts")
      }

      this.send({
        op: "renew_inband",
        paymentRequirements: selected,
        paymentPayload
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.emit("error", new Error(message))
    }
  }

  private decodeMessage(data: WebSocket.RawData): string | null {
    if (typeof data === "string") return data
    if (Buffer.isBuffer(data)) return data.toString("utf8")
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8")
    if (Array.isArray(data)) {
      if (data.every((item): item is Buffer => Buffer.isBuffer(item))) {
        return Buffer.concat(data).toString("utf8")
      }
      return null
    }
    return null
  }

  private setLeaseToken(token: string): void {
    this.currentToken = token
    this.emit("lease", token)
  }
}
