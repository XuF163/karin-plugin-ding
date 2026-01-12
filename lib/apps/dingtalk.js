import {
  getDingTalkService
} from "../chunk-IWBFO2WQ.js";
import "../chunk-NF24Q4FD.js";

// src/apps/dingtalk.ts
import { karin } from "node-karin";
var dingtalkStatus = karin.command(/^#?ding\s+status$/i, async (e) => {
  const service = getDingTalkService();
  const bots = service.getAllBots();
  if (!bots.length) {
    await e.reply("\u672A\u52A0\u8F7D\u4EFB\u4F55\u9489\u9489\u8D26\u53F7\uFF08\u8BF7\u68C0\u67E5 config/config.json \u7684 dingdingAccounts\uFF09");
    return true;
  }
  const lines = bots.map((b) => {
    const connected = b.connected ? "online" : "offline";
    const lastError = b.lastError ? ` err=${b.lastError}` : "";
    return `- ${b.selfId} (${b.accountId}) ${connected}${lastError}`;
  });
  await e.reply(`DingTalk Bots:
${lines.join("\n")}`);
  return true;
}, {
  name: "DingTalk \u72B6\u6001",
  permission: "master"
});
var dingtalkBindWebhook = karin.command(/^#?ding\s+bind\s+(.+)$/i, async (e) => {
  const service = getDingTalkService();
  const bot = service.getBotBySelfId(e.selfId);
  if (!bot) {
    await e.reply(`\u672A\u627E\u5230\u5BF9\u5E94 DingTalk Bot: ${e.selfId}`);
    return true;
  }
  const args = e.msg.replace(/^#?ding\s+bind\s+/i, "").trim().split(/\s+/);
  let groupId = "";
  let webhook = "";
  let secret = "";
  if (e.contact.scene === "group") {
    groupId = e.contact.peer;
    webhook = args[0] || "";
    secret = args[1] || "";
  } else {
    groupId = args[0] || "";
    webhook = args[1] || "";
    secret = args[2] || "";
  }
  if (!groupId || !webhook) {
    await e.reply("\u7528\u6CD5\uFF1A\n- \u7FA4\u804A\uFF1A#ding bind <webhook> [secret]\n- \u79C1\u804A\uFF1A#ding bind <groupId> <webhook> [secret]");
    return true;
  }
  service.bindGroupWebhook({ accountId: bot.accountId, groupId, webhook, secret });
  await e.reply(`\u5DF2\u7ED1\u5B9A\u7FA4 webhook
- accountId: ${bot.accountId}
- groupId: ${groupId}`);
  return true;
}, {
  name: "DingTalk \u7ED1\u5B9A\u7FA4 webhook",
  permission: "master"
});
var dingtalkUnbindWebhook = karin.command(/^#?ding\s+unbind(?:\s+(.*))?$/i, async (e) => {
  const service = getDingTalkService();
  const bot = service.getBotBySelfId(e.selfId);
  if (!bot) {
    await e.reply(`\u672A\u627E\u5230\u5BF9\u5E94 DingTalk Bot: ${e.selfId}`);
    return true;
  }
  const arg = e.msg.replace(/^#?ding\s+unbind/i, "").trim();
  const groupId = e.contact.scene === "group" ? e.contact.peer : arg;
  if (!groupId) {
    await e.reply("\u7528\u6CD5\uFF1A\n- \u7FA4\u804A\uFF1A#ding unbind\n- \u79C1\u804A\uFF1A#ding unbind <groupId>");
    return true;
  }
  const ok = service.unbindGroupWebhook({ accountId: bot.accountId, groupId });
  await e.reply(ok ? `\u5DF2\u89E3\u7ED1\u7FA4 webhook: ${groupId}` : `\u672A\u627E\u5230\u7ED1\u5B9A\u8BB0\u5F55: ${groupId}`);
  return true;
}, {
  name: "DingTalk \u89E3\u7ED1\u7FA4 webhook",
  permission: "master"
});
export {
  dingtalkBindWebhook,
  dingtalkStatus,
  dingtalkUnbindWebhook
};
