import { karin } from 'node-karin'
import { getDingTalkService } from '@/dingtalk/service'

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
