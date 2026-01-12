# karin-plugin-ding（DingTalk Stream 适配器）

本插件将钉钉（企业机器人 Stream 模式）接入 Karin：钉钉消息会被转换为 Karin 的 `friend/group` 消息事件，Karin 插件可直接在钉钉侧工作；同时支持通过 `sessionWebhook` / 固定群 webhook / OpenAPI（可选）发送消息。

## 1. 钉钉侧准备（Stream 模式）

1) 在钉钉开放平台创建应用，并添加「企业机器人」能力  
2) 接入方式选择 **Stream**  
3) 记录：`clientId`、`clientSecret`  
4) 将机器人加入目标群/与机器人发起私聊

## 2. 配置

默认配置文件在插件目录：`config/config.json`。首次运行后会复制到 Karin 侧：`@karinjs/karin-plugin-ding/config/config.json`（以实际安装路径为准）。

也可以在 Karin WebUI 中配置：
- WebUI → 插件 → `karin-plugin-ding` → 配置
- 保存后需要重启 Karin 生效
- 如果账号内的“启用账号”等开关无法点击，请更新到最新版本（旧版本 WebUI 表单绑定存在问题）

最小可用配置（示例）：

```json
{
  "enableDingAdapter": true,
  "dingdingAccounts": [
    {
      "enable": true,
      "accountId": "default",
      "clientId": "xxx",
      "clientSecret": "yyy"
    }
  ]
}
```

可选能力：
- `defaultWebhook` / `dingdingAccounts[].webhook`：用于 **无 sessionWebhook** 的主动消息兜底（固定群 webhook）
- `dingdingAccounts[].enableOpenApiDownload=false`：关闭收消息时的 `downloadCode -> downloadUrl`（默认开启）
- `dingdingAccounts[].enableOpenApiSend=true`：允许 OpenAPI 主动发送（需要 `corpId/robotCode`；通常可从回调“学习”到，也可手动填写）
  - 回复场景会优先走 OpenAPI（以支持撤回）
  - 无 webhook 时会兜底走 OpenAPI
- `enablePublicImageBed=true`：发图优先走 “公网 URL + Markdown”
  - 本地/Buffer 会尝试通过 `fileToUrl` 转为公网可访问 URL
  - 失败时会自动降级
- `enablePublicImageBed=false`：发图优先走 `media/upload + OpenAPI sampleImageMsg`（不依赖公网 URL，更适合 NAT 场景）
  - 适配 Karin 的 `image:base64://...`：会自动推断图片类型并补齐文件后缀（避免 OAPI `illegal file type`）

## 3. 指令

仅 `master` 可用：

- `#ding help`：查看帮助
- `#ding status`：查看已加载账号与连接状态
- `#ding bind <webhook> [secret]`：在钉钉群内绑定“固定群 webhook”（用于主动消息兜底）
- `#ding unbind`：在钉钉群内解绑
- `#ding recall <processQueryKey>`：撤回（仅 OpenAPI 发送可用）
- `#ding send group <openConversationId> <text>`：主动发群消息
- `#ding send friend <userId> <text>`：主动发私聊消息

## 4. 说明

- 默认 `config/config.json` 中账号 `enable=false`，不会自动连接；请手动开启并填写凭据
- 撤回仅支持 OpenAPI 发送返回的 `processQueryKey`；Webhook/SessionWebhook 发送没有可撤回的 messageId
- Webhook 的 `image(base64+md5)` 有严格大小限制（约 20KB），大图建议优先走 OpenAPI 或 “公网 URL + Markdown”
- 非消息 topic 会透传为 notice 事件：`notice.dingtalk.event.*` / `notice.dingtalk.card.*`（按 topic sanitize 后作为细分事件名）
- 如遇到 `Cannot read properties of undefined (reading 'Bot:...')`（node-karin 的 `getCacheCfg/getFriendCfg`），通常是 Karin 配置缓存未初始化/配置文件损坏；检查 `@karinjs/config/privates.json`、`@karinjs/config/groups.json` 并重启
