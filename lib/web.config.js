import {
  dir
} from "./chunk-NF24Q4FD.js";

// src/web.config.ts
import fs from "fs";
import path from "path";
import {
  accordionItem,
  accordionPro,
  copyConfigSync,
  defineConfig,
  divider,
  input,
  switchComponent
} from "node-karin";
var switchField = (key, config = {}) => {
  const { isSelected: _ignoreIsSelected, ...rest } = config;
  return switchComponent.create(key, {
    startText: "\u5F00\u542F",
    endText: "\u5173\u95ED",
    size: "md",
    color: "primary",
    defaultSelected: false,
    isReadOnly: false,
    isDisabled: false,
    disableAnimation: false,
    ...rest
  });
};
var ensureConfigExists = () => {
  copyConfigSync(dir.defConfigDir, dir.ConfigDir, [".json"]);
};
var readJson = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
var trimOrEmpty = (value) => (typeof value === "string" ? value : value == null ? "" : String(value)).trim();
var normalizeStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const s = trimOrEmpty(item);
    if (s) out.push(s);
  }
  return out;
};
var parseAtUserIdMap = (value) => {
  if (value == null) return void 0;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return void 0;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error('atUserIdMap must be a JSON object like {"nickname":"staffId"}');
    }
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      const key = trimOrEmpty(k);
      const val = trimOrEmpty(v);
      if (key && val) out[key] = val;
    }
    return Object.keys(out).length ? out : void 0;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const key = trimOrEmpty(k);
      const val = trimOrEmpty(v);
      if (key && val) out[key] = val;
    }
    return Object.keys(out).length ? out : void 0;
  }
  return void 0;
};
var loadMergedConfig = () => {
  ensureConfigExists();
  const defPath = path.join(dir.defConfigDir, "config.json");
  const userPath = path.join(dir.ConfigDir, "config.json");
  const def = readJson(defPath);
  const user = readJson(userPath);
  const fallback = {
    enableDingAdapter: true,
    debugGlobal: false,
    enablePublicImageBed: false,
    defaultWebhook: "",
    dingdingAccounts: []
  };
  const defCfg = def ?? fallback;
  const userCfg = user ?? {};
  return {
    ...defCfg,
    ...userCfg,
    dingdingAccounts: Array.isArray(userCfg.dingdingAccounts) ? userCfg.dingdingAccounts : defCfg.dingdingAccounts
  };
};
var accountDataForUi = (a) => {
  const accountId = trimOrEmpty(a.accountId) || "default";
  const botName = trimOrEmpty(a.botName);
  return {
    title: botName ? `${botName} (${accountId})` : accountId,
    subtitle: trimOrEmpty(a.clientId) ? `clientId=${trimOrEmpty(a.clientId)}` : "\u672A\u914D\u7F6E clientId",
    enable: a.enable ?? false,
    accountId,
    botName: botName || "",
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
    atUserIdMap: a.atUserIdMap ? JSON.stringify(a.atUserIdMap, null, 2) : "",
    debug: a.debug ?? false
  };
};
var web_config_default = defineConfig({
  info: {
    id: dir.name,
    name: "DingTalk Stream Adapter",
    version: dir.version,
    description: "DingTalk Stream adapter plugin for Karin"
  },
  components() {
    const cfg = loadMergedConfig();
    const accountChildren = [
      divider.horizontal("_divider_basic", { description: "\u57FA\u7840" }),
      switchField("enable", { label: "\u542F\u7528\u8D26\u53F7", defaultSelected: false }),
      input.string("accountId", { label: "accountId", description: "\u8D26\u53F7\u6807\u8BC6\uFF08\u7528\u4E8E\u62FC\u63A5 selfId\uFF09", isRequired: false }),
      input.string("botName", { label: "botName", description: "Bot \u5C55\u793A\u540D\u79F0\uFF08\u53EF\u9009\uFF09", isRequired: false }),
      input.string("botAvatar", { label: "botAvatar", description: "Bot \u5934\u50CF\uFF08\u53EF\u9009\uFF09", isRequired: false }),
      divider.horizontal("_divider_cred", { description: "\u51ED\u8BC1" }),
      input.string("clientId", { label: "clientId", description: "Stream \u6A21\u5F0F clientId/appKey\uFF08\u542F\u7528\u8D26\u53F7\u65F6\u5FC5\u586B\uFF09", isRequired: false }),
      input.password("clientSecret", { label: "clientSecret", description: "Stream \u6A21\u5F0F clientSecret/appSecret\uFF08\u542F\u7528\u8D26\u53F7\u65F6\u5FC5\u586B\uFF09", isRequired: false }),
      input.string("corpId", { label: "corpId", description: "OpenAPI corpId\uFF08\u53EF\u9009\uFF09", isRequired: false }),
      input.string("robotCode", { label: "robotCode", description: "OpenAPI robotCode\uFF08\u53EF\u9009\uFF0C\u8FD0\u884C\u540E\u53EF\u80FD\u4ECE\u56DE\u8C03\u5B66\u4E60\u5230\uFF09", isRequired: false }),
      divider.horizontal("_divider_webhook", { description: "Webhook" }),
      input.string("webhook", { label: "webhook", description: "\u56FA\u5B9A webhook\uFF08\u65E0 sessionWebhook \u65F6\u515C\u5E95\uFF0C\u53EF\u9009\uFF09", isRequired: false }),
      input.password("webhookSecret", { label: "webhookSecret", description: "webhook \u52A0\u7B7E\u5BC6\u94A5\uFF08\u53EF\u9009\uFF09", isRequired: false }),
      divider.horizontal("_divider_features", { description: "\u529F\u80FD\u5F00\u5173" }),
      switchField("enableOpenApiDownload", { label: "OpenAPI \u4E0B\u8F7D(\u9ED8\u8BA4\u5F00\u542F)", defaultSelected: true }),
      switchField("enableOpenApiSend", { label: "OpenAPI \u4E3B\u52A8\u53D1\u9001(\u65E0 webhook)", defaultSelected: false }),
      switchField("enablePublicImageBed", { label: "\u56FE\u7247\u504F\u5411\u516C\u7F51 URL + Markdown", defaultSelected: false }),
      switchField("keepAlive", { label: "keepAlive", defaultSelected: true }),
      switchField("autoReconnect", { label: "autoReconnect", defaultSelected: true }),
      divider.horizontal("_divider_advanced", { description: "\u9AD8\u7EA7" }),
      input.group("extraTopics", {
        label: "extraTopics",
        description: "\u989D\u5916\u8BA2\u9605 topic\uFF08\u53EF\u9009\uFF09",
        data: [],
        template: input.string("topic", { label: "topic", isRequired: false })
      }),
      input.create("atUserIdMap", {
        label: "atUserIdMap (JSON)",
        description: '@ \u6620\u5C04\u8868\uFF1A{"\u6635\u79F0":"staffId"}\uFF08\u53EF\u9009\uFF0C\u7559\u7A7A\u8868\u793A\u4E0D\u542F\u7528\uFF09',
        isRequired: false,
        isClearable: true,
        placeholder: '{"\u6635\u79F0":"staffId"}',
        color: "primary"
      }),
      switchField("debug", { label: "\u8C03\u8BD5\u65E5\u5FD7", defaultSelected: false })
    ];
    const accountItem = accordionItem.default("account", "\u8D26\u53F7", accountChildren);
    const { componentType: _, ...accountTemplate } = accountItem;
    return [
      divider.horizontal("divider_basic", { description: "\u57FA\u7840\u914D\u7F6E" }),
      switchField("enableDingAdapter", { label: "\u542F\u7528\u9489\u9489\u9002\u914D\u5668", defaultSelected: cfg.enableDingAdapter }),
      switchField("debugGlobal", { label: "\u5168\u5C40\u8C03\u8BD5\u65E5\u5FD7", defaultSelected: cfg.debugGlobal ?? false }),
      switchField("enablePublicImageBed", { label: "\u5168\u5C40\u56FE\u7247\u504F\u5411\u516C\u7F51 URL + Markdown", defaultSelected: cfg.enablePublicImageBed ?? false }),
      input.string("defaultWebhook", { label: "defaultWebhook", description: "\u5168\u5C40\u515C\u5E95 webhook\uFF08\u53EF\u9009\uFF09", isRequired: false, defaultValue: cfg.defaultWebhook ?? "" }),
      divider.horizontal("divider_accounts", { description: "\u9489\u9489\u8D26\u53F7" }),
      accordionPro.create("dingdingAccounts", (cfg.dingdingAccounts ?? []).map(accountDataForUi), {
        label: "dingdingAccounts",
        variant: "bordered",
        selectionMode: "multiple",
        selectionBehavior: "toggle",
        showDivider: true,
        fullWidth: true,
        children: accountTemplate
      })
    ];
  },
  save(cfg) {
    try {
      ensureConfigExists();
      const defPath = path.join(dir.defConfigDir, "config.json");
      const defCfg = readJson(defPath);
      const base = defCfg ?? {
        enableDingAdapter: true,
        debugGlobal: false,
        enablePublicImageBed: false,
        defaultWebhook: "",
        dingdingAccounts: []
      };
      const rawAccounts = Array.isArray(cfg?.dingdingAccounts) ? cfg.dingdingAccounts : [];
      const normalizedAccounts = rawAccounts.map((raw) => {
        const a = raw && typeof raw === "object" ? raw : {};
        return {
          enable: Boolean(a.enable),
          accountId: trimOrEmpty(a.accountId),
          botName: trimOrEmpty(a.botName) || void 0,
          botAvatar: trimOrEmpty(a.botAvatar) || void 0,
          clientId: trimOrEmpty(a.clientId),
          clientSecret: trimOrEmpty(a.clientSecret),
          corpId: trimOrEmpty(a.corpId) || void 0,
          robotCode: trimOrEmpty(a.robotCode) || void 0,
          webhook: trimOrEmpty(a.webhook) || void 0,
          webhookSecret: trimOrEmpty(a.webhookSecret) || void 0,
          enableOpenApiDownload: a.enableOpenApiDownload == null ? void 0 : Boolean(a.enableOpenApiDownload),
          enableOpenApiSend: a.enableOpenApiSend == null ? void 0 : Boolean(a.enableOpenApiSend),
          enablePublicImageBed: a.enablePublicImageBed == null ? void 0 : Boolean(a.enablePublicImageBed),
          keepAlive: a.keepAlive == null ? void 0 : Boolean(a.keepAlive),
          autoReconnect: a.autoReconnect == null ? void 0 : Boolean(a.autoReconnect),
          extraTopics: normalizeStringArray(a.extraTopics),
          atUserIdMap: parseAtUserIdMap(a.atUserIdMap),
          debug: a.debug == null ? void 0 : Boolean(a.debug)
        };
      });
      const next = {
        ...base,
        enableDingAdapter: Boolean(cfg?.enableDingAdapter),
        debugGlobal: cfg?.debugGlobal == null ? base.debugGlobal : Boolean(cfg.debugGlobal),
        enablePublicImageBed: cfg?.enablePublicImageBed == null ? base.enablePublicImageBed : Boolean(cfg.enablePublicImageBed),
        defaultWebhook: trimOrEmpty(cfg?.defaultWebhook),
        dingdingAccounts: normalizedAccounts
      };
      fs.mkdirSync(dir.ConfigDir, { recursive: true });
      const filePath = path.join(dir.ConfigDir, "config.json");
      const tmpPath = `${filePath}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpPath, `${JSON.stringify(next, null, 2)}
`, "utf8");
      fs.renameSync(tmpPath, filePath);
      return { success: true, message: "\u4FDD\u5B58\u6210\u529F\uFF08\u91CD\u542F Karin \u540E\u751F\u6548\uFF09" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `\u4FDD\u5B58\u5931\u8D25: ${msg}` };
    }
  }
});
export {
  web_config_default as default
};
