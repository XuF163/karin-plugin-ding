export const toStr = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  return String(value)
}

export const redact = (value: unknown): string => {
  const str = toStr(value)
  if (!str) return ''
  if (str.length <= 8) return '***'
  return `${str.slice(0, 3)}***${str.slice(-3)}`
}

export const safeJsonParse = <T = any>(raw: string): { ok: true, value: T } | { ok: false, error: Error } => {
  try {
    return { ok: true, value: JSON.parse(raw) as T }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error : new Error(toStr(error)) }
  }
}

export const uniq = <T>(arr: T[]): T[] => Array.from(new Set(arr))
