import crypto from 'node:crypto'
import {
  AdapterBase,
  type Contact,
  type Elements,
  type NodeElement,
  type SendMsgResults,
  contactFriend,
  contactGroup,
  createFriendMessage,
  createGroupMessage,
  fileToUrl,
  karin,
  senderFriend,
  senderGroup,
  logger,
} from 'node-karin'
import { DWClient, EventAck, TOPIC_ROBOT } from 'dingtalk-stream'
import type { Config, DingTalkAccountConfig } from '@/utils'
import { TOPIC_CARD_CALLBACK, TOPIC_ROBOT_DELEGATE } from './constants'
import { fileToBuffer } from './file'
import { DingTalkOpenApiClient } from './openapi'
import { DingTalkOApiClient } from './oapi'
import { parseMessageSegments, segmentsToElements, DOWNLOAD_CODE_PREFIX, toScene } from './message'
import { SessionWebhookCache } from './sessionWebhookCache'
import { safeJsonParse, toStr, uniq } from './utils'
import { ProactiveWebhookBinding } from './webhookBinding'
import { sendWebhookImage, sendWebhookMarkdown, sendWebhookText } from './webhook'
import { buildDingtalkNoticeEvent, sanitizeEventSegment } from './notice'

export class DingTalkBot extends AdapterBase<DWClient> {
  public readonly accountId: string
  public readonly accountConfig: DingTalkAccountConfig
  public readonly globalConfig: Config

  public readonly openApi: DingTalkOpenApiClient
  public readonly oapi: DingTalkOApiClient

  public connected = false
  public lastConnectAt = 0
  public lastMessageAt = 0
  public lastError = ''

  private readonly sessionWebhookCache: SessionWebhookCache
  private readonly webhookBinding: ProactiveWebhookBinding
  private lastRecallHintAt = 0

  constructor (params: {
    globalConfig: Config
    accountConfig: DingTalkAccountConfig
    sessionWebhookCache: SessionWebhookCache
    webhookBinding: ProactiveWebhookBinding
  }) {
    super()

    this.globalConfig = params.globalConfig
    this.accountConfig = params.accountConfig
    this.accountId = params.accountConfig.accountId
    this.sessionWebhookCache = params.sessionWebhookCache
    this.webhookBinding = params.webhookBinding

    this.super = new DWClient({
      clientId: params.accountConfig.clientId,
      clientSecret: params.accountConfig.clientSecret,
      debug: params.accountConfig.debug ?? params.globalConfig.debugGlobal ?? false,
      keepAlive: params.accountConfig.keepAlive ?? true,
      autoReconnect: params.accountConfig.autoReconnect ?? true,
    }) as unknown as DWClient
    this.raw = this.super

    const selfId = `DingDing_${this.accountId}`
    this.account = {
      uin: toStr(params.accountConfig.clientId),
      uid: toStr(params.accountConfig.robotCode || params.accountConfig.clientId),
      selfId,
      subId: {},
      name: toStr(params.accountConfig.botName) || `DingTalkBot (${this.accountId})`,
      avatar: toStr(params.accountConfig.botAvatar),
    }

    this.adapter = {
      index: -1,
      name: 'dingtalk-stream',
      version: '0.0.0',
      platform: 'other',
      standard: 'other',
      protocol: 'other',
      communication: 'webSocketClient',
      address: `dingtalk-stream://${toStr(params.accountConfig.clientId)}`,
      secret: null,
      connectTime: Date.now(),
    }

    this.openApi = new DingTalkOpenApiClient({
      accountId: this.accountId,
      clientId: params.accountConfig.clientId,
      clientSecret: params.accountConfig.clientSecret,
      corpId: params.accountConfig.corpId,
      robotCode: params.accountConfig.robotCode,
      debug: params.accountConfig.debug ?? params.globalConfig.debugGlobal ?? false,
    })

    this.oapi = new DingTalkOApiClient({
      accountId: this.accountId,
      clientId: params.accountConfig.clientId,
      clientSecret: params.accountConfig.clientSecret,
      debug: params.accountConfig.debug ?? params.globalConfig.debugGlobal ?? false,
    })
  }

  private resolveAtUserId (raw: string): string {
    const key = toStr(raw).trim()
    if (!key) return ''

    const map = this.accountConfig.atUserIdMap
    if (map && typeof map === 'object') {
      const hit = map[key]
      if (typeof hit === 'string' && hit.trim()) return hit.trim()
    }
    return key
  }

  private resolveRobotCodeFromEvent (data: any): string {
    const fromEvent = toStr(data?.robotCode || data?.robot_code).trim()
    if (fromEvent) return fromEvent
    const fromClient = toStr(this.openApi.robotCode).trim()
    if (fromClient) return fromClient
    const fromCfg = toStr(this.accountConfig.robotCode).trim()
    if (fromCfg) return fromCfg
    return ''
  }

  private updateSessionWebhookCacheFromEvent (data: any) {
    const webhook = toStr(data?.sessionWebhook).trim()
    const expireAt = Number(data?.sessionWebhookExpiredTime ?? 0)

    const scene = toScene(data?.conversationType)
    const conversationId = toStr(data?.conversationId)
    const userId = toStr(data?.senderStaffId || data?.senderId)

    if (webhook && scene === 'group' && conversationId) {
      this.sessionWebhookCache.set({
        accountId: this.accountId,
        scene: 'group',
        peer: conversationId,
        webhook,
        expireAt,
      })
    }

    if (webhook && scene === 'friend' && userId) {
      this.sessionWebhookCache.set({
        accountId: this.accountId,
        scene: 'friend',
        peer: userId,
        webhook,
        expireAt,
      })
    }
  }

  private async enrichIncomingMedia (segments: ReturnType<typeof parseMessageSegments>, rawData: any) {
    if (this.accountConfig.enableOpenApiDownload === false) return

    const robotCode = this.resolveRobotCodeFromEvent(rawData)
    if (!robotCode) return

    const urlCache = new Map<string, string>()

    for (const seg of segments) {
      if (seg.type !== 'image' && seg.type !== 'file' && seg.type !== 'record' && seg.type !== 'video') continue
      if (!seg.file?.startsWith(DOWNLOAD_CODE_PREFIX)) continue

      const code = seg.file.slice(DOWNLOAD_CODE_PREFIX.length).trim()
      if (!code) continue

      try {
        let url = urlCache.get(code)
        if (!url) {
          url = await this.openApi.downloadMessageFile({ downloadCode: code, robotCode })
          urlCache.set(code, url)
        }
        if (url) seg.file = url
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        logger.bot('warn', this.selfId, `[recv] resolve downloadCode failed: ${msg}`)
      }
    }
  }

  async start () {
    const topics = new Set<string>([TOPIC_ROBOT, TOPIC_ROBOT_DELEGATE, TOPIC_CARD_CALLBACK])
    if (Array.isArray(this.accountConfig.extraTopics)) {
      for (const t of this.accountConfig.extraTopics) {
        if (typeof t === 'string' && t.trim()) topics.add(t.trim())
      }
    }

    for (const topic of topics) {
      this.super.registerCallbackListener(topic, (event: any) => this.onStreamEvent(topic, event))
    }

    try {
      await this.super.connect()
      this.connected = true
      this.lastConnectAt = Date.now()
      this.lastError = ''
      logger.bot('info', this.selfId, `[connect] connected (topics=${topics.size})`)
    } catch (error: unknown) {
      this.connected = false
      this.lastError = error instanceof Error ? error.message : String(error)
      logger.bot('error', this.selfId, `[connect] failed: ${this.lastError}`)
    }
  }

  private onStreamEvent (topic: string, streamEvent: any) {
    const messageId = streamEvent?.headers?.messageId
    this.lastMessageAt = Date.now()

    if (messageId) {
      try {
        this.super.socketCallBackResponse(messageId, { status: EventAck.SUCCESS, message: 'OK' })
      } catch {
        // ignore
      }
    }

    setImmediate(() => {
      this.handleStreamEvent(topic, streamEvent).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        logger.bot('error', this.selfId, `[recv:${topic}] handler error: ${msg}`)
      })
    })
  }

  private async handleStreamEvent (topic: string, streamEvent: any) {
    const raw = toStr(streamEvent?.data?.toString?.('utf8') ?? '')
    if (!raw) return

    const parsed = safeJsonParse<any>(raw)
    if (!parsed.ok) {
      logger.bot('warn', this.selfId, `[recv:${topic}] invalid json: ${parsed.error.message}`)
      return
    }

    const data = parsed.value

    this.openApi.updateFromCallbackData(data)
    this.updateSessionWebhookCacheFromEvent(data)

    if (topic !== TOPIC_ROBOT && topic !== TOPIC_ROBOT_DELEGATE) {
      this.dispatchNoticeEvent(topic, data, raw, streamEvent)
      return
    }

    const segments = parseMessageSegments(data)
    await this.enrichIncomingMedia(segments, data)

    const elements = segmentsToElements(segments)

    const scene = toScene(data?.conversationType)
    const messageId = toStr(data?.msgId || streamEvent?.headers?.messageId || `${this.selfId}_${Date.now()}`)
    const createAt = Number(data?.createAt)
    const time = Number.isFinite(createAt) && createAt > 0 ? Math.floor(createAt / 1000) : Math.floor(Date.now() / 1000)

    if (scene === 'group') {
      const groupId = toStr(data?.conversationId)
      const groupName = toStr(data?.conversationTitle) || groupId
      const userId = toStr(data?.senderStaffId || data?.senderId)
      const nickname = toStr(data?.senderNick) || userId || 'unknown'

      if (!groupId || !userId) {
        logger.bot('warn', this.selfId, '[recv] missing conversationId/senderStaffId in group message, skip')
        return
      }

      const role = data?.isBoss ? 'owner' : data?.isAdmin ? 'admin' : 'member'

      const contact = contactGroup(groupId, groupName)
      const sender = senderGroup({ userId, role, nick: nickname, name: nickname })

      createGroupMessage({
        bot: this,
        contact,
        sender,
        rawEvent: data,
        time,
        eventId: `message:${messageId}`,
        messageId,
        messageSeq: Number.isFinite(createAt) ? createAt : Date.now(),
        elements,
        srcReply: (els) => this.sendMsg(contact, els, 0, { preferOpenApi: this.canUseOpenApiSend() }),
      })
      return
    }

    // friend
    const userId = toStr(data?.senderStaffId || data?.senderId)
    const nickname = toStr(data?.senderNick) || userId || 'unknown'
    if (!userId) {
      logger.bot('warn', this.selfId, '[recv] missing senderStaffId in private message, skip')
      return
    }
    const contact = contactFriend(userId, nickname)
    const sender = senderFriend(userId, nickname)

    createFriendMessage({
      bot: this,
      contact,
      sender,
      rawEvent: data,
      time,
      eventId: `message:${messageId}`,
      messageId,
      messageSeq: Number.isFinite(createAt) ? createAt : Date.now(),
      elements,
      srcReply: (els) => this.sendMsg(contact, els, 0, { preferOpenApi: this.canUseOpenApiSend() }),
    })
  }

  private dispatchNoticeEvent (topic: string, data: any, raw: string, streamEvent: any) {
    try {
      const noticeType = topic === TOPIC_CARD_CALLBACK ? 'dingtalk_card' : 'dingtalk_event'
      const e = buildDingtalkNoticeEvent({
        botId: this.selfId,
        accountId: this.accountId,
        topic,
        noticeType,
        data,
        raw,
        adapter: { id: this.adapter.name, name: this.adapter.name, version: this.adapter.version },
        streamEvent,
      })

      const seg = sanitizeEventSegment(topic)
      const eventName = noticeType === 'dingtalk_card'
        ? `notice.dingtalk.card.${seg}`
        : `notice.dingtalk.event.${seg}`

      karin.emit(eventName, e)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.bot('error', this.selfId, `[recv:${topic}] dispatch notice error: ${msg}`)
    }
  }

  private resolveWebhook (contact: Contact): { webhook: string, secret?: string } | null {
    if (contact.scene === 'group') {
      const sessionWebhook = this.sessionWebhookCache.get({ accountId: this.accountId, scene: 'group', peer: contact.peer })
      if (sessionWebhook) return { webhook: sessionWebhook, secret: toStr(this.accountConfig.webhookSecret).trim() || undefined }

      const binding = this.webhookBinding.getGroupWebhook(this.accountId, contact.peer)
      if (binding?.webhook) return { webhook: binding.webhook, secret: binding.secret }

      const fallback = toStr(this.accountConfig.webhook).trim() || toStr(this.globalConfig.defaultWebhook).trim()
      if (fallback) return { webhook: fallback, secret: toStr(this.accountConfig.webhookSecret).trim() || undefined }
      return null
    }

    if (contact.scene === 'friend') {
      const sessionWebhook = this.sessionWebhookCache.get({ accountId: this.accountId, scene: 'friend', peer: contact.peer })
      if (sessionWebhook) return { webhook: sessionWebhook, secret: toStr(this.accountConfig.webhookSecret).trim() || undefined }
      return null
    }

    return null
  }

  private canUseOpenApiSend () {
    return this.accountConfig.enableOpenApiSend === true
  }

  private get enablePublicImageBed () {
    return this.accountConfig.enablePublicImageBed ?? this.globalConfig.enablePublicImageBed ?? false
  }

  async sendMsg (
    contact: Contact,
    elements: Elements[],
    _retryCount = 0,
    options?: { preferOpenApi?: boolean },
  ): Promise<SendMsgResults> {
    const preferOpenApi = options?.preferOpenApi === true
    const atUserIds = new Set<string>()
    let isAtAll = false
    const textParts: string[] = []
    const imageFiles: string[] = []

    for (const el of elements) {
      if (!el || typeof el !== 'object') continue
      switch (el.type) {
        case 'text':
          textParts.push(toStr((el as any).text))
          break
        case 'at': {
          const targetId = toStr((el as any).targetId)
          if (targetId === 'all') isAtAll = true
          else if (targetId) atUserIds.add(this.resolveAtUserId(targetId))
          const name = toStr((el as any).name) || targetId
          if (name) textParts.push(`@${name} `)
          break
        }
        case 'image':
          imageFiles.push(toStr((el as any).file))
          break
        case 'reply':
          // DingTalk webhook does not support quote-reply; ignore.
          break
        default:
          textParts.push(`[${toStr((el as any).type) || 'unknown'}]`)
      }
    }

    const webhookCtx = this.resolveWebhook(contact)
    const responses: any[] = []
    const nowSec = Math.floor(Date.now() / 1000)
    let lastMessageId = ''

    const sendOpenApiMessage = async (payload: { kind: 'text' | 'markdown', content: string, title?: string }) => {
      const robotCode = this.resolveRobotCodeFromEvent({})
      if (!robotCode) throw new Error('[dingtalk] OpenAPI send requires robotCode (config or callback)')

      if (contact.scene === 'group') {
        const resp = await this.openApi.sendGroupMessage({
          openConversationId: contact.peer,
          kind: payload.kind,
          content: payload.content,
          title: payload.title,
          robotCode,
        })
        responses.push(resp)
        lastMessageId = toStr(resp?.processQueryKey || resp?.process_query_key) || `${this.selfId}_${Date.now()}`
        return
      }

      if (contact.scene === 'friend') {
        const resp = await this.openApi.batchSendOtoMessage({
          userIds: [contact.peer],
          kind: payload.kind,
          content: payload.content,
          title: payload.title,
          robotCode,
        })
        responses.push(resp)
        lastMessageId = toStr(resp?.processQueryKey || resp?.process_query_key) || `${this.selfId}_${Date.now()}`
        return
      }

      throw new Error(`[dingtalk] unsupported contact.scene=${contact.scene}`)
    }

    const sendText = async (content: string) => {
      const payload = content || ' '

      if (preferOpenApi && this.canUseOpenApiSend()) {
        try {
          await sendOpenApiMessage({ kind: 'text', content: payload })
          return
        } catch (error: unknown) {
          if (!webhookCtx?.webhook) throw error
          const msg = error instanceof Error ? error.message : String(error)
          logger.bot('warn', this.selfId, `[send] OpenAPI text send failed, fallback to webhook: ${msg}`)
        }
      }

      if (webhookCtx?.webhook) {
        const resp = await sendWebhookText({
          webhook: webhookCtx.webhook,
          secret: webhookCtx.secret,
          content: payload,
          at: { atUserIds: Array.from(atUserIds), isAtAll },
        })
        responses.push(resp)
        lastMessageId = `${this.selfId}_${Date.now()}`
        return
      }

      if (!this.canUseOpenApiSend()) throw new Error('[dingtalk] no available webhook, and enableOpenApiSend=false')
      await sendOpenApiMessage({ kind: 'text', content: payload })
    }

    const sendImage = async (file: string) => {
      const clean = toStr(file).trim()
      if (!clean) return

      const maxWebhookImageBytes = 15 * 1024

      const tryGetPublicUrl = async (): Promise<string | null> => {
        if (/^https?:\/\//i.test(clean)) return clean
        try {
          const info = await fileToBuffer(clean, `image_${Date.now()}`)
          const res = await fileToUrl('image', info.buffer, info.name)
          const url = toStr((res as any)?.url).trim()
          if (/^https?:\/\//i.test(url)) return url
        } catch {
          // ignore
        }
        return null
      }

      const sendMarkdownImageByWebhook = async (url: string) => {
        const resp = await sendWebhookMarkdown({
          webhook: webhookCtx!.webhook,
          secret: webhookCtx?.secret,
          title: '图片',
          text: `![图片](${url})\n`,
          at: { atUserIds: Array.from(atUserIds), isAtAll },
        })
        responses.push(resp)
        lastMessageId = `${this.selfId}_${Date.now()}`
      }

      const sendBase64ImageByWebhook = async () => {
        const info = await fileToBuffer(clean, `image_${Date.now()}`)
        if (info.buffer.length > maxWebhookImageBytes) {
          throw new Error(`[dingtalk] webhook image too large: ${info.buffer.length} bytes`)
        }

        const base64 = info.buffer.toString('base64')
        const md5 = crypto.createHash('md5').update(info.buffer).digest('hex')
        const resp = await sendWebhookImage({
          webhook: webhookCtx!.webhook,
          secret: webhookCtx?.secret,
          base64,
          md5,
        })
        responses.push(resp)
        lastMessageId = `${this.selfId}_${Date.now()}`
      }

      const sendImageByOpenApi = async () => {
        const robotCode = this.resolveRobotCodeFromEvent({})
        if (!robotCode) throw new Error('[dingtalk] OpenAPI image send requires robotCode (config or callback)')

        // OpenAPI: photoURL can be URL or media_id; prefer URL, otherwise upload via OAPI.
        let photoURL = clean
        if (!/^https?:\/\//i.test(clean)) {
          const info = await fileToBuffer(clean, `image_${Date.now()}`)
          photoURL = await this.oapi.uploadMedia({
            type: 'image',
            buffer: info.buffer,
            fileName: info.name,
            mimeType: info.mimeType,
          })
        }

        if (contact.scene === 'group') {
          const resp = await this.openApi.sendGroupImageMessage({
            openConversationId: contact.peer,
            photoURL,
            robotCode,
          })
          responses.push(resp)
          lastMessageId = toStr(resp?.processQueryKey || resp?.process_query_key) || `${this.selfId}_${Date.now()}`
          return
        }

        if (contact.scene === 'friend') {
          const resp = await this.openApi.batchSendOtoImageMessage({
            userIds: [contact.peer],
            photoURL,
            robotCode,
          })
          responses.push(resp)
          lastMessageId = toStr(resp?.processQueryKey || resp?.process_query_key) || `${this.selfId}_${Date.now()}`
          return
        }

        throw new Error(`[dingtalk] unsupported contact.scene=${contact.scene}`)
      }

      if (webhookCtx?.webhook) {
        // enablePublicImageBed=true: prefer Markdown image (requires public URL)
        if (this.enablePublicImageBed) {
          const url = await tryGetPublicUrl()
          if (url) {
            await sendMarkdownImageByWebhook(url)
            return
          }
        } else {
          // enablePublicImageBed=false: prefer media/upload + OpenAPI image message (no public URL required)
          try {
            await sendImageByOpenApi()
            return
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error)
            logger.bot('warn', this.selfId, `[send] OpenAPI image send failed, fallback to webhook: ${msg}`)
          }
        }

        // fallback: tiny image -> webhook image(base64+md5)
        try {
          await sendBase64ImageByWebhook()
          return
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error)
          logger.bot('warn', this.selfId, `[send] webhook image(base64) failed: ${msg}`)
        }

        // fallback: if public URL is available, try Markdown image
        const url = await tryGetPublicUrl()
        if (url) {
          try {
            await sendMarkdownImageByWebhook(url)
            return
          } catch {
            // ignore
          }
        }

        await sendText('[图片]')
        return
      }

      if (!this.canUseOpenApiSend()) throw new Error('[dingtalk] no available webhook, and enableOpenApiSend=false')

      // no webhook: try Markdown image (if public URL is available), otherwise fallback to OpenAPI image
      if (this.enablePublicImageBed) {
        const url = await tryGetPublicUrl()
        if (url) {
          await sendOpenApiMessage({ kind: 'markdown', title: '图片', content: `![图片](${url})\n` })
          return
        }
      }

      await sendImageByOpenApi()
    }

    const text = textParts.join('').trim()
    if (text || atUserIds.size || isAtAll) await sendText(text || ' ')
    for (const f of uniq(imageFiles)) await sendImage(f)

    if (!lastMessageId) lastMessageId = `${this.selfId}_${Date.now()}`

    return {
      messageId: lastMessageId,
      time: nowSec,
      rawData: responses.length === 1 ? responses[0] : responses,
      message_id: lastMessageId,
      messageTime: nowSec,
    }
  }

  async sendForwardMsg (contact: Contact, _elements: NodeElement[]): Promise<{ messageId: string, forwardId: string }> {
    const res = await this.sendMsg(contact, [{ type: 'text', text: '[不支持合并转发] 请改用普通文本/图片发送' } as any])
    return { messageId: res.messageId, forwardId: res.messageId }
  }

  async recallMsg (contact: Contact, messageId: string): Promise<void> {
    const raw = toStr(messageId).trim()
    if (!raw) return

    const explicit = /^openapi:/i.test(raw)
    const key = raw.replace(/^openapi:/i, '').trim()
    if (!key) return

    const looksLikeWebhookSendId = raw.startsWith(`${this.selfId}_`)
    if (looksLikeWebhookSendId && !explicit) {
      const now = Date.now()
      if (now - this.lastRecallHintAt > 60_000) {
        this.lastRecallHintAt = now
        logger.bot('warn', this.selfId, '[recall] skip: non-OpenAPI messageId (webhook sends cannot be recalled).')
      }
      return
    }

    const robotCode = this.resolveRobotCodeFromEvent({})
    if (!robotCode) {
      logger.bot('warn', this.selfId, '[recall] missing robotCode, skip')
      return
    }

    try {
      if (contact.scene === 'group') {
        const resp = await this.openApi.recallGroupMessages({
          openConversationId: contact.peer,
          processQueryKeys: [key],
          robotCode,
        })
        const ok = resp?.success ?? resp?.result ?? resp?.data?.success ?? resp?.data?.result
        if (typeof ok === 'boolean' && !ok) {
          throw new Error(`[OpenAPI] groupMessages/recall returned success=false: ${JSON.stringify(resp)}`)
        }
        return
      }

      if (contact.scene === 'friend') {
        const resp = await this.openApi.recallOtoMessages({
          processQueryKeys: [key],
          robotCode,
        })
        const ok = resp?.success ?? resp?.result ?? resp?.data?.success ?? resp?.data?.result
        if (typeof ok === 'boolean' && !ok) {
          throw new Error(`[OpenAPI] otoMessages/batchRecall returned success=false: ${JSON.stringify(resp)}`)
        }
        return
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.bot('warn', this.selfId, `[recall] failed: ${msg}`)
    }
  }
}
