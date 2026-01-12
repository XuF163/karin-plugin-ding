import { logger, registerBot } from 'node-karin'
import { dir } from '@/dir'
import { config, type DingTalkAccountConfig } from '@/utils'
import { DingTalkBot } from './bot'
import { SessionWebhookCache } from './sessionWebhookCache'
import { ProactiveWebhookBinding } from './webhookBinding'
import { toStr } from './utils'

export class DingTalkService {
  private readonly sessionWebhookCache = new SessionWebhookCache()
  private readonly webhookBinding = new ProactiveWebhookBinding()

  private readonly bots = new Map<string, DingTalkBot>()

  getAllBots () {
    return Array.from(this.bots.values())
  }

  getBotBySelfId (selfId: string) {
    return this.bots.get(selfId)
  }

  getBotByAccountId (accountId: string) {
    const id = toStr(accountId)
    return this.getAllBots().find(b => b.accountId === id)
  }

  bindGroupWebhook (params: { accountId: string, groupId: string, webhook: string, secret?: string }) {
    this.webhookBinding.setGroupWebhook(params.accountId, params.groupId, params.webhook, params.secret)
  }

  unbindGroupWebhook (params: { accountId: string, groupId: string }): boolean {
    return this.webhookBinding.deleteGroupWebhook(params.accountId, params.groupId)
  }

  getBoundGroupWebhook (params: { accountId: string, groupId: string }) {
    return this.webhookBinding.getGroupWebhook(params.accountId, params.groupId)
  }

  async init () {
    const cfg = config()

    if (cfg.enableDingAdapter === false) {
      logger.info('[dingtalk] disabled by config.enableDingAdapter=false')
      return
    }

    const accounts = Array.isArray(cfg.dingdingAccounts) ? cfg.dingdingAccounts : []
    if (!accounts.length) {
      logger.info('[dingtalk] dingdingAccounts is empty')
      return
    }

    for (const accountConfig of accounts) {
      const validated = this.validateAccountConfig(accountConfig)
      if (!validated) continue
      const selfId = `DingDing_${validated.accountId}`

      if (this.bots.has(selfId)) continue

      const bot = new DingTalkBot({
        globalConfig: cfg,
        accountConfig: validated,
        sessionWebhookCache: this.sessionWebhookCache,
        webhookBinding: this.webhookBinding,
      })

      bot.adapter.version = dir.version

      registerBot('webSocketClient', bot)
      this.bots.set(selfId, bot)

      // connect async (do not block plugin load)
      bot.start().catch(err => {
        const msg = err instanceof Error ? err.message : String(err)
        logger.bot('error', bot.selfId, `[start] failed: ${msg}`)
      })
    }
  }

  private validateAccountConfig (account: DingTalkAccountConfig): DingTalkAccountConfig | null {
    if (!account || typeof account !== 'object') return null
    if (account.enable === false) return null

    const accountId = toStr(account.accountId).trim()
    const clientId = toStr(account.clientId).trim()
    const clientSecret = toStr(account.clientSecret).trim()

    if (!accountId || !clientId || !clientSecret) {
      logger.warn('[dingtalk] skip invalid account config:', { accountId, clientId: Boolean(clientId), clientSecret: Boolean(clientSecret) })
      return null
    }

    return {
      ...account,
      accountId,
      clientId,
      clientSecret,
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __karin_plugin_dingtalk_service__: DingTalkService | undefined
}

export const getDingTalkService = (): DingTalkService => {
  if (!globalThis.__karin_plugin_dingtalk_service__) {
    globalThis.__karin_plugin_dingtalk_service__ = new DingTalkService()
  }
  return globalThis.__karin_plugin_dingtalk_service__
}

export const initDingTalkService = async () => {
  const service = getDingTalkService()
  await service.init()
  return service
}
