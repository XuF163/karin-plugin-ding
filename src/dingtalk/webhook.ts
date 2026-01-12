import crypto from 'node:crypto'
import { toStr } from './utils'

export interface DingTalkWebhookAt {
  atUserIds?: string[]
  isAtAll?: boolean
}

export const signWebhookUrl = (webhook: string, secret?: string): string => {
  const s = toStr(secret)
  if (!s) return webhook

  try {
    const url = new URL(webhook)

    // 如果 URL 已经带了 sign/timestamp（例如会话级 webhook），不要覆盖，避免误签导致失败
    if (url.searchParams.has('sign') || url.searchParams.has('timestamp')) return webhook

    const timestamp = Date.now()
    const stringToSign = `${timestamp}\n${s}`
    const sign = encodeURIComponent(
      crypto.createHmac('sha256', s).update(stringToSign).digest('base64'),
    )

    url.searchParams.set('timestamp', String(timestamp))
    url.searchParams.set('sign', sign)
    return url.toString()
  } catch {
    return webhook
  }
}

const postWebhook = async (webhook: string, body: any): Promise<any> => {
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!res.ok) {
    throw new Error(`[DingTalkWebhook] HTTP ${res.status}: ${text || 'empty response'}`)
  }

  const errcode = Number(json?.errcode ?? json?.errCode ?? 0)
  if (Number.isFinite(errcode) && errcode !== 0) {
    throw new Error(`[DingTalkWebhook] errcode=${errcode}: ${toStr(json?.errmsg || json?.message) || 'unknown error'}`)
  }

  return json
}

export const sendWebhookText = async (params: {
  webhook: string
  secret?: string
  content: string
  at?: DingTalkWebhookAt
}): Promise<any> => {
  const webhook = signWebhookUrl(params.webhook, params.secret)
  const body: any = {
    msgtype: 'text',
    text: { content: toStr(params.content) },
  }

  const atUserIds = Array.isArray(params.at?.atUserIds) ? params.at!.atUserIds.filter(Boolean).map(String) : []
  const isAtAll = Boolean(params.at?.isAtAll)
  if (atUserIds.length || isAtAll) body.at = { atUserIds, isAtAll }

  return await postWebhook(webhook, body)
}

export const sendWebhookMarkdown = async (params: {
  webhook: string
  secret?: string
  title: string
  text: string
  at?: DingTalkWebhookAt
}): Promise<any> => {
  const webhook = signWebhookUrl(params.webhook, params.secret)
  const body: any = {
    msgtype: 'markdown',
    markdown: { title: toStr(params.title) || '消息', text: toStr(params.text) },
  }

  const atUserIds = Array.isArray(params.at?.atUserIds) ? params.at!.atUserIds.filter(Boolean).map(String) : []
  const isAtAll = Boolean(params.at?.isAtAll)
  if (atUserIds.length || isAtAll) body.at = { atUserIds, isAtAll }

  return await postWebhook(webhook, body)
}

export const sendWebhookImage = async (params: {
  webhook: string
  secret?: string
  base64: string
  md5: string
}): Promise<any> => {
  const webhook = signWebhookUrl(params.webhook, params.secret)
  const body = {
    msgtype: 'image',
    image: {
      base64: toStr(params.base64),
      md5: toStr(params.md5),
    },
  }
  return await postWebhook(webhook, body)
}
