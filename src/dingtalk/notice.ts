import { toStr } from './utils'

export const sanitizeEventSegment = (value: unknown): string => {
  const raw = toStr(value).trim()
  if (!raw) return 'unknown'
  return raw
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64)
}

export const buildDingtalkNoticeEvent = (params: {
  botId: string
  accountId: string
  topic: string
  noticeType: string
  data: any
  raw: string
  adapter: { id: string, name: string, version: string }
  streamEvent?: any
}) => {
  const userId =
    params.data?.userId
    || params.data?.senderStaffId
    || params.data?.operatorUserId
    || params.data?.staffId
    || params.data?.openId
    || params.data?.unionId
    || ''

  const createAt = Number(params.data?.createAt || params.data?.eventTime || params.data?.timestamp)
  const time = Number.isFinite(createAt) && createAt > 0 ? Math.floor(createAt / 1000) : Math.floor(Date.now() / 1000)

  const e: any = {
    post_type: 'notice',
    notice_type: params.noticeType || 'dingtalk',
    self_id: params.botId,
    user_id: toStr(userId),
    time,

    adapter_id: params.adapter.id,
    adapter_name: params.adapter.name,
    adapter: { id: params.adapter.id, name: params.adapter.name, version: params.adapter.version },

    dingtalk_topic: params.topic,
    dingtalk_event: params.data,
    dingtalk_raw: params.raw,
    dingtalk_headers: params.streamEvent?.headers,

    _accountId: params.accountId,
  }

  if (params.data?.conversationId) e.conversationId = toStr(params.data.conversationId)
  if (params.data?.openConversationId) e.openConversationId = toStr(params.data.openConversationId)

  return e
}

