import {
  dir
} from "./chunk-NF24Q4FD.js";

// src/dingtalk/service.ts
import { logger as logger5, registerBot } from "node-karin";

// src/utils/config.ts
import {
  watch,
  logger,
  filesByExt,
  copyConfigSync,
  requireFileSync
} from "node-karin";
copyConfigSync(dir.defConfigDir, dir.ConfigDir, [".json"]);
var config = () => {
  const cfg = requireFileSync(`${dir.ConfigDir}/config.json`);
  const def = requireFileSync(`${dir.defConfigDir}/config.json`);
  return {
    ...def,
    ...cfg,
    dingdingAccounts: Array.isArray(cfg.dingdingAccounts) ? cfg.dingdingAccounts : def.dingdingAccounts
  };
};
setTimeout(() => {
  const list = filesByExt(dir.ConfigDir, ".json", "abs");
  list.forEach((file) => watch(file, (old, now) => {
    logger.info([
      "\u68C0\u6D4B\u5230\u914D\u7F6E\u6587\u4EF6\u66F4\u65B0",
      `\u65E7\u6570\u636E: ${old}`,
      `\u65B0\u6570\u636E: ${now}`
    ].join("\n"));
  }));
}, 2e3);

// src/utils/common.ts
import lodash from "node-karin/lodash";
import moment from "node-karin/moment";

// src/dingtalk/bot.ts
import crypto2 from "crypto";
import {
  AdapterBase,
  contactFriend,
  contactGroup,
  createFriendMessage,
  createGroupMessage,
  fileToUrl,
  karin,
  senderFriend,
  senderGroup,
  logger as logger4
} from "node-karin";
import { DWClient, EventAck, TOPIC_ROBOT } from "dingtalk-stream";

// src/dingtalk/constants.ts
var TOPIC_ROBOT_DELEGATE = "/v1.0/im/bot/messages/delegate";
var TOPIC_CARD_CALLBACK = "/v1.0/card/instances/callback";

// src/dingtalk/file.ts
import fs from "fs/promises";
import path from "path";
import { getMimeType } from "node-karin";

// src/dingtalk/utils.ts
var toStr = (value) => {
  if (value === null || value === void 0) return "";
  return String(value);
};
var redact = (value) => {
  const str = toStr(value);
  if (!str) return "";
  if (str.length <= 8) return "***";
  return `${str.slice(0, 3)}***${str.slice(-3)}`;
};
var safeJsonParse = (raw) => {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(toStr(error)) };
  }
};
var uniq = (arr) => Array.from(new Set(arr));

// src/dingtalk/file.ts
var isHttpUrl = (value) => /^https?:\/\//i.test(value);
var isDataUrl = (value) => /^data:/i.test(value);
var fileToBuffer = async (file, fallbackName = `file_${Date.now()}`) => {
  const input = toStr(file).trim();
  if (!input) throw new Error("empty file");
  if (input.startsWith("base64://")) {
    const b64 = input.slice("base64://".length);
    const buffer2 = Buffer.from(b64, "base64");
    const name2 = fallbackName;
    const mimeType2 = getMimeType(name2);
    return { buffer: buffer2, name: name2, mimeType: mimeType2 };
  }
  if (isDataUrl(input)) {
    const match = input.match(/^data:([^;,]+)?;base64,(.+)$/i);
    if (!match) throw new Error("unsupported data url");
    const mimeType2 = match[1] || "application/octet-stream";
    const buffer2 = Buffer.from(match[2], "base64");
    const name2 = fallbackName;
    return { buffer: buffer2, name: name2, mimeType: mimeType2 };
  }
  if (isHttpUrl(input)) {
    const res = await fetch(input);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ab = await res.arrayBuffer();
    const buffer2 = Buffer.from(ab);
    const name2 = path.basename(new URL(input).pathname) || fallbackName;
    const mimeType2 = res.headers.get("content-type") || getMimeType(name2);
    return { buffer: buffer2, name: name2, mimeType: mimeType2 };
  }
  const buffer = await fs.readFile(input);
  const name = path.basename(input) || fallbackName;
  const mimeType = getMimeType(name);
  return { buffer, name, mimeType };
};

// src/dingtalk/openapi.ts
import { logger as logger2 } from "node-karin";
var OPENAPI_BASE = "https://api.dingtalk.com";
var fetchJson = async (url, options) => {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.message || json?.errmsg || text || `HTTP ${res.status}`;
    const err = new Error(`[OpenAPI] HTTP ${res.status}: ${msg}`);
    err.status = res.status;
    err.response = json ?? text;
    throw err;
  }
  const errCode = json?.errcode ?? json?.errCode ?? json?.code;
  if (typeof errCode === "number" && errCode !== 0) {
    const err = new Error(`[OpenAPI] ${json?.errmsg || json?.message || `errcode=${errCode}`}`);
    err.code = errCode;
    err.response = json;
    throw err;
  }
  if (typeof errCode === "string" && errCode && errCode !== "0" && errCode !== "OK") {
    const err = new Error(`[OpenAPI] ${json?.message || json?.errmsg || errCode}`);
    err.code = errCode;
    err.response = json;
    throw err;
  }
  return json;
};
var DingTalkOpenApiClient = class {
  constructor(options) {
    this.options = options;
    this.corpId = toStr(options.corpId);
    this.robotCode = toStr(options.robotCode);
  }
  token = null;
  corpId = "";
  robotCode = "";
  get accountId() {
    return this.options.accountId;
  }
  get clientId() {
    return this.options.clientId;
  }
  get clientSecret() {
    return this.options.clientSecret;
  }
  get debug() {
    return Boolean(this.options.debug);
  }
  get timeoutMs() {
    return Number(this.options.timeoutMs ?? 1e4) || 1e4;
  }
  updateFromCallbackData(data) {
    const corpId = toStr(
      data?.senderCorpId || data?.chatbotCorpId || data?.corpId || data?.corp_id
    );
    if (!this.corpId && corpId) this.corpId = corpId;
    const robotCode = toStr(data?.robotCode || data?.robot_code);
    if (!this.robotCode && robotCode) this.robotCode = robotCode;
  }
  setCorpId(corpId) {
    if (corpId) this.corpId = toStr(corpId);
  }
  setRobotCode(robotCode) {
    if (robotCode) this.robotCode = toStr(robotCode);
  }
  log(...args) {
    if (!this.debug) return;
    logger2.info(`[DingOpenAPI:${this.accountId || "unknown"}]`, ...args);
  }
  async getAccessToken() {
    const now = Date.now();
    if (this.token?.accessToken && this.token.expireAt - now > 6e4) {
      return this.token.accessToken;
    }
    if (!this.corpId) {
      throw new Error("[OpenAPI] corpId is required for /v1.0/oauth2/{corpId}/token");
    }
    const url = `${OPENAPI_BASE}/v1.0/oauth2/${encodeURIComponent(this.corpId)}/token`;
    const body = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "client_credentials"
    };
    this.log("refresh token", `corpId=${this.corpId}`, `clientId=${redact(this.clientId)}`);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const json = await fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const accessToken = toStr(json?.access_token || json?.accessToken);
      const expiresInSec = Number(json?.expires_in ?? json?.expireIn ?? 0);
      if (!accessToken || !Number.isFinite(expiresInSec) || expiresInSec <= 0) {
        throw new Error(`[OpenAPI] invalid token response: ${JSON.stringify(json)}`);
      }
      this.token = { accessToken, expireAt: now + expiresInSec * 1e3 };
      return accessToken;
    } finally {
      clearTimeout(t);
    }
  }
  async request(path3, params = {}) {
    const token = await this.getAccessToken();
    const url = `${OPENAPI_BASE}${path3}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetchJson(url, {
        method: params.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": token
        },
        body: params.body === void 0 ? void 0 : JSON.stringify(params.body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(t);
    }
  }
  async downloadMessageFile(params) {
    const dc = toStr(params.downloadCode);
    if (!dc) throw new Error("[OpenAPI] downloadCode is required");
    const rc = toStr(params.robotCode || this.robotCode);
    if (!rc) throw new Error("[OpenAPI] robotCode is required for messageFiles/download");
    const json = await this.request("/v1.0/robot/messageFiles/download", {
      method: "POST",
      body: { downloadCode: dc, robotCode: rc }
    });
    const url = toStr(json?.downloadUrl || json?.download_url);
    if (!url) throw new Error(`[OpenAPI] downloadUrl missing in response: ${JSON.stringify(json)}`);
    return url;
  }
  async sendGroupMessage(params) {
    const cid = toStr(params.openConversationId);
    if (!cid) throw new Error("[OpenAPI] openConversationId is required for groupMessages/send");
    const rc = toStr(params.robotCode || this.robotCode);
    if (!rc) throw new Error("[OpenAPI] robotCode is required for groupMessages/send");
    const msgKey = params.kind === "markdown" ? "sampleMarkdown" : "sampleText";
    const msgParam = params.kind === "markdown" ? JSON.stringify({ title: toStr(params.title) || "\u6D88\u606F", text: toStr(params.content) }) : JSON.stringify({ content: toStr(params.content) });
    return await this.request("/v1.0/robot/groupMessages/send", {
      method: "POST",
      body: {
        msgParam,
        msgKey,
        openConversationId: cid,
        robotCode: rc
      }
    });
  }
  async sendGroupImageMessage(params) {
    const cid = toStr(params.openConversationId);
    if (!cid) throw new Error("[OpenAPI] openConversationId is required for groupMessages/send");
    const rc = toStr(params.robotCode || this.robotCode);
    if (!rc) throw new Error("[OpenAPI] robotCode is required for groupMessages/send");
    const url = toStr(params.photoURL);
    if (!url) throw new Error("[OpenAPI] photoURL is required for image message");
    return await this.request("/v1.0/robot/groupMessages/send", {
      method: "POST",
      body: {
        msgParam: JSON.stringify({ photoURL: url }),
        msgKey: "sampleImageMsg",
        openConversationId: cid,
        robotCode: rc
      }
    });
  }
  async batchSendOtoMessage(params) {
    const ids = Array.isArray(params.userIds) ? params.userIds.filter(Boolean).map(String) : [];
    if (!ids.length) throw new Error("[OpenAPI] userIds is required for oToMessages/batchSend");
    const rc = toStr(params.robotCode || this.robotCode);
    if (!rc) throw new Error("[OpenAPI] robotCode is required for oToMessages/batchSend");
    const msgKey = params.kind === "markdown" ? "sampleMarkdown" : "sampleText";
    const msgParam = params.kind === "markdown" ? JSON.stringify({ title: toStr(params.title) || "\u6D88\u606F", text: toStr(params.content) }) : JSON.stringify({ content: toStr(params.content) });
    return await this.request("/v1.0/robot/oToMessages/batchSend", {
      method: "POST",
      body: {
        msgParam,
        msgKey,
        robotCode: rc,
        userIds: ids
      }
    });
  }
  async batchSendOtoImageMessage(params) {
    const ids = Array.isArray(params.userIds) ? params.userIds.filter(Boolean).map(String) : [];
    if (!ids.length) throw new Error("[OpenAPI] userIds is required for oToMessages/batchSend");
    const rc = toStr(params.robotCode || this.robotCode);
    if (!rc) throw new Error("[OpenAPI] robotCode is required for oToMessages/batchSend");
    const url = toStr(params.photoURL);
    if (!url) throw new Error("[OpenAPI] photoURL is required for image message");
    return await this.request("/v1.0/robot/oToMessages/batchSend", {
      method: "POST",
      body: {
        msgParam: JSON.stringify({ photoURL: url }),
        msgKey: "sampleImageMsg",
        robotCode: rc,
        userIds: ids
      }
    });
  }
  async recallGroupMessages(params) {
    const cid = toStr(params.openConversationId);
    if (!cid) throw new Error("[OpenAPI] openConversationId is required for groupMessages/recall");
    const keys = Array.isArray(params.processQueryKeys) ? params.processQueryKeys.filter(Boolean).map(String) : [];
    if (!keys.length) throw new Error("[OpenAPI] processQueryKeys is required for groupMessages/recall");
    const rc = toStr(params.robotCode || this.robotCode);
    if (!rc) throw new Error("[OpenAPI] robotCode is required for groupMessages/recall");
    return await this.request("/v1.0/robot/groupMessages/recall", {
      method: "POST",
      body: {
        openConversationId: cid,
        processQueryKeys: keys,
        robotCode: rc
      }
    });
  }
  async recallOtoMessages(params) {
    const keys = Array.isArray(params.processQueryKeys) ? params.processQueryKeys.filter(Boolean).map(String) : [];
    if (!keys.length) throw new Error("[OpenAPI] processQueryKeys is required for otoMessages/batchRecall");
    const rc = toStr(params.robotCode || this.robotCode);
    if (!rc) throw new Error("[OpenAPI] robotCode is required for otoMessages/batchRecall");
    return await this.request("/v1.0/robot/otoMessages/batchRecall", {
      method: "POST",
      body: {
        processQueryKeys: keys,
        robotCode: rc
      }
    });
  }
};

// src/dingtalk/oapi.ts
import { logger as logger3 } from "node-karin";
var OAPI_BASE = "https://oapi.dingtalk.com";
var sanitizeUrl = (input) => {
  try {
    const url = new URL(String(input));
    for (const key of ["access_token", "appkey", "appsecret"]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "***");
    }
    return url.toString();
  } catch {
    return String(input).replace(/(access_token)=([^&]+)/g, "$1=***").replace(/(appkey)=([^&]+)/g, "$1=***").replace(/(appsecret)=([^&]+)/g, "$1=***");
  }
};
var fetchJson2 = async (url, options) => {
  let res;
  try {
    res = await fetch(url, options);
  } catch (error) {
    const safeUrl = sanitizeUrl(url);
    const err = error instanceof Error ? error : new Error(String(error));
    if (!err.message.includes(safeUrl)) err.message = `${err.message} (${safeUrl})`;
    throw err;
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.errmsg || json?.message || text || `HTTP ${res.status}`;
    const err = new Error(`[OAPI] HTTP ${res.status}: ${msg}`);
    err.status = res.status;
    err.response = json ?? text;
    throw err;
  }
  const errCode = json?.errcode ?? json?.errCode ?? json?.code;
  if (typeof errCode === "number" && errCode !== 0) {
    const err = new Error(`[OAPI] ${json?.errmsg || json?.message || `errcode=${errCode}`}`);
    err.code = errCode;
    err.response = json;
    throw err;
  }
  if (typeof errCode === "string" && errCode && errCode !== "0" && errCode !== "OK") {
    const err = new Error(`[OAPI] ${json?.message || json?.errmsg || errCode}`);
    err.code = errCode;
    err.response = json;
    throw err;
  }
  return json;
};
var DingTalkOApiClient = class {
  constructor(options) {
    this.options = options;
  }
  token = null;
  get accountId() {
    return this.options.accountId;
  }
  get clientId() {
    return this.options.clientId;
  }
  get clientSecret() {
    return this.options.clientSecret;
  }
  get debug() {
    return Boolean(this.options.debug);
  }
  get timeoutMs() {
    return Number(this.options.timeoutMs ?? 15e3) || 15e3;
  }
  log(...args) {
    if (!this.debug) return;
    logger3.info(`[DingOAPI:${this.accountId || "unknown"}]`, ...args);
  }
  async getAccessToken() {
    const now = Date.now();
    if (this.token?.accessToken && this.token.expireAt - now > 6e4) {
      return this.token.accessToken;
    }
    if (!this.clientId || !this.clientSecret) {
      throw new Error("[OAPI] clientId/clientSecret is required for gettoken");
    }
    const url = `${OAPI_BASE}/gettoken?appkey=${encodeURIComponent(this.clientId)}&appsecret=${encodeURIComponent(this.clientSecret)}`;
    this.log("gettoken", redact(this.clientId), redact(this.clientSecret));
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const json = await fetchJson2(url, { method: "GET", signal: controller.signal });
      const token = toStr(json?.access_token);
      const expiresIn = Number(json?.expires_in) || 7200;
      if (!token) throw new Error("[OAPI] gettoken returned empty access_token");
      this.token = { accessToken: token, expireAt: now + expiresIn * 1e3 };
      return token;
    } finally {
      clearTimeout(t);
    }
  }
  async uploadMedia(params) {
    if (!(params.buffer instanceof Buffer)) throw new Error("[OAPI] uploadMedia requires buffer");
    const token = await this.getAccessToken();
    const url = `${OAPI_BASE}/media/upload?access_token=${encodeURIComponent(token)}&type=${encodeURIComponent(params.type ?? "image")}`;
    const name = toStr(params.fileName) || `upload_${Date.now()}`;
    const mt = toStr(params.mimeType) || "application/octet-stream";
    const blob = new Blob([params.buffer], { type: mt });
    const form = new FormData();
    form.append("media", blob, name);
    this.log("media/upload", params.type ?? "image", name, mt, `size=${params.buffer.length}`);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const json = await fetchJson2(url, { method: "POST", body: form, signal: controller.signal });
      const mediaId = toStr(json?.media_id || json?.mediaId);
      if (!mediaId) throw new Error("[OAPI] media/upload returned empty media_id");
      return mediaId;
    } finally {
      clearTimeout(t);
    }
  }
};

// src/dingtalk/message.ts
import { segment } from "node-karin";
var DOWNLOAD_CODE_PREFIX = "dingtalk://downloadCode/";
var toScene = (conversationType) => {
  return toStr(conversationType) === "2" ? "group" : "friend";
};
var getMsgType = (data) => {
  const candidates = [data?.msgtype, data?.msgType, data?.messageType, data?.message_type];
  for (const v of candidates) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};
var extractText = (data) => {
  const t = data?.text?.content;
  if (typeof t === "string") return t.trim();
  const c = data?.content?.content;
  if (typeof c === "string") return c.trim();
  const rich = data?.content?.richText || data?.content?.rich_text || data?.richTextContent?.richText || data?.richTextContent?.rich_text || data?.richTextContent || data?.richText;
  if (Array.isArray(rich)) {
    const parts = [];
    for (const item of rich) {
      if (typeof item === "string") parts.push(item);
      else if (item && typeof item === "object") {
        if (typeof item.text === "string") parts.push(item.text);
        else if (typeof item.content === "string") parts.push(item.content);
        else if (typeof item.title === "string") parts.push(item.title);
      }
    }
    const joined = parts.join("").trim();
    if (joined) return joined;
  }
  return "";
};
var parseMessageSegments = (data) => {
  const msgType = getMsgType(data).toLowerCase();
  const text = extractText(data);
  if (!msgType || msgType === "text" || msgType === "markdown") {
    return [{ type: "text", text }];
  }
  const pickString = (obj, keys) => {
    for (const key of keys) {
      const v = obj?.[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  if (msgType.includes("richtext") || msgType.includes("rich_text")) {
    const rich = data?.content?.richText || data?.content?.rich_text || data?.richTextContent?.richText || data?.richTextContent?.rich_text || data?.richText || [];
    if (Array.isArray(rich)) {
      const segs = [];
      for (const item of rich) {
        if (!item) continue;
        if (typeof item === "string") {
          segs.push({ type: "text", text: item });
          continue;
        }
        if (typeof item === "object") {
          const t = pickString(item, ["text", "content", "title"]);
          if (t) segs.push({ type: "text", text: t });
          const itemType = pickString(item, ["type"]).toLowerCase();
          if (itemType === "picture" || itemType === "image") {
            const downloadCode = pickString(item, ["downloadCode", "download_code"]);
            const pictureDownloadCode = pickString(item, ["pictureDownloadCode", "picture_download_code"]);
            const code = downloadCode || pictureDownloadCode;
            segs.push({
              type: "image",
              file: code ? `${DOWNLOAD_CODE_PREFIX}${code}` : "",
              downloadCode: downloadCode || void 0,
              pictureDownloadCode: pictureDownloadCode || void 0
            });
          }
        }
      }
      if (segs.length) return segs;
    }
    return [{ type: "text", text: text || "[richText]" }];
  }
  if (msgType.includes("image") || msgType.includes("picture")) {
    const fromContent = data?.content || data?.imageContent || data?.image || {};
    const downloadCode = pickString(fromContent, ["downloadCode", "download_code"]);
    const pictureDownloadCode = pickString(fromContent, ["pictureDownloadCode", "picture_download_code"]);
    const code = downloadCode || pictureDownloadCode;
    return [{
      type: "image",
      file: code ? `${DOWNLOAD_CODE_PREFIX}${code}` : "",
      downloadCode: downloadCode || void 0,
      pictureDownloadCode: pictureDownloadCode || void 0
    }];
  }
  if (msgType.includes("file") || msgType.includes("voice") || msgType.includes("audio") || msgType.includes("video")) {
    const fromContent = data?.content || data?.fileContent || data?.voiceContent || data?.videoContent || {};
    const downloadCode = pickString(fromContent, ["downloadCode", "download_code"]);
    const name = pickString(fromContent, ["fileName", "file_name", "name"]);
    let segType = "file";
    if (msgType.includes("voice") || msgType.includes("audio")) segType = "record";
    if (msgType.includes("video")) segType = "video";
    return [{
      type: segType,
      file: downloadCode ? `${DOWNLOAD_CODE_PREFIX}${downloadCode}` : "",
      name: name || void 0,
      downloadCode: downloadCode || void 0
    }];
  }
  return [{ type: "text", text: text ? `${msgType}: ${text}` : `[${msgType}]` }];
};
var segmentsToElements = (segments) => {
  const out = [];
  for (const seg of segments) {
    if (seg.type === "text") {
      out.push(segment.text(seg.text));
      continue;
    }
    if (seg.type === "image") {
      out.push(segment.image(seg.file));
      continue;
    }
    if (seg.type === "file") out.push(segment.text(seg.name ? `[\u6587\u4EF6] ${seg.name}` : "[\u6587\u4EF6]"));
    if (seg.type === "record") out.push(segment.text("[\u8BED\u97F3]"));
    if (seg.type === "video") out.push(segment.text("[\u89C6\u9891]"));
  }
  return out;
};

// src/dingtalk/webhook.ts
import crypto from "crypto";
var signWebhookUrl = (webhook, secret) => {
  const s = toStr(secret);
  if (!s) return webhook;
  try {
    const url = new URL(webhook);
    if (url.searchParams.has("sign") || url.searchParams.has("timestamp")) return webhook;
    const timestamp = Date.now();
    const stringToSign = `${timestamp}
${s}`;
    const sign = encodeURIComponent(
      crypto.createHmac("sha256", s).update(stringToSign).digest("base64")
    );
    url.searchParams.set("timestamp", String(timestamp));
    url.searchParams.set("sign", sign);
    return url.toString();
  } catch {
    return webhook;
  }
};
var postWebhook = async (webhook, body) => {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(`[DingTalkWebhook] HTTP ${res.status}: ${text || "empty response"}`);
  }
  const errcode = Number(json?.errcode ?? json?.errCode ?? 0);
  if (Number.isFinite(errcode) && errcode !== 0) {
    throw new Error(`[DingTalkWebhook] errcode=${errcode}: ${toStr(json?.errmsg || json?.message) || "unknown error"}`);
  }
  return json;
};
var sendWebhookText = async (params) => {
  const webhook = signWebhookUrl(params.webhook, params.secret);
  const body = {
    msgtype: "text",
    text: { content: toStr(params.content) }
  };
  const atUserIds = Array.isArray(params.at?.atUserIds) ? params.at.atUserIds.filter(Boolean).map(String) : [];
  const isAtAll = Boolean(params.at?.isAtAll);
  if (atUserIds.length || isAtAll) body.at = { atUserIds, isAtAll };
  return await postWebhook(webhook, body);
};
var sendWebhookMarkdown = async (params) => {
  const webhook = signWebhookUrl(params.webhook, params.secret);
  const body = {
    msgtype: "markdown",
    markdown: { title: toStr(params.title) || "\u6D88\u606F", text: toStr(params.text) }
  };
  const atUserIds = Array.isArray(params.at?.atUserIds) ? params.at.atUserIds.filter(Boolean).map(String) : [];
  const isAtAll = Boolean(params.at?.isAtAll);
  if (atUserIds.length || isAtAll) body.at = { atUserIds, isAtAll };
  return await postWebhook(webhook, body);
};
var sendWebhookImage = async (params) => {
  const webhook = signWebhookUrl(params.webhook, params.secret);
  const body = {
    msgtype: "image",
    image: {
      base64: toStr(params.base64),
      md5: toStr(params.md5)
    }
  };
  return await postWebhook(webhook, body);
};

// src/dingtalk/notice.ts
var sanitizeEventSegment = (value) => {
  const raw = toStr(value).trim();
  if (!raw) return "unknown";
  return raw.replace(/^\/+/, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_").slice(0, 64);
};
var buildDingtalkNoticeEvent = (params) => {
  const userId = params.data?.userId || params.data?.senderStaffId || params.data?.operatorUserId || params.data?.staffId || params.data?.openId || params.data?.unionId || "";
  const createAt = Number(params.data?.createAt || params.data?.eventTime || params.data?.timestamp);
  const time = Number.isFinite(createAt) && createAt > 0 ? Math.floor(createAt / 1e3) : Math.floor(Date.now() / 1e3);
  const e = {
    post_type: "notice",
    notice_type: params.noticeType || "dingtalk",
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
    _accountId: params.accountId
  };
  if (params.data?.conversationId) e.conversationId = toStr(params.data.conversationId);
  if (params.data?.openConversationId) e.openConversationId = toStr(params.data.openConversationId);
  return e;
};

// src/dingtalk/bot.ts
var DingTalkBot = class extends AdapterBase {
  accountId;
  accountConfig;
  globalConfig;
  openApi;
  oapi;
  connected = false;
  lastConnectAt = 0;
  lastMessageAt = 0;
  lastError = "";
  sessionWebhookCache;
  webhookBinding;
  lastRecallHintAt = 0;
  constructor(params) {
    super();
    this.globalConfig = params.globalConfig;
    this.accountConfig = params.accountConfig;
    this.accountId = params.accountConfig.accountId;
    this.sessionWebhookCache = params.sessionWebhookCache;
    this.webhookBinding = params.webhookBinding;
    this.super = new DWClient({
      clientId: params.accountConfig.clientId,
      clientSecret: params.accountConfig.clientSecret,
      debug: params.accountConfig.debug ?? params.globalConfig.debugGlobal ?? false,
      keepAlive: params.accountConfig.keepAlive ?? true,
      autoReconnect: params.accountConfig.autoReconnect ?? true
    });
    this.raw = this.super;
    const selfId = `DingDing_${this.accountId}`;
    this.account = {
      uin: toStr(params.accountConfig.clientId),
      uid: toStr(params.accountConfig.robotCode || params.accountConfig.clientId),
      selfId,
      subId: {},
      name: toStr(params.accountConfig.botName) || `DingTalkBot (${this.accountId})`,
      avatar: toStr(params.accountConfig.botAvatar)
    };
    this.adapter = {
      index: -1,
      name: "dingtalk-stream",
      version: "0.0.0",
      platform: "other",
      standard: "other",
      protocol: "other",
      communication: "webSocketClient",
      address: `dingtalk-stream://${toStr(params.accountConfig.clientId)}`,
      secret: null,
      connectTime: Date.now()
    };
    this.openApi = new DingTalkOpenApiClient({
      accountId: this.accountId,
      clientId: params.accountConfig.clientId,
      clientSecret: params.accountConfig.clientSecret,
      corpId: params.accountConfig.corpId,
      robotCode: params.accountConfig.robotCode,
      debug: params.accountConfig.debug ?? params.globalConfig.debugGlobal ?? false
    });
    this.oapi = new DingTalkOApiClient({
      accountId: this.accountId,
      clientId: params.accountConfig.clientId,
      clientSecret: params.accountConfig.clientSecret,
      debug: params.accountConfig.debug ?? params.globalConfig.debugGlobal ?? false
    });
  }
  resolveAtUserId(raw) {
    const key = toStr(raw).trim();
    if (!key) return "";
    const map = this.accountConfig.atUserIdMap;
    if (map && typeof map === "object") {
      const hit = map[key];
      if (typeof hit === "string" && hit.trim()) return hit.trim();
    }
    return key;
  }
  resolveRobotCodeFromEvent(data) {
    const fromEvent = toStr(data?.robotCode || data?.robot_code).trim();
    if (fromEvent) return fromEvent;
    const fromClient = toStr(this.openApi.robotCode).trim();
    if (fromClient) return fromClient;
    const fromCfg = toStr(this.accountConfig.robotCode).trim();
    if (fromCfg) return fromCfg;
    return "";
  }
  updateSessionWebhookCacheFromEvent(data) {
    const webhook = toStr(data?.sessionWebhook).trim();
    const expireAt = Number(data?.sessionWebhookExpiredTime ?? 0);
    const scene = toScene(data?.conversationType);
    const conversationId = toStr(data?.conversationId);
    const userId = toStr(data?.senderStaffId || data?.senderId);
    if (webhook && scene === "group" && conversationId) {
      this.sessionWebhookCache.set({
        accountId: this.accountId,
        scene: "group",
        peer: conversationId,
        webhook,
        expireAt
      });
    }
    if (webhook && scene === "friend" && userId) {
      this.sessionWebhookCache.set({
        accountId: this.accountId,
        scene: "friend",
        peer: userId,
        webhook,
        expireAt
      });
    }
  }
  async enrichIncomingMedia(segments, rawData) {
    if (this.accountConfig.enableOpenApiDownload === false) return;
    const robotCode = this.resolveRobotCodeFromEvent(rawData);
    if (!robotCode) return;
    const urlCache = /* @__PURE__ */ new Map();
    for (const seg of segments) {
      if (seg.type !== "image" && seg.type !== "file" && seg.type !== "record" && seg.type !== "video") continue;
      if (!seg.file?.startsWith(DOWNLOAD_CODE_PREFIX)) continue;
      const code = seg.file.slice(DOWNLOAD_CODE_PREFIX.length).trim();
      if (!code) continue;
      try {
        let url = urlCache.get(code);
        if (!url) {
          url = await this.openApi.downloadMessageFile({ downloadCode: code, robotCode });
          urlCache.set(code, url);
        }
        if (url) seg.file = url;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger4.bot("warn", this.selfId, `[recv] resolve downloadCode failed: ${msg}`);
      }
    }
  }
  async start() {
    const topics = /* @__PURE__ */ new Set([TOPIC_ROBOT, TOPIC_ROBOT_DELEGATE, TOPIC_CARD_CALLBACK]);
    if (Array.isArray(this.accountConfig.extraTopics)) {
      for (const t of this.accountConfig.extraTopics) {
        if (typeof t === "string" && t.trim()) topics.add(t.trim());
      }
    }
    for (const topic of topics) {
      this.super.registerCallbackListener(topic, (event) => this.onStreamEvent(topic, event));
    }
    try {
      await this.super.connect();
      this.connected = true;
      this.lastConnectAt = Date.now();
      this.lastError = "";
      logger4.bot("info", this.selfId, `[connect] connected (topics=${topics.size})`);
    } catch (error) {
      this.connected = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      logger4.bot("error", this.selfId, `[connect] failed: ${this.lastError}`);
    }
  }
  onStreamEvent(topic, streamEvent) {
    const messageId = streamEvent?.headers?.messageId;
    this.lastMessageAt = Date.now();
    if (messageId) {
      try {
        this.super.socketCallBackResponse(messageId, { status: EventAck.SUCCESS, message: "OK" });
      } catch {
      }
    }
    setImmediate(() => {
      this.handleStreamEvent(topic, streamEvent).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger4.bot("error", this.selfId, `[recv:${topic}] handler error: ${msg}`);
      });
    });
  }
  async handleStreamEvent(topic, streamEvent) {
    const raw = toStr(streamEvent?.data?.toString?.("utf8") ?? "");
    if (!raw) return;
    const parsed = safeJsonParse(raw);
    if (!parsed.ok) {
      logger4.bot("warn", this.selfId, `[recv:${topic}] invalid json: ${parsed.error.message}`);
      return;
    }
    const data = parsed.value;
    this.openApi.updateFromCallbackData(data);
    this.updateSessionWebhookCacheFromEvent(data);
    if (topic !== TOPIC_ROBOT && topic !== TOPIC_ROBOT_DELEGATE) {
      this.dispatchNoticeEvent(topic, data, raw, streamEvent);
      return;
    }
    const segments = parseMessageSegments(data);
    await this.enrichIncomingMedia(segments, data);
    const elements = segmentsToElements(segments);
    const scene = toScene(data?.conversationType);
    const messageId = toStr(data?.msgId || streamEvent?.headers?.messageId || `${this.selfId}_${Date.now()}`);
    const createAt = Number(data?.createAt);
    const time = Number.isFinite(createAt) && createAt > 0 ? Math.floor(createAt / 1e3) : Math.floor(Date.now() / 1e3);
    if (scene === "group") {
      const groupId = toStr(data?.conversationId);
      const groupName = toStr(data?.conversationTitle) || groupId;
      const userId2 = toStr(data?.senderStaffId || data?.senderId);
      const nickname2 = toStr(data?.senderNick) || userId2 || "unknown";
      if (!groupId || !userId2) {
        logger4.bot("warn", this.selfId, "[recv] missing conversationId/senderStaffId in group message, skip");
        return;
      }
      const role = data?.isBoss ? "owner" : data?.isAdmin ? "admin" : "member";
      const contact2 = contactGroup(groupId, groupName);
      const sender2 = senderGroup({ userId: userId2, role, nick: nickname2, name: nickname2 });
      createGroupMessage({
        bot: this,
        contact: contact2,
        sender: sender2,
        rawEvent: data,
        time,
        eventId: `message:${messageId}`,
        messageId,
        messageSeq: Number.isFinite(createAt) ? createAt : Date.now(),
        elements,
        srcReply: (els) => this.sendMsg(contact2, els, 0, { preferOpenApi: this.canUseOpenApiSend() })
      });
      return;
    }
    const userId = toStr(data?.senderStaffId || data?.senderId);
    const nickname = toStr(data?.senderNick) || userId || "unknown";
    if (!userId) {
      logger4.bot("warn", this.selfId, "[recv] missing senderStaffId in private message, skip");
      return;
    }
    const contact = contactFriend(userId, nickname);
    const sender = senderFriend(userId, nickname);
    createFriendMessage({
      bot: this,
      contact,
      sender,
      rawEvent: data,
      time,
      eventId: `message:${messageId}`,
      messageId,
      messageSeq: Number.isFinite(createAt) ? createAt : Date.now(),
      elements,
      srcReply: (els) => this.sendMsg(contact, els, 0, { preferOpenApi: this.canUseOpenApiSend() })
    });
  }
  dispatchNoticeEvent(topic, data, raw, streamEvent) {
    try {
      const noticeType = topic === TOPIC_CARD_CALLBACK ? "dingtalk_card" : "dingtalk_event";
      const e = buildDingtalkNoticeEvent({
        botId: this.selfId,
        accountId: this.accountId,
        topic,
        noticeType,
        data,
        raw,
        adapter: { id: this.adapter.name, name: this.adapter.name, version: this.adapter.version },
        streamEvent
      });
      const seg = sanitizeEventSegment(topic);
      const eventName = noticeType === "dingtalk_card" ? `notice.dingtalk.card.${seg}` : `notice.dingtalk.event.${seg}`;
      karin.emit(eventName, e);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger4.bot("error", this.selfId, `[recv:${topic}] dispatch notice error: ${msg}`);
    }
  }
  resolveWebhook(contact) {
    if (contact.scene === "group") {
      const sessionWebhook = this.sessionWebhookCache.get({ accountId: this.accountId, scene: "group", peer: contact.peer });
      if (sessionWebhook) return { webhook: sessionWebhook, secret: toStr(this.accountConfig.webhookSecret).trim() || void 0 };
      const binding = this.webhookBinding.getGroupWebhook(this.accountId, contact.peer);
      if (binding?.webhook) return { webhook: binding.webhook, secret: binding.secret };
      const fallback = toStr(this.accountConfig.webhook).trim() || toStr(this.globalConfig.defaultWebhook).trim();
      if (fallback) return { webhook: fallback, secret: toStr(this.accountConfig.webhookSecret).trim() || void 0 };
      return null;
    }
    if (contact.scene === "friend") {
      const sessionWebhook = this.sessionWebhookCache.get({ accountId: this.accountId, scene: "friend", peer: contact.peer });
      if (sessionWebhook) return { webhook: sessionWebhook, secret: toStr(this.accountConfig.webhookSecret).trim() || void 0 };
      return null;
    }
    return null;
  }
  canUseOpenApiSend() {
    return this.accountConfig.enableOpenApiSend === true;
  }
  get enablePublicImageBed() {
    return this.accountConfig.enablePublicImageBed ?? this.globalConfig.enablePublicImageBed ?? false;
  }
  async sendMsg(contact, elements, _retryCount = 0, options) {
    const preferOpenApi = options?.preferOpenApi === true;
    const atUserIds = /* @__PURE__ */ new Set();
    let isAtAll = false;
    const textParts = [];
    const imageFiles = [];
    for (const el of elements) {
      if (!el || typeof el !== "object") continue;
      switch (el.type) {
        case "text":
          textParts.push(toStr(el.text));
          break;
        case "at": {
          const targetId = toStr(el.targetId);
          if (targetId === "all") isAtAll = true;
          else if (targetId) atUserIds.add(this.resolveAtUserId(targetId));
          const name = toStr(el.name) || targetId;
          if (name) textParts.push(`@${name} `);
          break;
        }
        case "image":
          imageFiles.push(toStr(el.file));
          break;
        case "reply":
          break;
        default:
          textParts.push(`[${toStr(el.type) || "unknown"}]`);
      }
    }
    const webhookCtx = this.resolveWebhook(contact);
    const responses = [];
    const nowSec = Math.floor(Date.now() / 1e3);
    let lastMessageId = "";
    const sendOpenApiMessage = async (payload) => {
      const robotCode = this.resolveRobotCodeFromEvent({});
      if (!robotCode) throw new Error("[dingtalk] OpenAPI send requires robotCode (config or callback)");
      if (contact.scene === "group") {
        const resp = await this.openApi.sendGroupMessage({
          openConversationId: contact.peer,
          kind: payload.kind,
          content: payload.content,
          title: payload.title,
          robotCode
        });
        responses.push(resp);
        lastMessageId = toStr(resp?.processQueryKey || resp?.process_query_key) || `${this.selfId}_${Date.now()}`;
        return;
      }
      if (contact.scene === "friend") {
        const resp = await this.openApi.batchSendOtoMessage({
          userIds: [contact.peer],
          kind: payload.kind,
          content: payload.content,
          title: payload.title,
          robotCode
        });
        responses.push(resp);
        lastMessageId = toStr(resp?.processQueryKey || resp?.process_query_key) || `${this.selfId}_${Date.now()}`;
        return;
      }
      throw new Error(`[dingtalk] unsupported contact.scene=${contact.scene}`);
    };
    const sendText = async (content) => {
      const payload = content || " ";
      if (preferOpenApi && this.canUseOpenApiSend()) {
        try {
          await sendOpenApiMessage({ kind: "text", content: payload });
          return;
        } catch (error) {
          if (!webhookCtx?.webhook) throw error;
          const msg = error instanceof Error ? error.message : String(error);
          logger4.bot("warn", this.selfId, `[send] OpenAPI text send failed, fallback to webhook: ${msg}`);
        }
      }
      if (webhookCtx?.webhook) {
        const resp = await sendWebhookText({
          webhook: webhookCtx.webhook,
          secret: webhookCtx.secret,
          content: payload,
          at: { atUserIds: Array.from(atUserIds), isAtAll }
        });
        responses.push(resp);
        lastMessageId = `${this.selfId}_${Date.now()}`;
        return;
      }
      if (!this.canUseOpenApiSend()) throw new Error("[dingtalk] no available webhook, and enableOpenApiSend=false");
      await sendOpenApiMessage({ kind: "text", content: payload });
    };
    const sendImage = async (file) => {
      const clean = toStr(file).trim();
      if (!clean) return;
      const maxWebhookImageBytes = 15 * 1024;
      const tryGetPublicUrl = async () => {
        if (/^https?:\/\//i.test(clean)) return clean;
        try {
          const info = await fileToBuffer(clean, `image_${Date.now()}`);
          const res = await fileToUrl("image", info.buffer, info.name);
          const url = toStr(res?.url).trim();
          if (/^https?:\/\//i.test(url)) return url;
        } catch {
        }
        return null;
      };
      const sendMarkdownImageByWebhook = async (url) => {
        const resp = await sendWebhookMarkdown({
          webhook: webhookCtx.webhook,
          secret: webhookCtx?.secret,
          title: "\u56FE\u7247",
          text: `![\u56FE\u7247](${url})
`,
          at: { atUserIds: Array.from(atUserIds), isAtAll }
        });
        responses.push(resp);
        lastMessageId = `${this.selfId}_${Date.now()}`;
      };
      const sendBase64ImageByWebhook = async () => {
        const info = await fileToBuffer(clean, `image_${Date.now()}`);
        if (info.buffer.length > maxWebhookImageBytes) {
          throw new Error(`[dingtalk] webhook image too large: ${info.buffer.length} bytes`);
        }
        const base64 = info.buffer.toString("base64");
        const md5 = crypto2.createHash("md5").update(info.buffer).digest("hex");
        const resp = await sendWebhookImage({
          webhook: webhookCtx.webhook,
          secret: webhookCtx?.secret,
          base64,
          md5
        });
        responses.push(resp);
        lastMessageId = `${this.selfId}_${Date.now()}`;
      };
      const sendImageByOpenApi = async () => {
        const robotCode = this.resolveRobotCodeFromEvent({});
        if (!robotCode) throw new Error("[dingtalk] OpenAPI image send requires robotCode (config or callback)");
        let photoURL = clean;
        if (!/^https?:\/\//i.test(clean)) {
          const info = await fileToBuffer(clean, `image_${Date.now()}`);
          photoURL = await this.oapi.uploadMedia({
            type: "image",
            buffer: info.buffer,
            fileName: info.name,
            mimeType: info.mimeType
          });
        }
        if (contact.scene === "group") {
          const resp = await this.openApi.sendGroupImageMessage({
            openConversationId: contact.peer,
            photoURL,
            robotCode
          });
          responses.push(resp);
          lastMessageId = toStr(resp?.processQueryKey || resp?.process_query_key) || `${this.selfId}_${Date.now()}`;
          return;
        }
        if (contact.scene === "friend") {
          const resp = await this.openApi.batchSendOtoImageMessage({
            userIds: [contact.peer],
            photoURL,
            robotCode
          });
          responses.push(resp);
          lastMessageId = toStr(resp?.processQueryKey || resp?.process_query_key) || `${this.selfId}_${Date.now()}`;
          return;
        }
        throw new Error(`[dingtalk] unsupported contact.scene=${contact.scene}`);
      };
      if (webhookCtx?.webhook) {
        if (this.enablePublicImageBed) {
          const url2 = await tryGetPublicUrl();
          if (url2) {
            await sendMarkdownImageByWebhook(url2);
            return;
          }
        } else {
          try {
            await sendImageByOpenApi();
            return;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger4.bot("warn", this.selfId, `[send] OpenAPI image send failed, fallback to webhook: ${msg}`);
          }
        }
        try {
          await sendBase64ImageByWebhook();
          return;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger4.bot("warn", this.selfId, `[send] webhook image(base64) failed: ${msg}`);
        }
        const url = await tryGetPublicUrl();
        if (url) {
          try {
            await sendMarkdownImageByWebhook(url);
            return;
          } catch {
          }
        }
        await sendText("[\u56FE\u7247]");
        return;
      }
      if (!this.canUseOpenApiSend()) throw new Error("[dingtalk] no available webhook, and enableOpenApiSend=false");
      if (this.enablePublicImageBed) {
        const url = await tryGetPublicUrl();
        if (url) {
          await sendOpenApiMessage({ kind: "markdown", title: "\u56FE\u7247", content: `![\u56FE\u7247](${url})
` });
          return;
        }
      }
      await sendImageByOpenApi();
    };
    const text = textParts.join("").trim();
    if (text || atUserIds.size || isAtAll) await sendText(text || " ");
    for (const f of uniq(imageFiles)) await sendImage(f);
    if (!lastMessageId) lastMessageId = `${this.selfId}_${Date.now()}`;
    return {
      messageId: lastMessageId,
      time: nowSec,
      rawData: responses.length === 1 ? responses[0] : responses,
      message_id: lastMessageId,
      messageTime: nowSec
    };
  }
  async sendForwardMsg(contact, _elements) {
    const res = await this.sendMsg(contact, [{ type: "text", text: "[\u4E0D\u652F\u6301\u5408\u5E76\u8F6C\u53D1] \u8BF7\u6539\u7528\u666E\u901A\u6587\u672C/\u56FE\u7247\u53D1\u9001" }]);
    return { messageId: res.messageId, forwardId: res.messageId };
  }
  async recallMsg(contact, messageId) {
    const raw = toStr(messageId).trim();
    if (!raw) return;
    const explicit = /^openapi:/i.test(raw);
    const key = raw.replace(/^openapi:/i, "").trim();
    if (!key) return;
    const looksLikeWebhookSendId = raw.startsWith(`${this.selfId}_`);
    if (looksLikeWebhookSendId && !explicit) {
      const now = Date.now();
      if (now - this.lastRecallHintAt > 6e4) {
        this.lastRecallHintAt = now;
        logger4.bot("warn", this.selfId, "[recall] skip: non-OpenAPI messageId (webhook sends cannot be recalled).");
      }
      return;
    }
    const robotCode = this.resolveRobotCodeFromEvent({});
    if (!robotCode) {
      logger4.bot("warn", this.selfId, "[recall] missing robotCode, skip");
      return;
    }
    try {
      if (contact.scene === "group") {
        const resp = await this.openApi.recallGroupMessages({
          openConversationId: contact.peer,
          processQueryKeys: [key],
          robotCode
        });
        const ok = resp?.success ?? resp?.result ?? resp?.data?.success ?? resp?.data?.result;
        if (typeof ok === "boolean" && !ok) {
          throw new Error(`[OpenAPI] groupMessages/recall returned success=false: ${JSON.stringify(resp)}`);
        }
        return;
      }
      if (contact.scene === "friend") {
        const resp = await this.openApi.recallOtoMessages({
          processQueryKeys: [key],
          robotCode
        });
        const ok = resp?.success ?? resp?.result ?? resp?.data?.success ?? resp?.data?.result;
        if (typeof ok === "boolean" && !ok) {
          throw new Error(`[OpenAPI] otoMessages/batchRecall returned success=false: ${JSON.stringify(resp)}`);
        }
        return;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger4.bot("warn", this.selfId, `[recall] failed: ${msg}`);
    }
  }
};

// src/dingtalk/sessionWebhookCache.ts
var SessionWebhookCache = class {
  map = /* @__PURE__ */ new Map();
  makeKey(accountId, scene, peer) {
    return `${toStr(accountId)}|${toStr(scene)}|${toStr(peer)}`;
  }
  set(params) {
    const webhook = toStr(params.webhook).trim();
    if (!webhook) return;
    const expireAt = Number(params.expireAt ?? 0);
    this.map.set(this.makeKey(params.accountId, params.scene, params.peer), {
      webhook,
      expireAt: Number.isFinite(expireAt) && expireAt > 0 ? expireAt : 0
    });
  }
  get(params) {
    const key = this.makeKey(params.accountId, params.scene, params.peer);
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expireAt > 0 && Date.now() > hit.expireAt) {
      this.map.delete(key);
      return null;
    }
    return hit.webhook;
  }
};

// src/dingtalk/webhookBinding.ts
import fs2 from "fs";
import path2 from "path";
var getDataDir = () => {
  const dataDir = path2.join(dir.karinPath, "data");
  if (!fs2.existsSync(dataDir)) fs2.mkdirSync(dataDir, { recursive: true });
  return dataDir;
};
var ProactiveWebhookBinding = class {
  filePath;
  data = { version: 1, items: {} };
  constructor() {
    this.filePath = path2.join(getDataDir(), "dingtalk.webhookBindings.json");
    this.load();
  }
  makeKey(accountId, groupId) {
    return `${toStr(accountId)}|group|${toStr(groupId)}`;
  }
  load() {
    try {
      if (!fs2.existsSync(this.filePath)) return;
      const raw = fs2.readFileSync(this.filePath, "utf8");
      const json = raw ? JSON.parse(raw) : null;
      if (json?.version !== 1 || typeof json.items !== "object" || !json.items) return;
      this.data = { version: 1, items: json.items };
    } catch {
    }
  }
  save() {
    const tmp = `${this.filePath}.${Date.now()}.tmp`;
    fs2.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    fs2.renameSync(tmp, this.filePath);
  }
  getGroupWebhook(accountId, groupId) {
    const key = this.makeKey(accountId, groupId);
    const item = this.data.items[key];
    if (!item?.webhook) return null;
    return item;
  }
  setGroupWebhook(accountId, groupId, webhook, secret) {
    const key = this.makeKey(accountId, groupId);
    this.data.items[key] = {
      webhook: toStr(webhook).trim(),
      secret: toStr(secret).trim() || void 0,
      updatedAt: Date.now()
    };
    this.save();
  }
  deleteGroupWebhook(accountId, groupId) {
    const key = this.makeKey(accountId, groupId);
    if (!this.data.items[key]) return false;
    delete this.data.items[key];
    this.save();
    return true;
  }
};

// src/dingtalk/service.ts
var DingTalkService = class {
  sessionWebhookCache = new SessionWebhookCache();
  webhookBinding = new ProactiveWebhookBinding();
  bots = /* @__PURE__ */ new Map();
  getAllBots() {
    return Array.from(this.bots.values());
  }
  getBotBySelfId(selfId) {
    return this.bots.get(selfId);
  }
  getBotByAccountId(accountId) {
    const id = toStr(accountId);
    return this.getAllBots().find((b) => b.accountId === id);
  }
  bindGroupWebhook(params) {
    this.webhookBinding.setGroupWebhook(params.accountId, params.groupId, params.webhook, params.secret);
  }
  unbindGroupWebhook(params) {
    return this.webhookBinding.deleteGroupWebhook(params.accountId, params.groupId);
  }
  getBoundGroupWebhook(params) {
    return this.webhookBinding.getGroupWebhook(params.accountId, params.groupId);
  }
  async init() {
    const cfg = config();
    if (cfg.enableDingAdapter === false) {
      logger5.info("[dingtalk] disabled by config.enableDingAdapter=false");
      return;
    }
    const accounts = Array.isArray(cfg.dingdingAccounts) ? cfg.dingdingAccounts : [];
    if (!accounts.length) {
      logger5.info("[dingtalk] dingdingAccounts is empty");
      return;
    }
    for (const accountConfig of accounts) {
      const validated = this.validateAccountConfig(accountConfig);
      if (!validated) continue;
      const selfId = `DingDing_${validated.accountId}`;
      if (this.bots.has(selfId)) continue;
      const bot = new DingTalkBot({
        globalConfig: cfg,
        accountConfig: validated,
        sessionWebhookCache: this.sessionWebhookCache,
        webhookBinding: this.webhookBinding
      });
      bot.adapter.version = dir.version;
      registerBot("webSocketClient", bot);
      this.bots.set(selfId, bot);
      bot.start().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger5.bot("error", bot.selfId, `[start] failed: ${msg}`);
      });
    }
  }
  validateAccountConfig(account) {
    if (!account || typeof account !== "object") return null;
    if (account.enable === false) return null;
    const accountId = toStr(account.accountId).trim();
    const clientId = toStr(account.clientId).trim();
    const clientSecret = toStr(account.clientSecret).trim();
    if (!accountId || !clientId || !clientSecret) {
      logger5.warn("[dingtalk] skip invalid account config:", { accountId, clientId: Boolean(clientId), clientSecret: Boolean(clientSecret) });
      return null;
    }
    return {
      ...account,
      accountId,
      clientId,
      clientSecret
    };
  }
};
var getDingTalkService = () => {
  if (!globalThis.__karin_plugin_dingtalk_service__) {
    globalThis.__karin_plugin_dingtalk_service__ = new DingTalkService();
  }
  return globalThis.__karin_plugin_dingtalk_service__;
};
var initDingTalkService = async () => {
  const service = getDingTalkService();
  await service.init();
  return service;
};

export {
  getDingTalkService,
  initDingTalkService
};
