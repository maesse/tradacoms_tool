import type { DataFormat, SubElementDef } from './types'

/**
 * Parse a TRADACOMS format notation into a human-readable description.
 * e.g. "9(7)V9(2)" → "Numeric: 7 digits, 2 decimal places"
 * e.g. "X(35)" → "Text: up to 35 characters"
 * e.g. "9(13)" → "Numeric: up to 13 digits"
 */
export function describeFormat(
  format: DataFormat | null,
  lengthType: 'F' | 'V' | null,
  def?: SubElementDef | null,
): string {
  if (!format) return ''
  const notation = format.notation

  // Check for date/time fields before generic numeric handling
  if (def && notation === '9(6)') {
    if (isDateSubElement(def)) return 'Date (YYMMDD)'
    if (isTimeSubElement(def)) return 'Time (HHMMSS)'
  }

  // 9(n)V9(m) - numeric with implied decimal
  const decimalMatch = notation.match(/^9\((\d+)\)V9\((\d+)\)$/)
  if (decimalMatch) {
    const intDigits = parseInt(decimalMatch[1]!)
    const decDigits = parseInt(decimalMatch[2]!)
    const total = intDigits + decDigits
    const lenDesc = lengthType === 'F' ? `exactly ${total} digits` : `up to ${total} digits`
    return `Number with ${decDigits} implied decimal place${decDigits > 1 ? 's' : ''} (${lenDesc})`
  }

  // 9(n) - integer/numeric
  const numMatch = notation.match(/^9\((\d+)\)$/)
  if (numMatch) {
    const digits = parseInt(numMatch[1]!)
    const lenDesc = lengthType === 'F' ? `exactly ${digits} digits` : `up to ${digits} digits`
    return `Whole number (${lenDesc})`
  }

  // X(n) - alphanumeric
  const alphaMatch = notation.match(/^X\((\d+)\)$/)
  if (alphaMatch) {
    const chars = parseInt(alphaMatch[1]!)
    const lenDesc = lengthType === 'F' ? `exactly ${chars} characters` : `up to ${chars} characters`
    return `Text (${lenDesc})`
  }

  return format.description || notation
}

/**
 * For a numeric field with implied decimal (format 9(n)V9(m)),
 * returns the number of decimal places. Returns 0 if not a decimal format.
 */
export function getImpliedDecimalPlaces(format: DataFormat | null): number {
  if (!format) return 0
  const match = format.notation.match(/^9\(\d+\)V9\((\d+)\)$/)
  return match ? parseInt(match[1]!) : 0
}

/**
 * Format a raw TRADACOMS numeric value with an implied decimal point for display.
 * e.g. "12345" with 2 decimal places → "123.45"
 * Returns null if the value isn't a pure numeric string.
 */
export function formatWithDecimal(raw: string, decimalPlaces: number): string | null {
  if (decimalPlaces === 0 || !raw) return null
  // Strip leading/trailing spaces, check it's all digits
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  if (trimmed.length <= decimalPlaces) {
    return '0.' + trimmed.padStart(decimalPlaces, '0')
  }
  const intPart = trimmed.slice(0, trimmed.length - decimalPlaces)
  const decPart = trimmed.slice(trimmed.length - decimalPlaces)
  return intPart + '.' + decPart
}

const DATE_KEYWORDS = ['date', 'yymmdd']
const TIME_KEYWORDS = ['time', 'hhmmss']

/**
 * Determine if a sub-element definition represents a date field (YYMMDD).
 */
export function isDateSubElement(def: SubElementDef | null): boolean {
  if (!def || def.format?.notation !== '9(6)') return false
  const lower = (def.name + ' ' + def.description).toLowerCase()
  return DATE_KEYWORDS.some((kw) => lower.includes(kw))
}

/**
 * Determine if a sub-element definition represents a time field (HHMMSS).
 */
export function isTimeSubElement(def: SubElementDef | null): boolean {
  if (!def || def.format?.notation !== '9(6)') return false
  const lower = (def.name + ' ' + def.description).toLowerCase()
  return TIME_KEYWORDS.some((kw) => lower.includes(kw))
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * Format a raw YYMMDD date string into a readable display.
 * e.g. "260506" → "06 May 2026"
 * Returns null if the value isn't a valid 6-digit date.
 */
export function formatDateDisplay(raw: string): string | null {
  if (!raw || raw.length !== 6 || !/^\d{6}$/.test(raw)) return null
  const yy = parseInt(raw.slice(0, 2), 10)
  const mm = parseInt(raw.slice(2, 4), 10)
  const dd = parseInt(raw.slice(4, 6), 10)
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  const year = yy >= 80 ? 1900 + yy : 2000 + yy
  return `${String(dd).padStart(2, '0')} ${MONTH_NAMES[mm - 1]} ${year}`
}

/**
 * Format a raw HHMMSS time string into a readable display.
 * e.g. "143052" → "14:30:52"
 * Returns null if the value isn't a valid 6-digit time.
 */
export function formatTimeDisplay(raw: string): string | null {
  if (!raw || raw.length !== 6 || !/^\d{6}$/.test(raw)) return null
  const hh = raw.slice(0, 2)
  const mi = raw.slice(2, 4)
  const ss = raw.slice(4, 6)
  if (parseInt(hh) > 23 || parseInt(mi) > 59 || parseInt(ss) > 59) return null
  return `${hh}:${mi}:${ss}`
}
