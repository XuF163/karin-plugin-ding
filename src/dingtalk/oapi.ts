import { logger } from 'node-karin'
import { redact, toStr } from './utils'

const OAPI_BASE = 'https://oapi.dingtalk.com'

type FetchJsonError = Error & { status?: number, code?: string | number, response?: unknown }

const sanitizeUrl = (input: string): string => {
  try {
    const url = new URL(String(input))
    for (const key of ['access_token', 'appkey', 'appsecret']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '***')
    }
    return url.toString()
  } catch {
    return String(input)
      .replace(/(access_token)=([^&]+)/g, '$1=***')
      .replace(/(appkey)=([^&]+)/g, '$1=***')
      .replace(/(appsecret)=([^&]+)/g, '$1=***')
  }
}

const fetchJson = async (url: string, options: RequestInit): Promise<any> => {
  let res: Response
  try {
    res = await fetch(url, options)
  } catch (error: unknown) {
    const safeUrl = sanitizeUrl(url)
    const err: FetchJsonError = error instanceof Error ? error : new Error(String(error))
    if (!err.message.includes(safeUrl)) err.message = `${err.message} (${safeUrl})`
    throw err
  }

  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!res.ok) {
    const msg = json?.errmsg || json?.message || text || `HTTP ${res.status}`
    const err: FetchJsonError = new Error(`[OAPI] HTTP ${res.status}: ${msg}`)
    err.status = res.status
    err.response = json ?? text
    throw err
  }

  const errCode = json?.errcode ?? json?.errCode ?? json?.code
  if (typeof errCode === 'number' && errCode !== 0) {
    const err: FetchJsonError = new Error(`[OAPI] ${json?.errmsg || json?.message || `errcode=${errCode}`}`)
    err.code = errCode
    err.response = json
    throw err
  }
  if (typeof errCode === 'string' && errCode && errCode !== '0' && errCode !== 'OK') {
    const err: FetchJsonError = new Error(`[OAPI] ${json?.message || json?.errmsg || errCode}`)
    err.code = errCode
    err.response = json
    throw err
  }

  return json
}

export class DingTalkOApiClient {
  private token: { accessToken: string, expireAt: number } | null = null

  constructor (
    public readonly options: {
      accountId: string
      clientId: string
      clientSecret: string
      debug?: boolean
      timeoutMs?: number
    },
  ) {}

  private get accountId () {
    return this.options.accountId
  }

  private get clientId () {
    return this.options.clientId
  }

  private get clientSecret () {
    return this.options.clientSecret
  }

  private get debug () {
    return Boolean(this.options.debug)
  }

  private get timeoutMs () {
    return Number(this.options.timeoutMs ?? 15_000) || 15_000
  }

  private log (...args: any[]) {
    if (!this.debug) return
    logger.info(`[DingOAPI:${this.accountId || 'unknown'}]`, ...args)
  }

  async getAccessToken (): Promise<string> {
    const now = Date.now()
    if (this.token?.accessToken && (this.token.expireAt - now) > 60_000) {
      return this.token.accessToken
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error('[OAPI] clientId/clientSecret is required for gettoken')
    }

    const url = `${OAPI_BASE}/gettoken?appkey=${encodeURIComponent(this.clientId)}&appsecret=${encodeURIComponent(this.clientSecret)}`
    this.log('gettoken', redact(this.clientId), redact(this.clientSecret))

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const json = await fetchJson(url, { method: 'GET', signal: controller.signal })
      const token = toStr(json?.access_token)
      const expiresIn = Number(json?.expires_in) || 7200
      if (!token) throw new Error('[OAPI] gettoken returned empty access_token')

      this.token = { accessToken: token, expireAt: now + expiresIn * 1000 }
      return token
    } finally {
      clearTimeout(t)
    }
  }

  async uploadMedia (params: {
    type?: 'image' | 'voice' | 'file'
    buffer: Buffer
    fileName?: string
    mimeType?: string
  }): Promise<string> {
    if (!(params.buffer instanceof Buffer)) throw new Error('[OAPI] uploadMedia requires buffer')

    const token = await this.getAccessToken()
    const url = `${OAPI_BASE}/media/upload?access_token=${encodeURIComponent(token)}&type=${encodeURIComponent(params.type ?? 'image')}`

    const name = toStr(params.fileName) || `upload_${Date.now()}`
    const mt = toStr(params.mimeType) || 'application/octet-stream'

    const blob = new Blob([params.buffer], { type: mt })
    const form = new FormData()
    form.append('media', blob, name)

    this.log('media/upload', params.type ?? 'image', name, mt, `size=${params.buffer.length}`)

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const json = await fetchJson(url, { method: 'POST', body: form, signal: controller.signal })
      const mediaId = toStr(json?.media_id || json?.mediaId)
      if (!mediaId) throw new Error('[OAPI] media/upload returned empty media_id')
      return mediaId
    } finally {
      clearTimeout(t)
    }
  }
}
