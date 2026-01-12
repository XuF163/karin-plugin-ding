# 对标核查：`karin-plugin-ding` vs `Yunzai-plugin-Dingtalk`

更新时间：2026-01-12  
参考项目：`tmp/Yunzai-plugin-Dingtalk`（https://github.com/XuF163/Yunzai-plugin-Dingtalk）

## 结论概览

- 已对标：多账号 Stream 接入、ACK-first、消息收发主链路、`sessionWebhook` 缓存、OpenAPI `downloadCode -> downloadUrl`、群固定 webhook 绑定（持久化）、Karin WebUI 配置面板、notice 透传、OpenAPI 撤回
- 部分对标：主动发送能力（已有基础指令，但未覆盖 Yunzai 的“会话/通讯录”体系）、配置键一致性（缺少 `markdownImgScale/toBotUpload`）
- 未对标：通讯录缓存持久化（Yunzai 的 contacts 学习/落盘）

## 关键差异 / 注意点

- Webhook 的 `image(base64+md5)` 有严格大小限制（约 20KB），大图请优先走 OpenAPI `media/upload` 或 “公网 URL + Markdown”
- Karin 的 `image` 段可能是 `base64://...`；已在 `src/dingtalk/file.ts` 通过内容嗅探补齐 `mimeType/文件后缀`，避免 OAPI `illegal file type`

## 功能对比（摘要）

| 模块 | Yunzai-plugin-Dingtalk | karin-plugin-ding | 备注 |
|---|---|---|---|
| Stream 连接 | 多账号 + ACK-first | 多账号 + ACK-first | `src/dingtalk/bot.ts` |
| topic 订阅 | message/delegate/card + `extraTopics` | message/delegate/card + `extraTopics` | `src/dingtalk/constants.ts` |
| 收消息 | group/private 映射 | group/private 映射 | `src/dingtalk/message.ts` |
| 媒体下载 | OpenAPI 下载 | OpenAPI 下载 | `src/dingtalk/openapi.ts` |
| 发消息（webhook / sessionWebhook） | text/at/markdown/image | text/at/markdown/image | 图策略已按配置分流（见下） |
| 发消息（OpenAPI） | reply/兜底/图片通道 | reply/兜底/图片通道 | `enableOpenApiSend=true` 时 reply 优先 OpenAPI |
| 发图策略 | `enablePublicImageBed` 分流 | `enablePublicImageBed` 分流 | `src/dingtalk/bot.ts` |
| 撤回 | 仅 OpenAPI | 仅 OpenAPI | `src/dingtalk/openapi.ts` + `src/dingtalk/bot.ts` |
| notice 透传 | `notice.dingtalk.event.*` / `notice.dingtalk.card.*` | `notice.dingtalk.event.*` / `notice.dingtalk.card.*` | `src/dingtalk/notice.ts` |
| 主动发送指令 | 覆盖较全 | 基础覆盖 | `src/apps/dingtalk.ts` |
| 通讯录缓存持久化 | 有 | 无 | 建议文档化边界或补齐 |
| WebUI 配置 | Guoba 面板 | Karin WebUI | `src/web.config.ts` |

## 配置项对比（摘要）

Yunzai 全局（`config/defCfg/default.yaml`）：
- `enableDingAdapter` / `debugGlobal` / `defaultWebhook`
- `enablePublicImageBed` / `markdownImgScale` / `toBotUpload`

Karin（`config/config.json` + WebUI）：
- `enableDingAdapter` / `debugGlobal` / `defaultWebhook`
- `enablePublicImageBed`（全局 + 账号级覆盖）
- 账号级：`enableOpenApiDownload` / `enableOpenApiSend` / `extraTopics` / `atUserIdMap`
- 差异：未提供 `markdownImgScale` / `toBotUpload`

## 指令对比（摘要）

Yunzai（见 `tmp/Yunzai-plugin-Dingtalk/docs/USAGE.md`）：
- `#钉钉状态` / `#钉钉会话` / `#钉钉发送` / `#钉钉发送-api` / `#钉钉撤回` / `#钉钉通讯录` / 绑定 webhook 等

Karin（当前）：
- `#ding help`
- `#ding status`
- `#ding bind <webhook> [secret]`
- `#ding unbind [groupId]`
- `#ding recall <processQueryKey>`
- `#ding send group <openConversationId> <text>`
- `#ding send friend <userId> <text>`
