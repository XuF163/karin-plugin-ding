import fs from 'node:fs'
import path from 'node:path'
import { dir } from '@/dir'
import { toStr } from './utils'

export interface WebhookBindingItem {
  webhook: string
  secret?: string
  updatedAt: number
}

interface WebhookBindingFile {
  version: 1
  items: Record<string, WebhookBindingItem>
}

const getDataDir = () => {
  const dataDir = path.join(dir.karinPath, 'data')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  return dataDir
}

export class ProactiveWebhookBinding {
  private readonly filePath: string
  private data: WebhookBindingFile = { version: 1, items: {} }

  constructor () {
    this.filePath = path.join(getDataDir(), 'dingtalk.webhookBindings.json')
    this.load()
  }

  private makeKey (accountId: string, groupId: string) {
    return `${toStr(accountId)}|group|${toStr(groupId)}`
  }

  load () {
    try {
      if (!fs.existsSync(this.filePath)) return
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const json = raw ? JSON.parse(raw) as Partial<WebhookBindingFile> : null
      if (json?.version !== 1 || typeof json.items !== 'object' || !json.items) return
      this.data = { version: 1, items: json.items as Record<string, WebhookBindingItem> }
    } catch {
      // ignore
    }
  }

  private save () {
    const tmp = `${this.filePath}.${Date.now()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    fs.renameSync(tmp, this.filePath)
  }

  getGroupWebhook (accountId: string, groupId: string): WebhookBindingItem | null {
    const key = this.makeKey(accountId, groupId)
    const item = this.data.items[key]
    if (!item?.webhook) return null
    return item
  }

  setGroupWebhook (accountId: string, groupId: string, webhook: string, secret?: string) {
    const key = this.makeKey(accountId, groupId)
    this.data.items[key] = {
      webhook: toStr(webhook).trim(),
      secret: toStr(secret).trim() || undefined,
      updatedAt: Date.now(),
    }
    this.save()
  }

  deleteGroupWebhook (accountId: string, groupId: string): boolean {
    const key = this.makeKey(accountId, groupId)
    if (!this.data.items[key]) return false
    delete this.data.items[key]
    this.save()
    return true
  }
}
