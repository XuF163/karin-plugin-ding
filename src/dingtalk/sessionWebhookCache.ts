import { toStr } from './utils'

export interface SessionWebhookRecord {
  webhook: string
  expireAt: number
}

export class SessionWebhookCache {
  private readonly map = new Map<string, SessionWebhookRecord>()

  private makeKey (accountId: string, scene: string, peer: string) {
    return `${toStr(accountId)}|${toStr(scene)}|${toStr(peer)}`
  }

  set (params: { accountId: string, scene: string, peer: string, webhook: string, expireAt?: number }) {
    const webhook = toStr(params.webhook).trim()
    if (!webhook) return
    const expireAt = Number(params.expireAt ?? 0)

    this.map.set(this.makeKey(params.accountId, params.scene, params.peer), {
      webhook,
      expireAt: Number.isFinite(expireAt) && expireAt > 0 ? expireAt : 0,
    })
  }

  get (params: { accountId: string, scene: string, peer: string }): string | null {
    const key = this.makeKey(params.accountId, params.scene, params.peer)
    const hit = this.map.get(key)
    if (!hit) return null

    if (hit.expireAt > 0 && Date.now() > hit.expireAt) {
      this.map.delete(key)
      return null
    }

    return hit.webhook
  }
}
