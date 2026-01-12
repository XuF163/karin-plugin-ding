import { karin, contactFriend, contactGroup } from 'node-karin'
import { getDingTalkService } from '@/dingtalk/service'

export const dingtalkHelp = karin.command(/^#?ding\s+help$/i, async (e) => {
  await e.reply([
    'DingTalk Adapter Commands:',
    '- #ding status',
    '- #ding bind <webhook> [secret]',
    '- #ding unbind [groupId]',
    '- #ding recall <processQueryKey>  （仅 OpenAPI 发送可撤回）',
    '- #ding send group <openConversationId> <text>',
    '- #ding send friend <userId> <text>',
  ].join('\n'))
  return true
}, {
  name: 'DingTalk 帮助',
  permission: 'master',
})

export const dingtalkStatus = karin.command(/^#?ding\s+status$/i, async (e) => {
  const service = getDingTalkService()
  const bots = service.getAllBots()

  if (!bots.length) {
    await e.reply('未加载任何钉钉账号（请检查 config/config.json 的 dingdingAccounts）')
    return true
  }

  const lines = bots.map((b) => {
    const connected = b.connected ? 'online' : 'offline'
    const lastError = b.lastError ? ` err=${b.lastError}` : ''
    return `- ${b.selfId} (${b.accountId}) ${connected}${lastError}`
  })

  await e.reply(`DingTalk Bots:\n${lines.join('\n')}`)
  return true
}, {
  name: 'DingTalk 状态',
  permission: 'master',
})

export const dingtalkRecall = karin.command(/^#?ding\s+recall(?:\s+(.+))?$/i, async (e) => {
  const service = getDingTalkService()
  const bot = service.getBotBySelfId(e.selfId)
  if (!bot) {
    await e.reply('请在钉钉会话内执行（selfId= DingDing_<accountId>），或自行在代码中调用 bot.recallMsg。')
    return true
  }

  const arg = e.msg.replace(/^#?ding\s+recall/i, '').trim()
  if (!arg) {
    await e.reply('用法：#ding recall <processQueryKey>\n提示：仅 OpenAPI 发送返回的 processQueryKey 可撤回')
    return true
  }

  await bot.recallMsg(e.contact, arg)
  await e.reply('已提交撤回请求（仅 OpenAPI 发送可用）。')
  return true
}, {
  name: 'DingTalk 撤回',
  permission: 'master',
})

export const dingtalkSend = karin.command(/^#?ding\s+send\s+(.+)$/i, async (e) => {
  const service = getDingTalkService()
  const bot = service.getBotBySelfId(e.selfId)
  if (!bot) {
    await e.reply('请在钉钉会话内执行（selfId= DingDing_<accountId>）。')
    return true
  }

  const rest = e.msg.replace(/^#?ding\s+send\s+/i, '').trim()
  const parts = rest.split(/\s+/)
  const kind = (parts.shift() || '').toLowerCase()

  if (kind !== 'group' && kind !== 'friend') {
    await e.reply('用法：\n- #ding send group <openConversationId> <text>\n- #ding send friend <userId> <text>')
    return true
  }

  const targetId = parts.shift() || ''
  const text = parts.join(' ').trim()
  if (!targetId || !text) {
    await e.reply('用法：\n- #ding send group <openConversationId> <text>\n- #ding send friend <userId> <text>')
    return true
  }

  const contact = kind === 'group' ? contactGroup(targetId, targetId) : contactFriend(targetId, targetId)
  const res = await bot.sendMsg(contact, [{ type: 'text', text } as any])
  await e.reply(`已发送：messageId=${res.messageId}`)
  return true
}, {
  name: 'DingTalk 主动发送',
  permission: 'master',
})

export const dingtalkBindWebhook = karin.command(/^#?ding\s+bind\s+(.+)$/i, async (e) => {
  const service = getDingTalkService()
  const bot = service.getBotBySelfId(e.selfId)
  if (!bot) {
    await e.reply(`未找到对应 DingTalk Bot: ${e.selfId}`)
    return true
  }

  const args = e.msg.replace(/^#?ding\s+bind\s+/i, '').trim().split(/\s+/)

  let groupId = ''
  let webhook = ''
  let secret = ''

  if (e.contact.scene === 'group') {
    groupId = e.contact.peer
    webhook = args[0] || ''
    secret = args[1] || ''
  } else {
    groupId = args[0] || ''
    webhook = args[1] || ''
    secret = args[2] || ''
  }

  if (!groupId || !webhook) {
    await e.reply('用法：\n- 群聊：#ding bind <webhook> [secret]\n- 私聊：#ding bind <groupId> <webhook> [secret]')
    return true
  }

  service.bindGroupWebhook({ accountId: bot.accountId, groupId, webhook, secret })
  await e.reply(`已绑定群 webhook\n- accountId: ${bot.accountId}\n- groupId: ${groupId}`)
  return true
}, {
  name: 'DingTalk 绑定群 webhook',
  permission: 'master',
})

export const dingtalkUnbindWebhook = karin.command(/^#?ding\s+unbind(?:\s+(.*))?$/i, async (e) => {
  const service = getDingTalkService()
  const bot = service.getBotBySelfId(e.selfId)
  if (!bot) {
    await e.reply(`未找到对应 DingTalk Bot: ${e.selfId}`)
    return true
  }

  const arg = e.msg.replace(/^#?ding\s+unbind/i, '').trim()
  const groupId = (e.contact.scene === 'group') ? e.contact.peer : arg

  if (!groupId) {
    await e.reply('用法：\n- 群聊：#ding unbind\n- 私聊：#ding unbind <groupId>')
    return true
  }

  const ok = service.unbindGroupWebhook({ accountId: bot.accountId, groupId })
  await e.reply(ok ? `已解绑群 webhook: ${groupId}` : `未找到绑定记录: ${groupId}`)
  return true
}, {
  name: 'DingTalk 解绑群 webhook',
  permission: 'master',
})
