import type {
  ParsedTransmission,
  ParsedMessage,
  ParsedSegment,
  ParsedElement,
  ParsedSubElement,
  ValidationIssue,
  Span,
} from './types'

/**
 * Run all validation passes on a parsed transmission.
 * Populates the `issues` arrays on each node in-place.
 */
export function validate(transmission: ParsedTransmission): void {
  // Clear all previous issues
  clearIssues(transmission)

  // Value-level validation (format, length, code lists)
  for (const msg of transmission.messages) {
    for (const seg of msg.segments) {
      validateSegmentValues(seg)
    }
  }
  if (transmission.stx) validateSegmentValues(transmission.stx)
  if (transmission.end) validateSegmentValues(transmission.end)

  // Segment-level validation (mandatory elements, MTR counts)
  for (const msg of transmission.messages) {
    for (const seg of msg.segments) {
      validateSegmentStructure(seg, msg)
    }
  }

  // Document-level validation (message presence, order, cross-references)
  validateDocumentStructure(transmission)
}

// ─── Clear ──────────────────────────────────────────────────────────────────

function clearIssues(transmission: ParsedTransmission): void {
  transmission.issues = []
  if (transmission.stx) clearSegmentIssues(transmission.stx)
  if (transmission.end) clearSegmentIssues(transmission.end)
  for (const msg of transmission.messages) {
    msg.issues = []
    for (const seg of msg.segments) {
      clearSegmentIssues(seg)
    }
  }
}

function clearSegmentIssues(seg: ParsedSegment): void {
  seg.issues = []
  for (const el of seg.elements) {
    el.issues = []
    for (const sub of el.subElements) {
      sub.issues = []
    }
  }
}

// ─── Value-Level Validation ─────────────────────────────────────────────────

function validateSegmentValues(seg: ParsedSegment): void {
  for (const el of seg.elements) {
    for (const sub of el.subElements) {
      validateSubElementValue(sub)
    }
  }
}

function validateSubElementValue(sub: ParsedSubElement): void {
  if (!sub.def || sub.raw === '') return

  const { format, lengthType } = sub.def
  if (!format) return

  const notation = format.notation

  // Parse the format notation
  if (notation.startsWith('9(')) {
    validateNumericFormat(sub, notation)
  } else if (notation.startsWith('X(')) {
    validateAlphanumericFormat(sub, notation, lengthType)
  }
}

/**
 * Validate numeric fields.
 * Formats: 9(n), 9(n)V9(m) (implied decimal)
 */
function validateNumericFormat(sub: ParsedSubElement, notation: string): void {
  const value = sub.raw

  // Check it's all digits
  if (!/^\d+$/.test(value)) {
    sub.issues.push(issue('error', `Expected numeric value (format: ${notation}), got "${value}"`, sub.span))
    return
  }

  // Parse max length from notation
  const match = notation.match(/^9\((\d+)\)(?:V9\((\d+)\))?$/)
  if (!match) return

  const intDigits = parseInt(match[1]!, 10)
  const decDigits = match[2] ? parseInt(match[2], 10) : 0
  const maxLen = intDigits + decDigits

  if (sub.def?.lengthType === 'F' && value.length !== maxLen) {
    sub.issues.push(issue('error', `Fixed-length numeric field: expected exactly ${maxLen} digits (format: ${notation}), got ${value.length}`, sub.span))
  } else if (value.length > maxLen) {
    sub.issues.push(issue('error', `Numeric value too long: max ${maxLen} digits (format: ${notation}), got ${value.length}`, sub.span))
  }
}

/**
 * Validate alphanumeric fields.
 * Format: X(n)
 */
function validateAlphanumericFormat(sub: ParsedSubElement, notation: string, lengthType: string | null): void {
  const value = sub.raw
  const match = notation.match(/^(?:\(X\)|X\()(\d+)\)$/)
  // Try standard pattern
  const m = notation.match(/^X\((\d+)\)$/)
  if (!m) return

  const maxLen = parseInt(m[1]!, 10)

  if (lengthType === 'F' && value.length !== maxLen) {
    sub.issues.push(issue('error', `Fixed-length field: expected exactly ${maxLen} characters (format: ${notation}), got ${value.length}`, sub.span))
  } else if (value.length > maxLen) {
    sub.issues.push(issue('warning', `Value exceeds maximum length: max ${maxLen} characters (format: ${notation}), got ${value.length}`, sub.span))
  }

  // Suppress unused variable
  void match
}

// ─── Segment-Level Validation ───────────────────────────────────────────────

function validateSegmentStructure(seg: ParsedSegment, msg: ParsedMessage): void {
  if (!seg.def) {
    seg.issues.push(issue('warning', `Unknown segment tag "${seg.tag}" in message type ${msg.type}`, seg.span))
    return
  }

  // Check mandatory elements are present
  for (let i = 0; i < seg.def.elements.length; i++) {
    const elemDef = seg.def.elements[i]!
    if (elemDef.requirement !== 'M') continue

    const parsedElem = seg.elements[i]
    if (!parsedElem || isElementEmpty(parsedElem)) {
      seg.issues.push(issue('error', `Missing mandatory element ${elemDef.code} (${elemDef.name})`, seg.span))
    }
  }

  // Check mandatory sub-elements within present elements
  for (const el of seg.elements) {
    if (!el.def) continue
    for (let i = 0; i < el.def.subElements.length; i++) {
      const subDef = el.def.subElements[i]!
      if (subDef.requirement !== 'M') continue

      const parsedSub = el.subElements[i]
      if (!parsedSub || parsedSub.raw === '') {
        // Only flag if the element itself is not empty (element was provided but sub-element missing)
        if (!isElementEmpty(el)) {
          el.issues.push(issue('error', `Missing mandatory sub-element: ${subDef.name}`, el.span))
        }
      }
    }
  }

  // MTR-specific: validate segment count
  if (seg.tag === 'MTR') {
    validateMtrCount(seg, msg)
  }
}

function validateMtrCount(mtrSeg: ParsedSegment, msg: ParsedMessage): void {
  const countSub = mtrSeg.elements[0]?.subElements[0]
  if (!countSub || countSub.raw === '') return

  const declaredCount = parseInt(countSub.raw, 10)
  if (isNaN(declaredCount)) return

  const actualCount = msg.segments.length
  if (declaredCount !== actualCount) {
    countSub.issues.push(issue('error',
      `MTR segment count mismatch: declared ${declaredCount}, actual ${actualCount} segments in message`,
      countSub.span,
    ))
  }
}

// ─── Document-Level Validation ──────────────────────────────────────────────

function validateDocumentStructure(transmission: ParsedTransmission): void {
  const messages = transmission.messages

  // Check required message types present
  const types = messages.map(m => m.type)
  const hasInvfil = types.includes('INVFIL')
  const hasInvoic = types.includes('INVOIC')
  const hasVattlr = types.includes('VATTLR')
  const hasInvtlr = types.includes('INVTLR')

  const docSpan: Span = { start: 0, end: transmission.raw.length }

  if (!hasInvfil) {
    transmission.issues.push(issue('error', 'Missing required INVFIL (Invoice File Header) message', docSpan))
  }
  if (!hasInvoic) {
    transmission.issues.push(issue('error', 'Missing required INVOIC (Invoice Details) message – at least one invoice is required', docSpan))
  }
  if (!hasVattlr) {
    transmission.issues.push(issue('error', 'Missing required VATTLR (File VAT Trailer) message', docSpan))
  }
  if (!hasInvtlr) {
    transmission.issues.push(issue('error', 'Missing required INVTLR (Invoice File Trailer) message', docSpan))
  }

  // Check message ordering
  validateMessageOrder(messages, transmission)

  // Check MHD sequence numbers are consecutive
  validateMhdSequence(messages, transmission)

  // Check each INVOIC has at least one ILD
  for (const msg of messages) {
    if (msg.type === 'INVOIC') {
      validateInvoicContent(msg)
    }
  }

  // Cross-check TLR against STL segments
  for (const msg of messages) {
    if (msg.type === 'INVOIC') {
      validateTlrAgainstStl(msg)
    }
  }

  // Cross-check INVTLR/TOT against file
  validateFileTotals(transmission)

  // Check END message count
  validateEndCount(transmission)
}

function validateMessageOrder(messages: ParsedMessage[], transmission: ParsedTransmission): void {
  // Expected order: INVFIL, then INVOIC(s), then VATTLR, then INVTLR
  // (plus possible RSG/reconciliation messages at the end)
  const expectedOrder = ['INVFIL', 'INVOIC', 'VATTLR', 'INVTLR']
  let orderIdx = 0

  for (const msg of messages) {
    if (msg.type === 'UNKNOWN' || msg.type === 'RSGRSG') continue

    const expectedIdx = expectedOrder.indexOf(msg.type)
    if (expectedIdx === -1) continue

    if (expectedIdx < orderIdx && msg.type !== 'INVOIC') {
      transmission.issues.push(issue('warning',
        `Message ${msg.type} appears out of expected order (expected: INVFIL → INVOIC(s) → VATTLR → INVTLR)`,
        msg.span,
      ))
    }
    if (expectedIdx > orderIdx) {
      orderIdx = expectedIdx
    }
  }
}

function validateMhdSequence(messages: ParsedMessage[], transmission: ParsedTransmission): void {
  let expectedSeq = 1
  for (const msg of messages) {
    const mhd = msg.segments.find(s => s.tag === 'MHD')
    if (!mhd) continue

    const seqSub = mhd.elements[0]?.subElements[0]
    if (!seqSub || seqSub.raw === '') continue

    const actualSeq = parseInt(seqSub.raw, 10)
    if (isNaN(actualSeq)) continue

    if (actualSeq !== expectedSeq) {
      seqSub.issues.push(issue('error',
        `MHD sequence number should be ${expectedSeq}, got ${actualSeq}`,
        seqSub.span,
      ))
    }
    expectedSeq++
  }
}

function validateInvoicContent(msg: ParsedMessage): void {
  const hasIld = msg.segments.some(s => s.tag === 'ILD')
  if (!hasIld) {
    msg.issues.push(issue('error', 'INVOIC message must contain at least one ILD (Invoice Line Details) segment', msg.span))
  }

  const hasOdd = msg.segments.some(s => s.tag === 'ODD')
  if (!hasOdd) {
    msg.issues.push(issue('error', 'INVOIC message must contain at least one ODD (Order and Delivery References) segment', msg.span))
  }
}

function validateTlrAgainstStl(msg: ParsedMessage): void {
  const stlSegments = msg.segments.filter(s => s.tag === 'STL')
  const tlrSegment = msg.segments.find(s => s.tag === 'TLR')

  if (!tlrSegment || stlSegments.length === 0) return

  // TLR/NSTL should equal number of STL segments
  const nstlSub = tlrSegment.elements[0]?.subElements[0]
  if (nstlSub && nstlSub.raw !== '') {
    const declared = parseInt(nstlSub.raw, 10)
    if (!isNaN(declared) && declared !== stlSegments.length) {
      nstlSub.issues.push(issue('error',
        `TLR/NSTL declares ${declared} STL segments, but found ${stlSegments.length}`,
        nstlSub.span,
      ))
    }
  }

  // Cross-check LVLT = Σ LVLA
  validateTlrSum(tlrSegment, stlSegments, 1, 4, 'LVLT', 'LVLA')
  // Cross-check EVLT = Σ EVLA
  validateTlrSum(tlrSegment, stlSegments, 6, 9, 'EVLT', 'EVLA')
  // Cross-check TVAT = Σ VATA
  validateTlrSum(tlrSegment, stlSegments, 9, 12, 'TVAT', 'VATA')
  // Cross-check TPSI = Σ APSI
  validateTlrSum(tlrSegment, stlSegments, 11, 14, 'TPSI', 'APSI')
}

function validateTlrSum(
  tlr: ParsedSegment,
  stlSegments: ParsedSegment[],
  tlrElemIdx: number,
  stlElemIdx: number,
  tlrName: string,
  stlName: string,
): void {
  const tlrSub = tlr.elements[tlrElemIdx]?.subElements[0]
  if (!tlrSub || tlrSub.raw === '') return

  const tlrValue = parseInt(tlrSub.raw, 10)
  if (isNaN(tlrValue)) return

  let sum = 0
  for (const stl of stlSegments) {
    const stlSub = stl.elements[stlElemIdx]?.subElements[0]
    if (!stlSub || stlSub.raw === '') continue
    const val = parseInt(stlSub.raw, 10)
    if (!isNaN(val)) sum += val
  }

  if (tlrValue !== sum) {
    tlrSub.issues.push(issue('error',
      `${tlrName} value (${tlrValue}) does not equal sum of ${stlName} values (${sum})`,
      tlrSub.span,
    ))
  }
}

function validateFileTotals(transmission: ParsedTransmission): void {
  const invtlr = transmission.messages.find(m => m.type === 'INVTLR')
  if (!invtlr) return

  const totSeg = invtlr.segments.find(s => s.tag === 'TOT')
  if (!totSeg) return

  // FTNI should match number of INVOIC messages
  const ftniSub = totSeg.elements[5]?.subElements[0]
  if (ftniSub && ftniSub.raw !== '') {
    const declared = parseInt(ftniSub.raw, 10)
    const actualInvoicCount = transmission.messages.filter(m => m.type === 'INVOIC').length
    if (!isNaN(declared) && declared !== actualInvoicCount) {
      ftniSub.issues.push(issue('error',
        `TOT/FTNI declares ${declared} invoice messages, but file contains ${actualInvoicCount}`,
        ftniSub.span,
      ))
    }
  }

  // Cross-check FASE = Σ EVLT across all INVOIC TLR segments
  const invoicMessages = transmission.messages.filter(m => m.type === 'INVOIC')
  validateFileTotalSum(totSeg, invoicMessages, 0, 6, 'FASE', 'EVLT')
  // FVAT = Σ TVAT
  validateFileTotalSum(totSeg, invoicMessages, 2, 9, 'FVAT', 'TVAT')
  // FPSI = Σ TPSI
  validateFileTotalSum(totSeg, invoicMessages, 4, 11, 'FPSI', 'TPSI')
}

function validateFileTotalSum(
  totSeg: ParsedSegment,
  invoicMessages: ParsedMessage[],
  totElemIdx: number,
  tlrElemIdx: number,
  totName: string,
  tlrName: string,
): void {
  const totSub = totSeg.elements[totElemIdx]?.subElements[0]
  if (!totSub || totSub.raw === '') return

  const totValue = parseInt(totSub.raw, 10)
  if (isNaN(totValue)) return

  let sum = 0
  for (const msg of invoicMessages) {
    const tlr = msg.segments.find(s => s.tag === 'TLR')
    if (!tlr) continue
    const tlrSub = tlr.elements[tlrElemIdx]?.subElements[0]
    if (!tlrSub || tlrSub.raw === '') continue
    const val = parseInt(tlrSub.raw, 10)
    if (!isNaN(val)) sum += val
  }

  if (totValue !== sum) {
    totSub.issues.push(issue('error',
      `${totName} value (${totValue}) does not equal sum of ${tlrName} across invoices (${sum})`,
      totSub.span,
    ))
  }
}

function validateEndCount(transmission: ParsedTransmission): void {
  if (!transmission.end) return

  const countSub = transmission.end.elements[0]?.subElements[0]
  if (!countSub || countSub.raw === '') return

  const declared = parseInt(countSub.raw, 10)
  if (isNaN(declared)) return

  const actual = transmission.messages.length
  if (declared !== actual) {
    countSub.issues.push(issue('error',
      `END message count declares ${declared} messages, but transmission contains ${actual}`,
      countSub.span,
    ))
  }
}

// ─── Code List Validation ───────────────────────────────────────────────────

/**
 * Additional code-list-specific validation that goes beyond format checks.
 * Called as part of value validation but checks semantic constraints.
 */
export function validateCodeLists(transmission: ParsedTransmission): void {
  for (const msg of transmission.messages) {
    for (const seg of msg.segments) {
      validateSegmentCodeLists(seg, msg.type)
    }
  }
}

function validateSegmentCodeLists(seg: ParsedSegment, messageType: string): void {
  switch (seg.tag) {
    case 'TYP':
      validateTypCodes(seg)
      break
    case 'ILD':
      validateIldCodes(seg)
      break
    case 'STL':
    case 'VRS':
      validateVatcCode(seg)
      break
  }
  // Suppress unused
  void messageType
}

function validateTypCodes(seg: ParsedSegment): void {
  const tcdeSub = seg.elements[0]?.subElements[0]
  if (!tcdeSub || tcdeSub.raw === '') return

  const validCodes = ['0700', '0709']
  if (!validCodes.includes(tcdeSub.raw)) {
    tcdeSub.issues.push(issue('error',
      `Invalid transaction code "${tcdeSub.raw}". Valid BIC codes: 0700 (Original invoice), 0709 (Copy invoice)`,
      tcdeSub.span,
    ))
  }
}

function validateIldCodes(seg: ParsedSegment): void {
  // VATC (element index 9)
  const vatcSub = seg.elements[9]?.subElements[0]
  if (vatcSub && vatcSub.raw !== '') {
    const validVatc = ['S', 'Z', 'A', 'O', 'E', 'X', 'H', 'L']
    if (!validVatc.includes(vatcSub.raw)) {
      vatcSub.issues.push(issue('error',
        `Invalid VAT category code "${vatcSub.raw}". Valid: S (Standard), Z (Zero), A (Mixed), O (Outside scope)`,
        vatcSub.span,
      ))
    }
  }

  // MIXI (element index 11)
  const mixiSub = seg.elements[11]?.subElements[0]
  if (mixiSub && mixiSub.raw !== '') {
    const validMixi = ['0', '1', '2']
    if (!validMixi.includes(mixiSub.raw)) {
      mixiSub.issues.push(issue('error',
        `Invalid mixed-rate indicator "${mixiSub.raw}". Valid: 0 (whole product), 1 (zero-rated component), 2 (standard-rate component)`,
        mixiSub.span,
      ))
    }
  }

  // IGPI (element index 21)
  const igpiSub = seg.elements[21]?.subElements[0]
  if (igpiSub && igpiSub.raw !== '') {
    const validIgpi = ['I', 'G']
    if (!validIgpi.includes(igpiSub.raw)) {
      igpiSub.issues.push(issue('warning',
        `Unexpected IGPI code "${igpiSub.raw}". Expected: I (line-level charge) or G (invoice-level charge)`,
        igpiSub.span,
      ))
    }
  }

  // PIND = F means all monetary values should be zero (info-level, not enforced yet)
  const pindSub = seg.elements[20]?.subElements[0]
  if (pindSub && pindSub.raw === 'F') {
    // Just info for now
    pindSub.issues.push(issue('info',
      'Free item: all monetary values should be zero for this line',
      pindSub.span,
    ))
  }
}

function validateVatcCode(seg: ParsedSegment): void {
  // VATC is element index 1 in STL and VRS
  const vatcSub = seg.elements[1]?.subElements[0]
  if (!vatcSub || vatcSub.raw === '') return

  const validCodes = ['S', 'Z', 'O']
  if (!validCodes.includes(vatcSub.raw)) {
    vatcSub.issues.push(issue('error',
      `Invalid VAT category code "${vatcSub.raw}" in ${seg.tag}. Valid in trailers: S (Standard), Z (Zero-rated), O (Outside scope). Code A (mixed) should not appear in ${seg.tag}.`,
      vatcSub.span,
    ))
  }
}

// ─── Date Validation ────────────────────────────────────────────────────────

export function validateDates(transmission: ParsedTransmission): void {
  for (const msg of transmission.messages) {
    for (const seg of msg.segments) {
      validateSegmentDates(seg)
    }
  }
}

function validateSegmentDates(seg: ParsedSegment): void {
  for (const el of seg.elements) {
    for (const sub of el.subElements) {
      if (!sub.def || sub.raw === '') continue
      // Check if this is a date field by looking at the description or format
      if (sub.def.format?.notation === '9(6)' && isDateField(sub.def.name)) {
        validateDateValue(sub)
      }
    }
  }
}

function isDateField(name: string): boolean {
  const dateKeywords = ['date', 'Date', 'YYMMDD']
  return dateKeywords.some(kw => name.toLowerCase().includes(kw.toLowerCase()))
}

function validateDateValue(sub: ParsedSubElement): void {
  const value = sub.raw
  if (value.length !== 6) return // format validation will catch this

  const yy = parseInt(value.slice(0, 2), 10)
  const mm = parseInt(value.slice(2, 4), 10)
  const dd = parseInt(value.slice(4, 6), 10)

  if (mm < 1 || mm > 12) {
    sub.issues.push(issue('error', `Invalid month ${mm} in date "${value}" (format: YYMMDD)`, sub.span))
    return
  }

  if (dd < 1 || dd > 31) {
    sub.issues.push(issue('error', `Invalid day ${dd} in date "${value}" (format: YYMMDD)`, sub.span))
    return
  }

  // Basic month-day validation
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (dd > daysInMonth[mm - 1]!) {
    sub.issues.push(issue('error', `Invalid day ${dd} for month ${mm} in date "${value}"`, sub.span))
  }

  // Suppress unused
  void yy
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isElementEmpty(el: ParsedElement): boolean {
  return el.subElements.every(sub => sub.raw === '')
}

function issue(severity: ValidationIssue['severity'], message: string, span: Span): ValidationIssue {
  return { severity, message, span }
}
