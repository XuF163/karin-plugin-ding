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

const normalizeMimeType = (value: unknown): string => {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  return raw.split(';', 1)[0]?.trim() || ''
}
const isGenericMimeType = (value: string): boolean => !value || value === 'application/octet-stream'

const extFromMimeType = (mimeType: string): string => {
  const mt = normalizeMimeType(mimeType)
  switch (mt) {
    case 'image/png':
      return '.png'
    case 'image/jpeg':
    case 'image/jpg':
    case 'image/pjpeg':
      return '.jpg'
    case 'image/gif':
      return '.gif'
    case 'image/webp':
      return '.webp'
    case 'image/bmp':
      return '.bmp'
    default:
      return ''
  }
}

const detectMimeTypeFromBuffer = (buffer: Buffer): string => {
  if (!(buffer instanceof Buffer)) return 'application/octet-stream'
  if (buffer.length >= 8) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47
      && buffer[4] === 0x0d
      && buffer[5] === 0x0a
      && buffer[6] === 0x1a
      && buffer[7] === 0x0a
    ) {
      return 'image/png'
    }
  }

  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  // GIF: GIF87a / GIF89a
  if (buffer.length >= 6) {
    const sig = buffer.toString('ascii', 0, 6)
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif'
  }

  // WEBP: RIFF....WEBP
  if (buffer.length >= 12) {
    const riff = buffer.toString('ascii', 0, 4)
    const webp = buffer.toString('ascii', 8, 12)
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp'
  }

  // BMP: BM
  if (buffer.length >= 2) {
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp'
  }

  return 'application/octet-stream'
}

const buildFileInfo = (params: { buffer: Buffer, name: string, mimeType?: string }): FileBufferInfo => {
  const buffer = params.buffer
  const nameHint = toStr(params.name).trim() || `file_${Date.now()}`

  const mimeHint = normalizeMimeType(params.mimeType)
  const detectedMime = normalizeMimeType(detectMimeTypeFromBuffer(buffer))
  const mimeFromName = normalizeMimeType(getMimeType(nameHint))

  const mimeType = !isGenericMimeType(mimeHint)
    ? mimeHint
    : !isGenericMimeType(detectedMime)
        ? detectedMime
        : !isGenericMimeType(mimeFromName)
            ? mimeFromName
            : 'application/octet-stream'

  const currentExt = path.extname(nameHint)
  if (currentExt) return { buffer, name: nameHint, mimeType }

  const ext = extFromMimeType(mimeType)
  const name = ext ? `${nameHint}${ext}` : nameHint
  return { buffer, name, mimeType }
}

export const fileToBuffer = async (file: string, fallbackName = `file_${Date.now()}`): Promise<FileBufferInfo> => {
  const input = toStr(file).trim()
  if (!input) throw new Error('empty file')

  if (input.startsWith('base64://')) {
    const b64 = input.slice('base64://'.length).replace(/\s+/g, '')
    const buffer = Buffer.from(b64, 'base64')
    return buildFileInfo({ buffer, name: fallbackName })
  }

  if (isDataUrl(input)) {
    const commaIndex = input.indexOf(',')
    if (commaIndex < 0) throw new Error('unsupported data url')
    const header = input.slice('data:'.length, commaIndex)
    const data = input.slice(commaIndex + 1).replace(/\s+/g, '')
    const parts = header.split(';').map((v) => v.trim()).filter(Boolean)
    const mimeType = parts[0] || 'application/octet-stream'
    const isBase64 = parts.includes('base64')
    if (!isBase64) throw new Error('unsupported data url (only base64 is supported)')
    const buffer = Buffer.from(data, 'base64')
    return buildFileInfo({ buffer, name: fallbackName, mimeType })
  }

  if (isHttpUrl(input)) {
    const res = await fetch(input)
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    const ab = await res.arrayBuffer()
    const buffer = Buffer.from(ab)
    const name = path.basename(new URL(input).pathname) || fallbackName
    const mimeType = res.headers.get('content-type') || getMimeType(name)
    return buildFileInfo({ buffer, name, mimeType })
  }

  // local file path
  const buffer = await fs.readFile(input)
  const name = path.basename(input) || fallbackName
  const mimeType = getMimeType(name)
  return buildFileInfo({ buffer, name, mimeType })
}
