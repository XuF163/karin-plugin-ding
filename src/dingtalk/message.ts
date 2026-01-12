import { segment, type Elements } from 'node-karin'
import { toStr } from './utils'

export const DOWNLOAD_CODE_PREFIX = 'dingtalk://downloadCode/'

export type DingTalkConversationScene = 'group' | 'friend'

export const toScene = (conversationType: unknown): DingTalkConversationScene => {
  return toStr(conversationType) === '2' ? 'group' : 'friend'
}

export type ParsedDingTalkSegment =
  | { type: 'text', text: string }
  | { type: 'image', file: string, downloadCode?: string, pictureDownloadCode?: string }
  | { type: 'file' | 'record' | 'video', file: string, name?: string, downloadCode?: string }

export const getMsgType = (data: any): string => {
  const candidates = [data?.msgtype, data?.msgType, data?.messageType, data?.message_type]
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

export const extractText = (data: any): string => {
  const t = data?.text?.content
  if (typeof t === 'string') return t.trim()

  const c = data?.content?.content
  if (typeof c === 'string') return c.trim()

  const rich =
    data?.content?.richText
    || data?.content?.rich_text
    || data?.richTextContent?.richText
    || data?.richTextContent?.rich_text
    || data?.richTextContent
    || data?.richText

  if (Array.isArray(rich)) {
    const parts: string[] = []
    for (const item of rich) {
      if (typeof item === 'string') parts.push(item)
      else if (item && typeof item === 'object') {
        if (typeof item.text === 'string') parts.push(item.text)
        else if (typeof item.content === 'string') parts.push(item.content)
        else if (typeof item.title === 'string') parts.push(item.title)
      }
    }
    const joined = parts.join('').trim()
    if (joined) return joined
  }

  return ''
}

export const parseMessageSegments = (data: any): ParsedDingTalkSegment[] => {
  const msgType = getMsgType(data).toLowerCase()
  const text = extractText(data)

  if (!msgType || msgType === 'text' || msgType === 'markdown') {
    return [{ type: 'text', text }]
  }

  const pickString = (obj: any, keys: string[]) => {
    for (const key of keys) {
      const v = obj?.[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return ''
  }

  if (msgType.includes('richtext') || msgType.includes('rich_text')) {
    const rich =
      data?.content?.richText
      || data?.content?.rich_text
      || data?.richTextContent?.richText
      || data?.richTextContent?.rich_text
      || data?.richText
      || []

    if (Array.isArray(rich)) {
      const segs: ParsedDingTalkSegment[] = []
      for (const item of rich) {
        if (!item) continue
        if (typeof item === 'string') {
          segs.push({ type: 'text', text: item })
          continue
        }
        if (typeof item === 'object') {
          const t = pickString(item, ['text', 'content', 'title'])
          if (t) segs.push({ type: 'text', text: t })

          const itemType = pickString(item, ['type']).toLowerCase()
          if (itemType === 'picture' || itemType === 'image') {
            const downloadCode = pickString(item, ['downloadCode', 'download_code'])
            const pictureDownloadCode = pickString(item, ['pictureDownloadCode', 'picture_download_code'])
            const code = downloadCode || pictureDownloadCode
            segs.push({
              type: 'image',
              file: code ? `${DOWNLOAD_CODE_PREFIX}${code}` : '',
              downloadCode: downloadCode || undefined,
              pictureDownloadCode: pictureDownloadCode || undefined,
            })
          }
        }
      }
      if (segs.length) return segs
    }

    return [{ type: 'text', text: text || '[richText]' }]
  }

  if (msgType.includes('image') || msgType.includes('picture')) {
    const fromContent = data?.content || data?.imageContent || data?.image || {}
    const downloadCode = pickString(fromContent, ['downloadCode', 'download_code'])
    const pictureDownloadCode = pickString(fromContent, ['pictureDownloadCode', 'picture_download_code'])
    const code = downloadCode || pictureDownloadCode
    return [{
      type: 'image',
      file: code ? `${DOWNLOAD_CODE_PREFIX}${code}` : '',
      downloadCode: downloadCode || undefined,
      pictureDownloadCode: pictureDownloadCode || undefined,
    }]
  }

  if (msgType.includes('file') || msgType.includes('voice') || msgType.includes('audio') || msgType.includes('video')) {
    const fromContent = data?.content || data?.fileContent || data?.voiceContent || data?.videoContent || {}
    const downloadCode = pickString(fromContent, ['downloadCode', 'download_code'])
    const name = pickString(fromContent, ['fileName', 'file_name', 'name'])

    let segType: ParsedDingTalkSegment['type'] = 'file'
    if (msgType.includes('voice') || msgType.includes('audio')) segType = 'record'
    if (msgType.includes('video')) segType = 'video'

    return [{
      type: segType,
      file: downloadCode ? `${DOWNLOAD_CODE_PREFIX}${downloadCode}` : '',
      name: name || undefined,
      downloadCode: downloadCode || undefined,
    }]
  }

  return [{ type: 'text', text: text ? `${msgType}: ${text}` : `[${msgType}]` }]
}

export const segmentsToElements = (segments: ParsedDingTalkSegment[]): Elements[] => {
  const out: Elements[] = []
  for (const seg of segments) {
    if (seg.type === 'text') {
      out.push(segment.text(seg.text))
      continue
    }
    if (seg.type === 'image') {
      out.push(segment.image(seg.file))
      continue
    }
    // 暂时降级：钉钉 file/record/video 统一按文本提示
    if (seg.type === 'file') out.push(segment.text(seg.name ? `[文件] ${seg.name}` : '[文件]'))
    if (seg.type === 'record') out.push(segment.text('[语音]'))
    if (seg.type === 'video') out.push(segment.text('[视频]'))
  }
  return out
}
