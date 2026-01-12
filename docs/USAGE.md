# karin-plugin-ding（DingTalk Stream 适配器）

本插件将钉钉（企业机器人 Stream 模式）接入 Karin：钉钉消息会被转换为 Karin 的 `friend/group` 消息事件，Karin 插件可直接在钉钉侧工作；同时支持通过 `sessionWebhook` / 固定群 webhook / OpenAPI（可选）发送消息。

## 1. 钉钉侧准备（Stream 模式）

1) 在钉钉开放平台创建应用，并添加「企业机器人」能力  
2) 接入方式选择 **Stream**  
3) 记录：`clientId`、`clientSecret`  
4) 将机器人加入目标群/与机器人发起私聊

## 2. 配置

默认配置文件在插件目录：`config/config.json`。首次运行后会复制到 Karin 侧：`@karinjs/karin-plugin-ding/config/config.json`（以实际安装路径为准）。

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
- `dingdingAccounts[].enableOpenApiSend=true`：无 webhook 时尝试走 OpenAPI 主动发送（需要 `corpId/robotCode`；通常可从回调“学习”到，也可手动填写）
- `enablePublicImageBed=true`：图片更偏向用 “公网 URL + Markdown” 发送；否则优先用 webhook `image(base64+md5)`

## 3. 指令

仅 `master` 可用：

- `#ding status`：查看已加载账号与连接状态
- `#ding bind <webhook> [secret]`：在钉钉群内绑定“固定群 webhook”（用于主动消息兜底）
- `#ding unbind`：在钉钉群内解绑

## 4. 说明

- 默认 `config/config.json` 中账号 `enable=false`，不会自动连接；请手动开启并填写凭据
- 钉钉 webhook 原生不支持“引用回复/撤回”，插件已将撤回实现为 no-op（避免 Karin 的定时撤回崩溃）
