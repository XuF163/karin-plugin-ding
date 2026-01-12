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
    if (topic !== TOPIC_ROBOT && topic !== TOPIC_ROBOT_DELEGATE) {
      // TODO: card callback / other topics -> notice event
      return
    }

    const raw = toStr(streamEvent?.data?.toString?.('utf8') ?? '')
    if (!raw) return

    const parsed = safeJsonParse<any>(raw)
    if (!parsed.ok) {
      logger.bot('warn', this.selfId, `[recv] invalid json: ${parsed.error.message}`)
      return
    }

    const data = parsed.value

    this.openApi.updateFromCallbackData(data)
    this.updateSessionWebhookCacheFromEvent(data)

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
        srcReply: (els) => this.sendMsg(contact, els),
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
      srcReply: (els) => this.sendMsg(contact, els),
    })
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

  async sendMsg (contact: Contact, elements: Elements[], _retryCount = 0): Promise<SendMsgResults> {
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

    const sendText = async (content: string) => {
      if (webhookCtx?.webhook) {
        const resp = await sendWebhookText({
          webhook: webhookCtx.webhook,
          secret: webhookCtx.secret,
          content: content || ' ',
          at: { atUserIds: Array.from(atUserIds), isAtAll },
        })
        responses.push(resp)
        lastMessageId = `${this.selfId}_${Date.now()}`
        return
      }

      if (!this.canUseOpenApiSend()) throw new Error('[dingtalk] no available webhook, and enableOpenApiSend=false')

      const robotCode = this.resolveRobotCodeFromEvent({})
      if (!robotCode) throw new Error('[dingtalk] OpenAPI send requires robotCode (config or callback)')

      if (contact.scene === 'group') {
        const resp = await this.openApi.sendGroupMessage({
          openConversationId: contact.peer,
          kind: 'text',
          content,
          robotCode,
        })
        responses.push(resp)
        lastMessageId = toStr(resp?.processQueryKey || resp?.process_query_key) || `${this.selfId}_${Date.now()}`
        return
      }

      if (contact.scene === 'friend') {
        const resp = await this.openApi.batchSendOtoMessage({
          userIds: [contact.peer],
          kind: 'text',
          content,
          robotCode,
        })
        responses.push(resp)
        lastMessageId = toStr(resp?.processQueryKey || resp?.process_query_key) || `${this.selfId}_${Date.now()}`
        return
      }

      throw new Error(`[dingtalk] unsupported contact.scene=${contact.scene}`)
    }

    const sendImage = async (file: string) => {
      const clean = toStr(file).trim()
      if (!clean) return

      if (webhookCtx?.webhook) {
        if (this.enablePublicImageBed && /^https?:\/\//i.test(clean)) {
          const resp = await sendWebhookMarkdown({
            webhook: webhookCtx.webhook,
            secret: webhookCtx.secret,
            title: '图片',
            text: `![图片](${clean})\n`,
          })
          responses.push(resp)
          lastMessageId = `${this.selfId}_${Date.now()}`
          return
        }

        const info = await fileToBuffer(clean, `image_${Date.now()}`)
        const base64 = info.buffer.toString('base64')
        const md5 = crypto.createHash('md5').update(info.buffer).digest('hex')
        const resp = await sendWebhookImage({
          webhook: webhookCtx.webhook,
          secret: webhookCtx.secret,
          base64,
          md5,
        })
        responses.push(resp)
        lastMessageId = `${this.selfId}_${Date.now()}`
        return
      }

      if (!this.canUseOpenApiSend()) {
        // 无可用发送链路：降级为文本提示
        await sendText('[图片]')
        return
      }

      const robotCode = this.resolveRobotCodeFromEvent({})
      if (!robotCode) {
        await sendText('[图片]')
        return
      }

      // OpenAPI: photoURL 可为 URL 或 media_id；这里优先用 URL，否则 media/upload 再发
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

      await sendText('[图片]')
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

  async recallMsg (_contact: Contact, _messageId: string): Promise<void> {
    // DingTalk webhook does not support recalling messages; keep no-op to avoid crashing scheduled recall.
  }
}
