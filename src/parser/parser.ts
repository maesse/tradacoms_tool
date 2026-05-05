import type {
  ParsedTransmission,
  ParsedMessage,
  ParsedSegment,
  ParsedElement,
  ParsedSubElement,
  SegmentDef,
  ElementDef,
  Span,
} from './types'
import { tokenizeSegments, tokenizeElements, tokenizeSubElements } from './tokenizer'
import { getMessageDef, getSegmentDefStandalone, stxSegmentDef, endSegmentDef } from './schema'
import { validate, validateCodeLists, validateDates } from './validation'

/**
 * Parse a complete TRADACOMS INVFIL document.
 *
 * Strategy:
 * 1. Tokenize into raw segments
 * 2. Identify message boundaries via MHD/MTR pairs
 * 3. Look up schema definitions for each segment/element
 * 4. Build the structured tree with spans for UI use
 * 5. Run validation passes
 */
export function parseDocument(source: string): ParsedTransmission {
  const rawSegments = tokenizeSegments(source)

  const result: ParsedTransmission = {
    stx: null,
    messages: [],
    end: null,
    raw: source,
    issues: [],
  }

  let i = 0

  // Handle STX if present
  if (rawSegments.length > 0 && rawSegments[0]!.tag === 'STX') {
    result.stx = parseSegment(rawSegments[0]!, stxSegmentDef)
    i = 1
  }

  // Process messages (MHD ... MTR groups)
  while (i < rawSegments.length) {
    const seg = rawSegments[i]!

    // END segment
    if (seg.tag === 'END') {
      result.end = parseSegment(seg, endSegmentDef)
      i++
      continue
    }

    // RSG / reconciliation messages — parse as standalone
    if (seg.tag === 'MHD') {
      // Collect segments until MTR
      const messageSegments: typeof rawSegments = []
      const mhdRaw = seg

      // Determine message type from MHD body (second element = type:version)
      const messageType = extractMessageType(mhdRaw.body)

      let j = i
      while (j < rawSegments.length) {
        messageSegments.push(rawSegments[j]!)
        if (rawSegments[j]!.tag === 'MTR') {
          j++
          break
        }
        j++
      }

      const msgDef = getMessageDef(messageType)
      const parsedMsg = parseMessage(messageType, messageSegments, msgDef)
      result.messages.push(parsedMsg)
      i = j
    } else {
      // Unexpected segment outside a message — treat as orphan in a synthetic message
      const parsedSeg = parseSegment(seg, getSegmentDefStandalone(seg.tag))
      const orphanMsg: ParsedMessage = {
        type: 'UNKNOWN',
        label: `Orphan segment: ${seg.tag}`,
        segments: [parsedSeg],
        span: seg.span,
        def: null,
        issues: [],
      }
      result.messages.push(orphanMsg)
      i++
    }
  }

  // Run validation passes
  validate(result)
  validateCodeLists(result)
  validateDates(result)

  return result
}

function parseMessage(
  type: string,
  rawSegments: ReturnType<typeof tokenizeSegments>,
  msgDef: ReturnType<typeof getMessageDef>,
): ParsedMessage {
  const segments = rawSegments.map(rawSeg => {
    const segDef = msgDef
      ? msgDef.segments.find(s => s.tag === rawSeg.tag) ?? getSegmentDefStandalone(rawSeg.tag)
      : getSegmentDefStandalone(rawSeg.tag)
    return parseSegment(rawSeg, segDef)
  })

  const firstSpan = rawSegments[0]?.span ?? { start: 0, end: 0 }
  const lastSpan = rawSegments[rawSegments.length - 1]?.span ?? firstSpan

  return {
    type,
    label: msgDef?.name ?? type,
    segments,
    span: { start: firstSpan.start, end: lastSpan.end },
    def: msgDef,
    issues: [],
  }
}

function parseSegment(
  rawSeg: ReturnType<typeof tokenizeSegments>[number],
  segDef: SegmentDef | null,
): ParsedSegment {
  const rawElements = tokenizeElements(rawSeg.body, rawSeg.bodyStart)

  const elements: ParsedElement[] = rawElements.map((rawElem, idx) => {
    // Match element to schema definition by index
    const elemDef = segDef?.elements[idx] ?? null
    return parseElement(rawElem, idx, elemDef)
  })

  return {
    tag: rawSeg.tag,
    raw: rawSeg.raw,
    span: rawSeg.span,
    elements,
    def: segDef,
    issues: [],
  }
}

function parseElement(
  rawElem: ReturnType<typeof tokenizeElements>[number],
  index: number,
  elemDef: ElementDef | null,
): ParsedElement {
  const rawSubs = tokenizeSubElements(rawElem.raw, rawElem.span.start)

  const subElements: ParsedSubElement[] = rawSubs.map((rawSub, subIdx) => {
    const subDef = elemDef?.subElements[subIdx] ?? null
    return {
      index: subIdx,
      raw: rawSub.raw,
      span: rawSub.span,
      def: subDef,
      issues: [],
    }
  })

  return {
    index,
    separator: rawElem.separator,
    raw: rawElem.raw,
    span: rawElem.span,
    subElements,
    def: elemDef,
    issues: [],
  }
}

/**
 * Extract message type from MHD body.
 * MHD body format: "<msrf>+<type>:<version>"
 * e.g., "1+INVFIL:9" → "INVFIL"
 */
function extractMessageType(body: string): string {
  // Split by '+' to get elements, take second element, split by ':' for type
  const elements = body.split('+')
  if (elements.length < 2) return 'UNKNOWN'
  const typeElement = elements[1]!
  const colonIdx = typeElement.indexOf(':')
  if (colonIdx === -1) return typeElement
  return typeElement.slice(0, colonIdx)
}

// ─── Utility: get span text from source ─────────────────────────────────────

export function getSpanText(source: string, span: Span): string {
  return source.slice(span.start, span.end)
}
