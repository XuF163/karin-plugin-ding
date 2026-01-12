import { logger } from 'node-karin'
import { redact, toStr } from './utils'

const OPENAPI_BASE = 'https://api.dingtalk.com'

type FetchJsonError = Error & { status?: number, code?: string | number, response?: unknown }

const fetchJson = async (url: string, options: RequestInit): Promise<any> => {
  const res = await fetch(url, options)
  const text = await res.text()

  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!res.ok) {
    const msg = json?.message || json?.errmsg || text || `HTTP ${res.status}`
    const err: FetchJsonError = new Error(`[OpenAPI] HTTP ${res.status}: ${msg}`)
    err.status = res.status
    err.response = json ?? text
    throw err
  }

  const errCode = json?.errcode ?? json?.errCode ?? json?.code
  if (typeof errCode === 'number' && errCode !== 0) {
    const err: FetchJsonError = new Error(`[OpenAPI] ${json?.errmsg || json?.message || `errcode=${errCode}`}`)
    err.code = errCode
    err.response = json
    throw err
  }

  if (typeof errCode === 'string' && errCode && errCode !== '0' && errCode !== 'OK') {
    const err: FetchJsonError = new Error(`[OpenAPI] ${json?.message || json?.errmsg || errCode}`)
    err.code = errCode
    err.response = json
    throw err
  }

  return json
}

export class DingTalkOpenApiClient {
  private token: { accessToken: string, expireAt: number } | null = null

  public corpId = ''
  public robotCode = ''

  constructor (
    public readonly options: {
      accountId: string
      clientId: string
      clientSecret: string
      corpId?: string
      robotCode?: string
      debug?: boolean
      timeoutMs?: number
    },
  ) {
    this.corpId = toStr(options.corpId)
    this.robotCode = toStr(options.robotCode)
  }

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
    return Number(this.options.timeoutMs ?? 10_000) || 10_000
  }

  updateFromCallbackData (data: any) {
    const corpId = toStr(
      data?.senderCorpId
      || data?.chatbotCorpId
      || data?.corpId
      || data?.corp_id,
    )
    if (!this.corpId && corpId) this.corpId = corpId

    const robotCode = toStr(data?.robotCode || data?.robot_code)
    if (!this.robotCode && robotCode) this.robotCode = robotCode
  }

  setCorpId (corpId: string) {
    if (corpId) this.corpId = toStr(corpId)
  }

  setRobotCode (robotCode: string) {
    if (robotCode) this.robotCode = toStr(robotCode)
  }

  private log (...args: any[]) {
    if (!this.debug) return
    logger.info(`[DingOpenAPI:${this.accountId || 'unknown'}]`, ...args)
  }

  async getAccessToken (): Promise<string> {
    const now = Date.now()
    if (this.token?.accessToken && (this.token.expireAt - now) > 60_000) {
      return this.token.accessToken
    }

    if (!this.corpId) {
      throw new Error('[OpenAPI] corpId is required for /v1.0/oauth2/{corpId}/token')
    }

    const url = `${OPENAPI_BASE}/v1.0/oauth2/${encodeURIComponent(this.corpId)}/token`
    const body = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'client_credentials',
    }

    this.log('refresh token', `corpId=${this.corpId}`, `clientId=${redact(this.clientId)}`)

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const json = await fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      const accessToken = toStr(json?.access_token || json?.accessToken)
      const expiresInSec = Number(json?.expires_in ?? json?.expireIn ?? 0)
      if (!accessToken || !Number.isFinite(expiresInSec) || expiresInSec <= 0) {
        throw new Error(`[OpenAPI] invalid token response: ${JSON.stringify(json)}`)
      }

      this.token = { accessToken, expireAt: now + expiresInSec * 1000 }
      return accessToken
    } finally {
      clearTimeout(t)
    }
  }

  async request (path: string, params: { method?: string, body?: any } = {}): Promise<any> {
    const token = await this.getAccessToken()
    const url = `${OPENAPI_BASE}${path}`

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      return await fetchJson(url, {
        method: params.method ?? 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': token,
        },
        body: params.body === undefined ? undefined : JSON.stringify(params.body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(t)
    }
  }

  async downloadMessageFile (params: { downloadCode: string, robotCode?: string }): Promise<string> {
    const dc = toStr(params.downloadCode)
    if (!dc) throw new Error('[OpenAPI] downloadCode is required')

    const rc = toStr(params.robotCode || this.robotCode)
    if (!rc) throw new Error('[OpenAPI] robotCode is required for messageFiles/download')

    const json = await this.request('/v1.0/robot/messageFiles/download', {
      method: 'POST',
      body: { downloadCode: dc, robotCode: rc },
    })

    const url = toStr(json?.downloadUrl || json?.download_url)
    if (!url) throw new Error(`[OpenAPI] downloadUrl missing in response: ${JSON.stringify(json)}`)
    return url
  }

  async sendGroupMessage (params: {
    openConversationId: string
    kind: 'text' | 'markdown'
    content: string
    title?: string
    robotCode?: string
  }): Promise<any> {
    const cid = toStr(params.openConversationId)
    if (!cid) throw new Error('[OpenAPI] openConversationId is required for groupMessages/send')

    const rc = toStr(params.robotCode || this.robotCode)
    if (!rc) throw new Error('[OpenAPI] robotCode is required for groupMessages/send')

    const msgKey = params.kind === 'markdown' ? 'sampleMarkdown' : 'sampleText'
    const msgParam = params.kind === 'markdown'
      ? JSON.stringify({ title: toStr(params.title) || '消息', text: toStr(params.content) })
      : JSON.stringify({ content: toStr(params.content) })

    return await this.request('/v1.0/robot/groupMessages/send', {
      method: 'POST',
      body: {
        msgParam,
        msgKey,
        openConversationId: cid,
        robotCode: rc,
      },
    })
  }

  async sendGroupImageMessage (params: {
    openConversationId: string
    photoURL: string
    robotCode?: string
  }): Promise<any> {
    const cid = toStr(params.openConversationId)
    if (!cid) throw new Error('[OpenAPI] openConversationId is required for groupMessages/send')

    const rc = toStr(params.robotCode || this.robotCode)
    if (!rc) throw new Error('[OpenAPI] robotCode is required for groupMessages/send')

    const url = toStr(params.photoURL)
    if (!url) throw new Error('[OpenAPI] photoURL is required for image message')

    return await this.request('/v1.0/robot/groupMessages/send', {
      method: 'POST',
      body: {
        msgParam: JSON.stringify({ photoURL: url }),
        msgKey: 'sampleImageMsg',
        openConversationId: cid,
        robotCode: rc,
      },
    })
  }

  async batchSendOtoMessage (params: {
    userIds: string[]
    kind: 'text' | 'markdown'
    content: string
    title?: string
    robotCode?: string
  }): Promise<any> {
    const ids = Array.isArray(params.userIds) ? params.userIds.filter(Boolean).map(String) : []
    if (!ids.length) throw new Error('[OpenAPI] userIds is required for oToMessages/batchSend')

    const rc = toStr(params.robotCode || this.robotCode)
    if (!rc) throw new Error('[OpenAPI] robotCode is required for oToMessages/batchSend')

    const msgKey = params.kind === 'markdown' ? 'sampleMarkdown' : 'sampleText'
    const msgParam = params.kind === 'markdown'
      ? JSON.stringify({ title: toStr(params.title) || '消息', text: toStr(params.content) })
      : JSON.stringify({ content: toStr(params.content) })

    return await this.request('/v1.0/robot/oToMessages/batchSend', {
      method: 'POST',
      body: {
        msgParam,
        msgKey,
        robotCode: rc,
        userIds: ids,
      },
    })
  }

  async batchSendOtoImageMessage (params: {
    userIds: string[]
    photoURL: string
    robotCode?: string
  }): Promise<any> {
    const ids = Array.isArray(params.userIds) ? params.userIds.filter(Boolean).map(String) : []
    if (!ids.length) throw new Error('[OpenAPI] userIds is required for oToMessages/batchSend')

    const rc = toStr(params.robotCode || this.robotCode)
    if (!rc) throw new Error('[OpenAPI] robotCode is required for oToMessages/batchSend')

    const url = toStr(params.photoURL)
    if (!url) throw new Error('[OpenAPI] photoURL is required for image message')

    return await this.request('/v1.0/robot/oToMessages/batchSend', {
      method: 'POST',
      body: {
        msgParam: JSON.stringify({ photoURL: url }),
        msgKey: 'sampleImageMsg',
        robotCode: rc,
        userIds: ids,
      },
    })
  }

  async recallGroupMessages (params: {
    openConversationId: string
    processQueryKeys: string[]
    robotCode?: string
  }): Promise<any> {
    const cid = toStr(params.openConversationId)
    if (!cid) throw new Error('[OpenAPI] openConversationId is required for groupMessages/recall')

    const keys = Array.isArray(params.processQueryKeys) ? params.processQueryKeys.filter(Boolean).map(String) : []
    if (!keys.length) throw new Error('[OpenAPI] processQueryKeys is required for groupMessages/recall')

    const rc = toStr(params.robotCode || this.robotCode)
    if (!rc) throw new Error('[OpenAPI] robotCode is required for groupMessages/recall')

    return await this.request('/v1.0/robot/groupMessages/recall', {
      method: 'POST',
      body: {
        openConversationId: cid,
        processQueryKeys: keys,
        robotCode: rc,
      },
    })
  }

  async recallOtoMessages (params: {
    processQueryKeys: string[]
    robotCode?: string
  }): Promise<any> {
    const keys = Array.isArray(params.processQueryKeys) ? params.processQueryKeys.filter(Boolean).map(String) : []
    if (!keys.length) throw new Error('[OpenAPI] processQueryKeys is required for otoMessages/batchRecall')

    const rc = toStr(params.robotCode || this.robotCode)
    if (!rc) throw new Error('[OpenAPI] robotCode is required for otoMessages/batchRecall')

    // NOTE: official docs use /v1.0/robot/otoMessages/batchRecall (case-sensitive)
    return await this.request('/v1.0/robot/otoMessages/batchRecall', {
      method: 'POST',
      body: {
        processQueryKeys: keys,
        robotCode: rc,
      },
    })
  }
}
