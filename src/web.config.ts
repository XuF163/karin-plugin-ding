import fs from 'node:fs'
import path from 'node:path'
import {
  accordionItem,
  accordionPro,
  copyConfigSync,
  defineConfig,
  divider,
  input,
  switchComponent,
} from 'node-karin'
import { dir } from './dir'
import type { Config, DingTalkAccountConfig } from './utils/config'

type WebUiDingTalkAccountConfig = Omit<DingTalkAccountConfig, 'atUserIdMap'> & {
  atUserIdMap?: string
}

type WebUiConfig = Omit<Config, 'dingdingAccounts'> & {
  dingdingAccounts: WebUiDingTalkAccountConfig[]
}

type SwitchConfig = NonNullable<Parameters<typeof switchComponent.options>[1]>

const switchField = (key: string, config: SwitchConfig = {}) => {
  const { isSelected: _ignoreIsSelected, ...rest } = config
  return switchComponent.create(key, {
    startText: '开启',
    endText: '关闭',
    size: 'md',
    color: 'primary',
    defaultSelected: false,
    isReadOnly: false,
    isDisabled: false,
    disableAnimation: false,
    ...rest,
  })
}

const ensureConfigExists = () => {
  copyConfigSync(dir.defConfigDir, dir.ConfigDir, ['.json'])
}

const readJson = <T>(filePath: string): T | null => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return raw ? JSON.parse(raw) as T : null
  } catch {
    return null
  }
}

const trimOrEmpty = (value: unknown): string => (typeof value === 'string' ? value : (value == null ? '' : String(value))).trim()

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const s = trimOrEmpty(item)
    if (s) out.push(s)
  }
  return out
}

const parseAtUserIdMap = (value: unknown): Record<string, string> | undefined => {
  if (value == null) return undefined

  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('atUserIdMap must be a JSON object like {"nickname":"staffId"}')
    }
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const key = trimOrEmpty(k)
      const val = trimOrEmpty(v)
      if (key && val) out[key] = val
    }
    return Object.keys(out).length ? out : undefined
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = trimOrEmpty(k)
      const val = trimOrEmpty(v)
      if (key && val) out[key] = val
    }
    return Object.keys(out).length ? out : undefined
  }

  return undefined
}

const loadMergedConfig = (): Config => {
  ensureConfigExists()

  const defPath = path.join(dir.defConfigDir, 'config.json')
  const userPath = path.join(dir.ConfigDir, 'config.json')

  const def = readJson<Config>(defPath)
  const user = readJson<Partial<Config>>(userPath)

  const fallback: Config = {
    enableDingAdapter: true,
    debugGlobal: false,
    enablePublicImageBed: false,
    defaultWebhook: '',
    dingdingAccounts: [],
  }

  const defCfg = def ?? fallback
  const userCfg = user ?? {}

  return {
    ...defCfg,
    ...userCfg,
    dingdingAccounts: Array.isArray(userCfg.dingdingAccounts) ? userCfg.dingdingAccounts : defCfg.dingdingAccounts,
  }
}

const accountDataForUi = (a: DingTalkAccountConfig) => {
  const accountId = trimOrEmpty(a.accountId) || 'default'
  const botName = trimOrEmpty(a.botName)

  return {
    title: botName ? `${botName} (${accountId})` : accountId,
    subtitle: trimOrEmpty(a.clientId) ? `clientId=${trimOrEmpty(a.clientId)}` : '未配置 clientId',
    enable: a.enable ?? false,
    accountId,
    botName: botName || '',
    botAvatar: trimOrEmpty(a.botAvatar),
    clientId: trimOrEmpty(a.clientId),
    clientSecret: trimOrEmpty(a.clientSecret),
    corpId: trimOrEmpty(a.corpId),
    robotCode: trimOrEmpty(a.robotCode),
    webhook: trimOrEmpty(a.webhook),
    webhookSecret: trimOrEmpty(a.webhookSecret),
    enableOpenApiDownload: a.enableOpenApiDownload ?? true,
    enableOpenApiSend: a.enableOpenApiSend ?? false,
    enablePublicImageBed: a.enablePublicImageBed ?? false,
    keepAlive: a.keepAlive ?? true,
    autoReconnect: a.autoReconnect ?? true,
    extraTopics: Array.isArray(a.extraTopics) ? a.extraTopics : [],
    atUserIdMap: a.atUserIdMap ? JSON.stringify(a.atUserIdMap, null, 2) : '',
    debug: a.debug ?? false,
  }
}

export default defineConfig<WebUiConfig>({
  info: {
    id: dir.name,
    name: 'DingTalk Stream Adapter',
    version: dir.version,
    description: 'DingTalk Stream adapter plugin for Karin',
  },
  components () {
    const cfg = loadMergedConfig()

    const accountChildren = [
      divider.horizontal('_divider_basic', { description: '基础' }),
      switchField('enable', { label: '启用账号', defaultSelected: false }),
      input.string('accountId', { label: 'accountId', description: '账号标识（用于拼接 selfId）', isRequired: false }),
      input.string('botName', { label: 'botName', description: 'Bot 展示名称（可选）', isRequired: false }),
      input.string('botAvatar', { label: 'botAvatar', description: 'Bot 头像（可选）', isRequired: false }),

      divider.horizontal('_divider_cred', { description: '凭证' }),
      input.string('clientId', { label: 'clientId', description: 'Stream 模式 clientId/appKey（启用账号时必填）', isRequired: false }),
      input.password('clientSecret', { label: 'clientSecret', description: 'Stream 模式 clientSecret/appSecret（启用账号时必填）', isRequired: false }),
      input.string('corpId', { label: 'corpId', description: 'OpenAPI corpId（可选）', isRequired: false }),
      input.string('robotCode', { label: 'robotCode', description: 'OpenAPI robotCode（可选，运行后可能从回调学习到）', isRequired: false }),

      divider.horizontal('_divider_webhook', { description: 'Webhook' }),
      input.string('webhook', { label: 'webhook', description: '固定 webhook（无 sessionWebhook 时兜底，可选）', isRequired: false }),
      input.password('webhookSecret', { label: 'webhookSecret', description: 'webhook 加签密钥（可选）', isRequired: false }),

      divider.horizontal('_divider_features', { description: '功能开关' }),
      switchField('enableOpenApiDownload', { label: 'OpenAPI 下载(默认开启)', defaultSelected: true }),
      switchField('enableOpenApiSend', { label: 'OpenAPI 主动发送(无 webhook)', defaultSelected: false }),
      switchField('enablePublicImageBed', { label: '图片偏向公网 URL + Markdown', defaultSelected: false }),
      switchField('keepAlive', { label: 'keepAlive', defaultSelected: true }),
      switchField('autoReconnect', { label: 'autoReconnect', defaultSelected: true }),

      divider.horizontal('_divider_advanced', { description: '高级' }),
      input.group('extraTopics', {
        label: 'extraTopics',
        description: '额外订阅 topic（可选）',
        data: [],
        template: input.string('topic', { label: 'topic', isRequired: false }),
      }),
      input.create('atUserIdMap', {
        label: 'atUserIdMap (JSON)',
        description: '@ 映射表：{"昵称":"staffId"}（可选，留空表示不启用）',
        isRequired: false,
        isClearable: true,
        placeholder: '{"昵称":"staffId"}',
        color: 'primary',
      }),
      switchField('debug', { label: '调试日志', defaultSelected: false }),
    ]

    const accountItem = accordionItem.default('account', '账号', accountChildren)
    const { componentType: _, ...accountTemplate } = accountItem

    return [
      divider.horizontal('divider_basic', { description: '基础配置' }),
      switchField('enableDingAdapter', { label: '启用钉钉适配器', defaultSelected: cfg.enableDingAdapter }),
      switchField('debugGlobal', { label: '全局调试日志', defaultSelected: cfg.debugGlobal ?? false }),
      switchField('enablePublicImageBed', { label: '全局图片偏向公网 URL + Markdown', defaultSelected: cfg.enablePublicImageBed ?? false }),
      input.string('defaultWebhook', { label: 'defaultWebhook', description: '全局兜底 webhook（可选）', isRequired: false, defaultValue: cfg.defaultWebhook ?? '' }),

      divider.horizontal('divider_accounts', { description: '钉钉账号' }),
      accordionPro.create('dingdingAccounts', (cfg.dingdingAccounts ?? []).map(accountDataForUi), {
        label: 'dingdingAccounts',
        variant: 'bordered',
        selectionMode: 'multiple',
        selectionBehavior: 'toggle',
        showDivider: true,
        fullWidth: true,
        children: accountTemplate,
      }),
    ]
  },
  save (cfg) {
    try {
      ensureConfigExists()

      const defPath = path.join(dir.defConfigDir, 'config.json')
      const defCfg = readJson<Config>(defPath)

      const base: Config = defCfg ?? {
        enableDingAdapter: true,
        debugGlobal: false,
        enablePublicImageBed: false,
        defaultWebhook: '',
        dingdingAccounts: [],
      }

      const rawAccounts = Array.isArray(cfg?.dingdingAccounts) ? cfg.dingdingAccounts : []

      const normalizedAccounts: DingTalkAccountConfig[] = rawAccounts.map((raw) => {
        const a = (raw && typeof raw === 'object') ? raw as WebUiDingTalkAccountConfig : {} as WebUiDingTalkAccountConfig

        return {
          enable: Boolean(a.enable),
          accountId: trimOrEmpty(a.accountId),
          botName: trimOrEmpty(a.botName) || undefined,
          botAvatar: trimOrEmpty(a.botAvatar) || undefined,
          clientId: trimOrEmpty(a.clientId),
          clientSecret: trimOrEmpty(a.clientSecret),
          corpId: trimOrEmpty(a.corpId) || undefined,
          robotCode: trimOrEmpty(a.robotCode) || undefined,
          webhook: trimOrEmpty(a.webhook) || undefined,
          webhookSecret: trimOrEmpty(a.webhookSecret) || undefined,
          enableOpenApiDownload: a.enableOpenApiDownload == null ? undefined : Boolean(a.enableOpenApiDownload),
          enableOpenApiSend: a.enableOpenApiSend == null ? undefined : Boolean(a.enableOpenApiSend),
          enablePublicImageBed: a.enablePublicImageBed == null ? undefined : Boolean(a.enablePublicImageBed),
          keepAlive: a.keepAlive == null ? undefined : Boolean(a.keepAlive),
          autoReconnect: a.autoReconnect == null ? undefined : Boolean(a.autoReconnect),
          extraTopics: normalizeStringArray(a.extraTopics),
          atUserIdMap: parseAtUserIdMap(a.atUserIdMap),
          debug: a.debug == null ? undefined : Boolean(a.debug),
        }
      })

      const next: Config = {
        ...base,
        enableDingAdapter: Boolean(cfg?.enableDingAdapter),
        debugGlobal: cfg?.debugGlobal == null ? base.debugGlobal : Boolean(cfg.debugGlobal),
        enablePublicImageBed: cfg?.enablePublicImageBed == null ? base.enablePublicImageBed : Boolean(cfg.enablePublicImageBed),
        defaultWebhook: trimOrEmpty(cfg?.defaultWebhook),
        dingdingAccounts: normalizedAccounts,
      }

      fs.mkdirSync(dir.ConfigDir, { recursive: true })

      const filePath = path.join(dir.ConfigDir, 'config.json')
      const tmpPath = `${filePath}.${Date.now()}.tmp`
      fs.writeFileSync(tmpPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      fs.renameSync(tmpPath, filePath)

      return { success: true, message: '保存成功（重启 Karin 后生效）' }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return { success: false, message: `保存失败: ${msg}` }
    }
  },
})
