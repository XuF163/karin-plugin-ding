import { dir } from '@/dir'
import {
  watch,
  logger,
  filesByExt,
  copyConfigSync,
  requireFileSync,
} from 'node-karin'

export interface DingTalkAccountConfig {
  /** 是否启用该账号 */
  enable?: boolean
  /** 账号标识（用于拼接 selfId） */
  accountId: string
  /** Bot 展示名称 */
  botName?: string
  /** Bot 头像 */
  botAvatar?: string

  /** DingTalk Stream clientId / appKey */
  clientId: string
  /** DingTalk Stream clientSecret / appSecret */
  clientSecret: string

  /** OpenAPI corpId（可不填，运行后可从回调“学习”到） */
  corpId?: string
  /** OpenAPI robotCode（可不填，运行后可从回调“学习”到） */
  robotCode?: string

  /** 固定 webhook（用于无 sessionWebhook 的主动消息兜底） */
  webhook?: string
  /** webhook 加签密钥（可选） */
  webhookSecret?: string

  /** 是否启用 OpenAPI downloadCode -> downloadUrl（默认 true） */
  enableOpenApiDownload?: boolean
  /** 是否允许在无 webhook 时用 OpenAPI 主动发送（默认 false） */
  enableOpenApiSend?: boolean

  /** 图片发送是否偏向“公网 URL + Markdown”（覆盖全局） */
  enablePublicImageBed?: boolean

  /** dingtalk-stream keepAlive */
  keepAlive?: boolean
  /** dingtalk-stream autoReconnect */
  autoReconnect?: boolean
  /** 额外订阅 topic（高级用法） */
  extraTopics?: string[]

  /** @ 映射表（可选）：{ \"昵称\": \"staffId\" } */
  atUserIdMap?: Record<string, string>
  /** 调试日志 */
  debug?: boolean
}

export interface Config {
  /** 是否启用钉钉适配器 */
  enableDingAdapter: boolean
  /** 全局调试日志 */
  debugGlobal?: boolean
  /** 图片发送是否偏向“公网 URL + Markdown” */
  enablePublicImageBed?: boolean
  /** 全局默认 webhook（兜底） */
  defaultWebhook?: string
  /** 多账号配置 */
  dingdingAccounts: DingTalkAccountConfig[]
}

/**
 * @description 初始化配置文件
 */
copyConfigSync(dir.defConfigDir, dir.ConfigDir, ['.json'])

/**
 * @description 读取配置文件（以用户配置覆盖默认配置）
 */
export const config = (): Config => {
  const cfg = requireFileSync(`${dir.ConfigDir}/config.json`) as Partial<Config>
  const def = requireFileSync(`${dir.defConfigDir}/config.json`) as Config

  return {
    ...def,
    ...cfg,
    dingdingAccounts: Array.isArray(cfg.dingdingAccounts) ? cfg.dingdingAccounts : def.dingdingAccounts,
  }
}

/**
 * @description 监听配置文件变化（仅日志提示）
 */
setTimeout(() => {
  const list = filesByExt(dir.ConfigDir, '.json', 'abs')
  list.forEach(file => watch(file, (old, now) => {
    logger.info([
      '检测到配置文件更新',
      `旧数据: ${old}`,
      `新数据: ${now}`,
    ].join('\n'))
  }))
}, 2000)
