import type { Span } from './types'

/**
 * TRADACOMS Tokenizer
 *
 * Handles the low-level syntax:
 * - Segments are terminated with ' (single quote)
 * - '=' separates the segment tag from the first data element
 * - '+' separates data elements
 * - ':' separates sub-elements within a data element
 *
 * This tokenizer splits raw text into segment tokens, then each segment
 * into element tokens and sub-element tokens, preserving source positions.
 */

export interface RawSegmentToken {
  /** The full raw text of the segment (excluding the terminator) */
  raw: string
  /** Segment tag (text before '=') */
  tag: string
  /** Position of the tag in the source */
  tagSpan: Span
  /** Position of the entire segment including terminator in the source */
  span: Span
  /** The raw body after '=' */
  body: string
  /** Offset of the body start in source */
  bodyStart: number
}

export interface RawElementToken {
  /** Raw text of this element */
  raw: string
  /** Span within source */
  span: Span
  /** The separator preceding this element ('=' for first, '+' for rest) */
  separator: '=' | '+'
}

export interface RawSubElementToken {
  /** Raw value text */
  raw: string
  /** Span within source */
  span: Span
}

/**
 * Split raw TRADACOMS text into segment tokens.
 * Handles the segment terminator (') and strips whitespace between segments.
 */
export function tokenizeSegments(source: string): RawSegmentToken[] {
  const segments: RawSegmentToken[] = []
  let pos = 0
  const len = source.length

  while (pos < len) {
    // Skip whitespace between segments (CR, LF, spaces, tabs)
    while (pos < len && isWhitespace(source[pos]!)) {
      pos++
    }
    if (pos >= len) break

    // Find the segment terminator
    const start = pos
    let end = source.indexOf("'", pos)
    if (end === -1) {
      // No terminator found — treat rest of input as a segment (malformed)
      end = len
    }

    const raw = source.slice(start, end)
    const span: Span = { start, end: end < len ? end + 1 : end } // Include terminator in span

    // Split tag from body at '='
    const eqIdx = raw.indexOf('=')
    let tag: string
    let body: string
    let bodyStart: number

    if (eqIdx === -1) {
      // Malformed segment — no '=' found
      tag = raw
      body = ''
      bodyStart = start + raw.length
    } else {
      tag = raw.slice(0, eqIdx)
      body = raw.slice(eqIdx + 1)
      bodyStart = start + eqIdx + 1
    }

    const tagSpan: Span = { start, end: start + tag.length }

    segments.push({ raw, tag, tagSpan, span, body, bodyStart })

    pos = end < len ? end + 1 : end
  }

  return segments
}

/**
 * Split a segment body into element tokens.
 * The first element is preceded by '=' (already consumed by segment split).
 * Subsequent elements are separated by '+'.
 */
export function tokenizeElements(body: string, bodyStartOffset: number): RawElementToken[] {
  if (body === '') return []

  const elements: RawElementToken[] = []
  let pos = 0
  let isFirst = true

  while (pos <= body.length) {
    const nextPlus = body.indexOf('+', pos)
    const end = nextPlus === -1 ? body.length : nextPlus

    const raw = body.slice(pos, end)
    const span: Span = {
      start: bodyStartOffset + pos,
      end: bodyStartOffset + end,
    }

    elements.push({
      raw,
      span,
      separator: isFirst ? '=' : '+',
    })

    isFirst = false
    if (nextPlus === -1) break
    pos = nextPlus + 1
  }

  return elements
}

/**
 * Split an element value into sub-element tokens by ':' separator.
 */
export function tokenizeSubElements(
  elementRaw: string,
  elementStartOffset: number,
): RawSubElementToken[] {
  if (elementRaw === '') {
    return [{ raw: '', span: { start: elementStartOffset, end: elementStartOffset } }]
  }

  const parts: RawSubElementToken[] = []
  let pos = 0

  while (pos <= elementRaw.length) {
    const nextColon = elementRaw.indexOf(':', pos)
    const end = nextColon === -1 ? elementRaw.length : nextColon

    const raw = elementRaw.slice(pos, end)
    const span: Span = {
      start: elementStartOffset + pos,
      end: elementStartOffset + end,
    }

    parts.push({ raw, span })

    if (nextColon === -1) break
    pos = nextColon + 1
  }

  return parts
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n'
}
