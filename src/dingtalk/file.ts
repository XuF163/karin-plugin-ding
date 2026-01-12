import fs from 'node:fs/promises'
import path from 'node:path'
import { getMimeType } from 'node-karin'
import { toStr } from './utils'

export interface FileBufferInfo {
  buffer: Buffer
  name: string
  mimeType: string
}

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value)
const isDataUrl = (value: string) => /^data:/i.test(value)

export const fileToBuffer = async (file: string, fallbackName = `file_${Date.now()}`): Promise<FileBufferInfo> => {
  const input = toStr(file).trim()
  if (!input) throw new Error('empty file')

  if (input.startsWith('base64://')) {
    const b64 = input.slice('base64://'.length)
    const buffer = Buffer.from(b64, 'base64')
    const name = fallbackName
    const mimeType = getMimeType(name)
    return { buffer, name, mimeType }
  }

  if (isDataUrl(input)) {
    const match = input.match(/^data:([^;,]+)?;base64,(.+)$/i)
    if (!match) throw new Error('unsupported data url')
    const mimeType = match[1] || 'application/octet-stream'
    const buffer = Buffer.from(match[2], 'base64')
    const name = fallbackName
    return { buffer, name, mimeType }
  }

  if (isHttpUrl(input)) {
    const res = await fetch(input)
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    const ab = await res.arrayBuffer()
    const buffer = Buffer.from(ab)
    const name = path.basename(new URL(input).pathname) || fallbackName
    const mimeType = res.headers.get('content-type') || getMimeType(name)
    return { buffer, name, mimeType }
  }

  // local file path
  const buffer = await fs.readFile(input)
  const name = path.basename(input) || fallbackName
  const mimeType = getMimeType(name)
  return { buffer, name, mimeType }
}
