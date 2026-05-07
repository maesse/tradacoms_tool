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
    sub.issues.push(
      issue('error', `Expected numeric value (format: ${notation}), got "${value}"`, sub.span),
    )
    return
  }

  // Parse max length from notation
  const match = notation.match(/^9\((\d+)\)(?:V9\((\d+)\))?$/)
  if (!match) return

  const intDigits = parseInt(match[1]!, 10)
  const decDigits = match[2] ? parseInt(match[2], 10) : 0
  const maxLen = intDigits + decDigits

  if (sub.def?.lengthType === 'F' && value.length !== maxLen) {
    sub.issues.push(
      issue(
        'error',
        `Fixed-length numeric field: expected exactly ${maxLen} digits (format: ${notation}), got ${value.length}`,
        sub.span,
      ),
    )
  } else if (value.length > maxLen) {
    sub.issues.push(
      issue(
        'error',
        `Numeric value too long: max ${maxLen} digits (format: ${notation}), got ${value.length}`,
        sub.span,
      ),
    )
  }
}

/**
 * Validate alphanumeric fields.
 * Format: X(n)
 */
function validateAlphanumericFormat(
  sub: ParsedSubElement,
  notation: string,
  lengthType: string | null,
): void {
  const value = sub.raw
  const match = notation.match(/^(?:\(X\)|X\()(\d+)\)$/)
  // Try standard pattern
  const m = notation.match(/^X\((\d+)\)$/)
  if (!m) return

  const maxLen = parseInt(m[1]!, 10)

  if (lengthType === 'F' && value.length !== maxLen) {
    sub.issues.push(
      issue(
        'error',
        `Fixed-length field: expected exactly ${maxLen} characters (format: ${notation}), got ${value.length}`,
        sub.span,
      ),
    )
  } else if (value.length > maxLen) {
    sub.issues.push(
      issue(
        'warning',
        `Value exceeds maximum length: max ${maxLen} characters (format: ${notation}), got ${value.length}`,
        sub.span,
      ),
    )
  }

  // Suppress unused variable
  void match
}

// ─── Segment-Level Validation ───────────────────────────────────────────────

function validateSegmentStructure(seg: ParsedSegment, msg: ParsedMessage): void {
  if (!seg.def) {
    seg.issues.push(
      issue('warning', `Unknown segment tag "${seg.tag}" in message type ${msg.type}`, seg.span),
    )
    return
  }

  // Check mandatory elements are present
  for (let i = 0; i < seg.def.elements.length; i++) {
    const elemDef = seg.def.elements[i]!
    if (elemDef.requirement !== 'M') continue

    const parsedElem = seg.elements[i]
    if (!parsedElem || isElementEmpty(parsedElem)) {
      seg.issues.push(
        issue('error', `Missing mandatory element ${elemDef.code} (${elemDef.name})`, seg.span),
      )
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
    countSub.issues.push(
      issue(
        'error',
        `MTR segment count mismatch: declared ${declaredCount}, actual ${actualCount} segments in message`,
        countSub.span,
      ),
    )
  }
}

// ─── Document-Level Validation ──────────────────────────────────────────────

/**
 * Detect whether the file is an invoice file or a credit note file based on message types present.
 * Returns 'invoice' | 'credit' | 'unknown'.
 */
function detectFileType(messages: ParsedMessage[]): 'invoice' | 'credit' | 'unknown' {
  const types = new Set(messages.map((m) => m.type))
  if (types.has('INVFIL') || types.has('INVOIC') || types.has('INVTLR')) return 'invoice'
  if (types.has('CREHDR') || types.has('CREDIT') || types.has('CRETLR')) return 'credit'
  return 'unknown'
}

function validateDocumentStructure(transmission: ParsedTransmission): void {
  const messages = transmission.messages
  const fileType = detectFileType(messages)

  const types = messages.map((m) => m.type)
  const docSpan: Span = { start: 0, end: transmission.raw.length }

  if (fileType === 'credit') {
    // Credit note file validation
    const hasCrehdr = types.includes('CREHDR')
    const hasCredit = types.includes('CREDIT')
    const hasVattlr = types.includes('VATTLR')
    const hasCretlr = types.includes('CRETLR')

    if (!hasCrehdr) {
      transmission.issues.push(
        issue('error', 'Missing required CREHDR (Credit Note File Header) message', docSpan),
      )
    }
    if (!hasCredit) {
      transmission.issues.push(
        issue(
          'error',
          'Missing required CREDIT (Credit Note Details) message – at least one credit note is required',
          docSpan,
        ),
      )
    }
    if (!hasVattlr) {
      transmission.issues.push(
        issue('error', 'Missing required VATTLR (File VAT Trailer) message', docSpan),
      )
    }
    if (!hasCretlr) {
      transmission.issues.push(
        issue('error', 'Missing required CRETLR (Credit Note File Trailer) message', docSpan),
      )
    }

    // Check message ordering
    validateMessageOrder(messages, transmission, 'credit')

    // Check MHD sequence numbers
    validateMhdSequence(messages, transmission)

    // Check each CREDIT has at least one CLD
    for (const msg of messages) {
      if (msg.type === 'CREDIT') {
        validateCreditContent(msg)
      }
    }

    // Cross-check CTR against CST segments
    for (const msg of messages) {
      if (msg.type === 'CREDIT') {
        validateCtrAgainstCst(msg)
        validateCstVatCoverage(msg)
      }
    }

    // Cross-check VRS against file-wide VAT codes (from CST segments)
    validateVrsCoverage(transmission)

    // Cross-check CRETLR/TOT against file
    validateFileTotals(transmission)
  } else {
    // Invoice file validation (default)
    const hasInvfil = types.includes('INVFIL')
    const hasInvoic = types.includes('INVOIC')
    const hasVattlr = types.includes('VATTLR')
    const hasInvtlr = types.includes('INVTLR')

    if (!hasInvfil) {
      transmission.issues.push(
        issue('error', 'Missing required INVFIL (Invoice File Header) message', docSpan),
      )
    }
    if (!hasInvoic) {
      transmission.issues.push(
        issue(
          'error',
          'Missing required INVOIC (Invoice Details) message – at least one invoice is required',
          docSpan,
        ),
      )
    }
    if (!hasVattlr) {
      transmission.issues.push(
        issue('error', 'Missing required VATTLR (File VAT Trailer) message', docSpan),
      )
    }
    if (!hasInvtlr) {
      transmission.issues.push(
        issue('error', 'Missing required INVTLR (Invoice File Trailer) message', docSpan),
      )
    }

    // Check message ordering
    validateMessageOrder(messages, transmission, 'invoice')

    // Check MHD sequence numbers
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
        validateStlVatCoverage(msg)
      }
    }

    // Cross-check VRS against file-wide VAT codes
    validateVrsCoverage(transmission)

    // Cross-check INVTLR/TOT against file
    validateFileTotals(transmission)
  }

  // Check END message count (common to both)
  validateEndCount(transmission)
}

function validateMessageOrder(
  messages: ParsedMessage[],
  transmission: ParsedTransmission,
  fileType: 'invoice' | 'credit',
): void {
  const expectedOrder =
    fileType === 'credit'
      ? ['CREHDR', 'CREDIT', 'VATTLR', 'CRETLR']
      : ['INVFIL', 'INVOIC', 'VATTLR', 'INVTLR']
  const repeatableType = fileType === 'credit' ? 'CREDIT' : 'INVOIC'
  const orderLabel = expectedOrder.join(' → ')

  let orderIdx = 0

  for (const msg of messages) {
    if (msg.type === 'UNKNOWN' || msg.type === 'RSGRSG') continue

    const expectedIdx = expectedOrder.indexOf(msg.type)
    if (expectedIdx === -1) continue

    if (expectedIdx < orderIdx && msg.type !== repeatableType) {
      transmission.issues.push(
        issue(
          'warning',
          `Message ${msg.type} appears out of expected order (expected: ${orderLabel})`,
          msg.span,
        ),
      )
    }
    if (expectedIdx > orderIdx) {
      orderIdx = expectedIdx
    }
  }
}

function validateMhdSequence(messages: ParsedMessage[], transmission: ParsedTransmission): void {
  let expectedSeq = 1
  for (const msg of messages) {
    const mhd = msg.segments.find((s) => s.tag === 'MHD')
    if (!mhd) continue

    const seqSub = mhd.elements[0]?.subElements[0]
    if (!seqSub || seqSub.raw === '') continue

    const actualSeq = parseInt(seqSub.raw, 10)
    if (isNaN(actualSeq)) continue

    if (actualSeq !== expectedSeq) {
      seqSub.issues.push(
        issue(
          'error',
          `MHD sequence number should be ${expectedSeq}, got ${actualSeq}`,
          seqSub.span,
        ),
      )
    }
    expectedSeq++
  }
}

function validateInvoicContent(msg: ParsedMessage): void {
  const hasIld = msg.segments.some((s) => s.tag === 'ILD')
  if (!hasIld) {
    msg.issues.push(
      issue(
        'error',
        'INVOIC message must contain at least one ILD (Invoice Line Details) segment',
        msg.span,
      ),
    )
  }

  const hasOdd = msg.segments.some((s) => s.tag === 'ODD')
  if (!hasOdd) {
    msg.issues.push(
      issue(
        'error',
        'INVOIC message must contain at least one ODD (Order and Delivery References) segment',
        msg.span,
      ),
    )
  }
}

function validateCreditContent(msg: ParsedMessage): void {
  const hasCld = msg.segments.some((s) => s.tag === 'CLD')
  if (!hasCld) {
    msg.issues.push(
      issue(
        'error',
        'CREDIT message must contain at least one CLD (Credit Note Line Details) segment',
        msg.span,
      ),
    )
  }
}

function validateCtrAgainstCst(msg: ParsedMessage): void {
  const cstSegments = msg.segments.filter((s) => s.tag === 'CST')
  const ctrSegment = msg.segments.find((s) => s.tag === 'CTR')

  if (!ctrSegment || cstSegments.length === 0) return

  // CTR/NCST should equal number of CST segments
  const ncstSub = ctrSegment.elements[0]?.subElements[0]
  if (ncstSub && ncstSub.raw !== '') {
    const declared = parseInt(ncstSub.raw, 10)
    if (!isNaN(declared) && declared !== cstSegments.length) {
      ncstSub.issues.push(
        issue(
          'error',
          `CTR/NCST declares ${declared} CST segments, but found ${cstSegments.length}`,
          ncstSub.span,
        ),
      )
    }
  }

  // Cross-check CTR fields against CST sums
  // CST element indices: LVLA(4), EVLA(7), VATA(10), APSI(12)
  // CTR element indices: LVLT(1), EVLT(4), TVAT(7), TPSI(9)
  validateTlrSum(ctrSegment, cstSegments, 1, 4, 'LVLT', 'LVLA')
  validateTlrSum(ctrSegment, cstSegments, 4, 7, 'EVLT', 'EVLA')
  validateTlrSum(ctrSegment, cstSegments, 7, 10, 'TVAT', 'VATA')
  validateTlrSum(ctrSegment, cstSegments, 9, 12, 'TPSI', 'APSI')
}

/**
 * Validate that within a CREDIT message:
 * - The number of CST segments matches the number of distinct real VAT codes in CLD lines
 * - Each CST/NRIL matches the count of CLD lines with that VAT code
 */
function validateCstVatCoverage(msg: ParsedMessage): void {
  const cldSegments = msg.segments.filter((s) => s.tag === 'CLD')
  const cstSegments = msg.segments.filter((s) => s.tag === 'CST')

  if (cldSegments.length === 0 || cstSegments.length === 0) return

  // Gather ILD-equivalent VAT codes from CLD (VATC is element index 8)
  const vatCodeCounts = new Map<string, number>()
  for (const cld of cldSegments) {
    const vatcSub = cld.elements[8]?.subElements[0]
    if (!vatcSub || vatcSub.raw === '') continue
    const code = vatcSub.raw
    // Mixed-rate items have real VAT codes on their component lines
    if (code === 'A') continue // 'A' itself doesn't get a CST entry
    vatCodeCounts.set(code, (vatCodeCounts.get(code) ?? 0) + 1)
  }

  // Also count mixed-rate components (MIXI=1 or MIXI=2)
  for (const cld of cldSegments) {
    const mixiSub = cld.elements[11]?.subElements[0]
    if (mixiSub && (mixiSub.raw === '1' || mixiSub.raw === '2')) {
      const vatcSub = cld.elements[8]?.subElements[0]
      if (vatcSub && vatcSub.raw !== '' && vatcSub.raw !== 'A') {
        // Already counted above, mixed components use their real VAT code
      }
    }
  }

  // Check CST count matches distinct VAT codes
  if (cstSegments.length !== vatCodeCounts.size && vatCodeCounts.size > 0) {
    msg.issues.push(
      issue(
        'warning',
        `CREDIT has ${cstSegments.length} CST segment(s) but CLD lines contain ${vatCodeCounts.size} distinct real VAT code(s)`,
        msg.span,
      ),
    )
  }

  // Check each CST/NRIL matches count of CLD lines with that VAT code
  for (const cst of cstSegments) {
    const cstVatcSub = cst.elements[1]?.subElements[0]
    if (!cstVatcSub || cstVatcSub.raw === '') continue

    const nrilSub = cst.elements[3]?.subElements[0]
    if (!nrilSub || nrilSub.raw === '') continue

    const declared = parseInt(nrilSub.raw, 10)
    if (isNaN(declared)) continue

    const expected = vatCodeCounts.get(cstVatcSub.raw) ?? 0
    if (declared !== expected) {
      nrilSub.issues.push(
        issue(
          'error',
          `CST/NRIL declares ${declared} CLD lines for VAT code '${cstVatcSub.raw}', but found ${expected}`,
          nrilSub.span,
        ),
      )
    }
  }
}

function validateTlrAgainstStl(msg: ParsedMessage): void {
  const stlSegments = msg.segments.filter((s) => s.tag === 'STL')
  const tlrSegment = msg.segments.find((s) => s.tag === 'TLR')

  if (!tlrSegment || stlSegments.length === 0) return

  // TLR/NSTL should equal number of STL segments
  const nstlSub = tlrSegment.elements[0]?.subElements[0]
  if (nstlSub && nstlSub.raw !== '') {
    const declared = parseInt(nstlSub.raw, 10)
    if (!isNaN(declared) && declared !== stlSegments.length) {
      nstlSub.issues.push(
        issue(
          'error',
          `TLR/NSTL declares ${declared} STL segments, but found ${stlSegments.length}`,
          nstlSub.span,
        ),
      )
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
    tlrSub.issues.push(
      issue(
        'error',
        `${tlrName} value (${tlrValue}) does not equal sum of ${stlName} values (${sum})`,
        tlrSub.span,
      ),
    )
  }
}

/**
 * Validate that within an INVOIC message:
 * - The number of STL segments matches the number of distinct real VAT codes in ILD lines
 * - Each STL/NRIL matches the count of ILD lines with that VAT code
 */
function validateStlVatCoverage(msg: ParsedMessage): void {
  const ildSegments = msg.segments.filter((s) => s.tag === 'ILD')
  const stlSegments = msg.segments.filter((s) => s.tag === 'STL')

  if (ildSegments.length === 0 || stlSegments.length === 0) return

  // Count ILD lines per real VAT code (A=mixed is resolved into components, but still counted)
  const ildVatCounts = new Map<string, number>()
  for (const ild of ildSegments) {
    const vatcSub = ild.elements[9]?.subElements[0]
    if (!vatcSub || vatcSub.raw === '') continue
    const code = vatcSub.raw
    // 'A' (mixed) lines contribute to the real rate components, but they're also counted
    // in the STL NRIL for the component rates. Skip 'A' for the distinct count check.
    if (code === 'A') continue
    ildVatCounts.set(code, (ildVatCounts.get(code) ?? 0) + 1)
  }

  // Check STL count matches distinct real VAT codes
  const distinctRealCodes = ildVatCounts.size
  if (distinctRealCodes > 0 && stlSegments.length !== distinctRealCodes) {
    const tlr = msg.segments.find((s) => s.tag === 'TLR')
    if (tlr) {
      tlr.issues.push(
        issue(
          'warning',
          `Found ${stlSegments.length} STL segment(s) but ${distinctRealCodes} distinct VAT code(s) in ILD lines (${[...ildVatCounts.keys()].join(', ')})`,
          tlr.span,
        ),
      )
    }
  }

  // Validate each STL/NRIL matches line count for its VAT code
  for (const stl of stlSegments) {
    const stlVatcSub = stl.elements[1]?.subElements[0]
    const nrilSub = stl.elements[3]?.subElements[0]
    if (!stlVatcSub || stlVatcSub.raw === '' || !nrilSub || nrilSub.raw === '') continue

    const vatCode = stlVatcSub.raw
    const declaredCount = parseInt(nrilSub.raw, 10)
    if (isNaN(declaredCount)) continue

    // Count ILD lines with this VAT code (including mixed-rate component lines)
    const actualCount = ildVatCounts.get(vatCode) ?? 0

    // Also count mixed-rate 'A' lines that have MIXI=2 for S, MIXI=1 for Z
    // (mixed-rate items generate component ILD lines with the real code,
    // so they're already counted above; the 'A' parent line is not counted)
    // Actually per spec, mixed-rate items produce 3 ILD lines: MIXI=0 (A), MIXI=1 (Z), MIXI=2 (S)
    // The component lines (MIXI=1, MIXI=2) already have the real VAT code, not A
    // So our count from above should already be correct.

    if (declaredCount !== actualCount) {
      nrilSub.issues.push(
        issue(
          'error',
          `STL/NRIL declares ${declaredCount} line(s) for VAT code '${vatCode}', but found ${actualCount} ILD line(s) with that code`,
          nrilSub.span,
        ),
      )
    }
  }
}

/**
 * Validate that the VATTLR message has VRS segments matching the distinct
 * real VAT codes found across all INVOIC or CREDIT messages in the file.
 */
function validateVrsCoverage(transmission: ParsedTransmission): void {
  const vattlr = transmission.messages.find((m) => m.type === 'VATTLR')
  if (!vattlr) return

  const vrsSegments = vattlr.segments.filter((s) => s.tag === 'VRS')
  const fileType = detectFileType(transmission.messages)

  // Collect all distinct real VAT codes from STL (invoices) or CST (credit notes)
  const fileVatCodes = new Set<string>()
  const subTrailerTag = fileType === 'credit' ? 'CST' : 'STL'
  const detailMsgType = fileType === 'credit' ? 'CREDIT' : 'INVOIC'
  const detailMessages = transmission.messages.filter((m) => m.type === detailMsgType)

  for (const msg of detailMessages) {
    for (const seg of msg.segments) {
      if (seg.tag === subTrailerTag) {
        const vatcSub = seg.elements[1]?.subElements[0]
        if (vatcSub && vatcSub.raw !== '') {
          fileVatCodes.add(vatcSub.raw)
        }
      }
    }
  }

  if (fileVatCodes.size === 0) return

  // Check VRS count matches distinct VAT codes
  if (vrsSegments.length !== fileVatCodes.size) {
    vattlr.issues.push(
      issue(
        'error',
        `VATTLR has ${vrsSegments.length} VRS segment(s) but file contains ${fileVatCodes.size} distinct VAT code(s) (${[...fileVatCodes].join(', ')})`,
        vattlr.span,
      ),
    )
  }

  // Check each VRS has a VAT code that exists in the file
  for (const vrs of vrsSegments) {
    const vrsVatcSub = vrs.elements[1]?.subElements[0]
    if (!vrsVatcSub || vrsVatcSub.raw === '') continue

    if (!fileVatCodes.has(vrsVatcSub.raw)) {
      vrsVatcSub.issues.push(
        issue(
          'warning',
          `VRS VAT code '${vrsVatcSub.raw}' does not appear in any ${subTrailerTag} segment in the file`,
          vrsVatcSub.span,
        ),
      )
    }
  }

  // Check all file VAT codes are covered by a VRS segment
  const vrsCodes = new Set(
    vrsSegments
      .map((v) => v.elements[1]?.subElements[0]?.raw)
      .filter((c): c is string => c !== undefined && c !== ''),
  )
  for (const code of fileVatCodes) {
    if (!vrsCodes.has(code)) {
      vattlr.issues.push(
        issue(
          'error',
          `Missing VRS segment for VAT code '${code}' which appears in ${subTrailerTag} segments`,
          vattlr.span,
        ),
      )
    }
  }

  // Cross-check VRS values against sums of sub-trailer fields per VAT code
  // For invoices: STL fields EVLA(9), ASDA(11), VATA(12), APSE(13), APSI(14)
  // For credits: CST fields EVLA(7), ASDA(9), VATA(10), APSE(11), APSI(12)
  const evlaIdx = fileType === 'credit' ? 7 : 9
  const asdaIdx = fileType === 'credit' ? 9 : 11
  const vataIdx = fileType === 'credit' ? 10 : 12
  const apseIdx = fileType === 'credit' ? 11 : 13
  const apsiIdx = fileType === 'credit' ? 12 : 14

  const subTrailerSums = new Map<
    string,
    { evla: number; asda: number; vata: number; apse: number; apsi: number }
  >()
  for (const msg of detailMessages) {
    for (const seg of msg.segments) {
      if (seg.tag !== subTrailerTag) continue
      const vatcRaw = seg.elements[1]?.subElements[0]?.raw
      if (!vatcRaw || vatcRaw === '') continue
      const sums = subTrailerSums.get(vatcRaw) ?? { evla: 0, asda: 0, vata: 0, apse: 0, apsi: 0 }
      const evla = parseInt(seg.elements[evlaIdx]?.subElements[0]?.raw ?? '', 10)
      const asda = parseInt(seg.elements[asdaIdx]?.subElements[0]?.raw ?? '', 10)
      const vata = parseInt(seg.elements[vataIdx]?.subElements[0]?.raw ?? '', 10)
      const apse = parseInt(seg.elements[apseIdx]?.subElements[0]?.raw ?? '', 10)
      const apsi = parseInt(seg.elements[apsiIdx]?.subElements[0]?.raw ?? '', 10)
      if (!isNaN(evla)) sums.evla += evla
      if (!isNaN(asda)) sums.asda += asda
      if (!isNaN(vata)) sums.vata += vata
      if (!isNaN(apse)) sums.apse += apse
      if (!isNaN(apsi)) sums.apsi += apsi
      subTrailerSums.set(vatcRaw, sums)
    }
  }

  // Validate each VRS segment's values
  // VRS fields: SEQA(0), VATC(1), VATP(2), VSDE(3), VSDI(4), VVAT(5), VPSE(6), VPSI(7)
  const vrsChecks: Array<{
    vrsIdx: number
    vrsName: string
    stlField: 'evla' | 'asda' | 'vata' | 'apse' | 'apsi'
    stlName: string
  }> = [
    { vrsIdx: 3, vrsName: 'VSDE', stlField: 'evla', stlName: 'EVLA' },
    { vrsIdx: 4, vrsName: 'VSDI', stlField: 'asda', stlName: 'ASDA' },
    { vrsIdx: 5, vrsName: 'VVAT', stlField: 'vata', stlName: 'VATA' },
    { vrsIdx: 6, vrsName: 'VPSE', stlField: 'apse', stlName: 'APSE' },
    { vrsIdx: 7, vrsName: 'VPSI', stlField: 'apsi', stlName: 'APSI' },
  ]

  for (const vrs of vrsSegments) {
    const vrsVatcRaw = vrs.elements[1]?.subElements[0]?.raw
    if (!vrsVatcRaw || vrsVatcRaw === '') continue
    const sums = subTrailerSums.get(vrsVatcRaw)
    if (!sums) continue

    for (const check of vrsChecks) {
      const vrsSub = vrs.elements[check.vrsIdx]?.subElements[0]
      if (!vrsSub || vrsSub.raw === '') continue
      const vrsValue = parseInt(vrsSub.raw, 10)
      if (isNaN(vrsValue)) continue
      const expected = sums[check.stlField]
      if (vrsValue !== expected) {
        vrsSub.issues.push(
          issue(
            'error',
            `VRS/${check.vrsName} (${vrsValue}) does not equal Σ ${subTrailerTag}/${check.stlName} for VAT code '${vrsVatcRaw}' (${expected})`,
            vrsSub.span,
          ),
        )
      }
    }
  }
}

function validateFileTotals(transmission: ParsedTransmission): void {
  const fileType = detectFileType(transmission.messages)
  const trailerMsgType = fileType === 'credit' ? 'CRETLR' : 'INVTLR'
  const detailMsgType = fileType === 'credit' ? 'CREDIT' : 'INVOIC'

  const trailer = transmission.messages.find((m) => m.type === trailerMsgType)
  if (!trailer) return

  const totSeg = trailer.segments.find((s) => s.tag === 'TOT')
  if (!totSeg) return

  // FTNI should match number of detail messages (INVOIC or CREDIT)
  const ftniSub = totSeg.elements[5]?.subElements[0]
  if (ftniSub && ftniSub.raw !== '') {
    const declared = parseInt(ftniSub.raw, 10)
    const actualCount = transmission.messages.filter((m) => m.type === detailMsgType).length
    if (!isNaN(declared) && declared !== actualCount) {
      ftniSub.issues.push(
        issue(
          'error',
          `TOT/FTNI declares ${declared} ${detailMsgType.toLowerCase()} messages, but file contains ${actualCount}`,
          ftniSub.span,
        ),
      )
    }
  }

  // Cross-check TOT against Σ VRS values
  const vattlr = transmission.messages.find((m) => m.type === 'VATTLR')
  if (vattlr) {
    const vrsSegments = vattlr.segments.filter((s) => s.tag === 'VRS')
    // TOT.FASE(0) = Σ VRS.VSDE(3)
    validateTotVrsSum(totSeg, vrsSegments, 0, 3, 'FASE', 'VSDE')
    // TOT.FASI(1) = Σ VRS.VSDI(4)
    validateTotVrsSum(totSeg, vrsSegments, 1, 4, 'FASI', 'VSDI')
    // TOT.FVAT(2) = Σ VRS.VVAT(5)
    validateTotVrsSum(totSeg, vrsSegments, 2, 5, 'FVAT', 'VVAT')
    // TOT.FPSE(3) = Σ VRS.VPSE(6)
    validateTotVrsSum(totSeg, vrsSegments, 3, 6, 'FPSE', 'VPSE')
    // TOT.FPSI(4) = Σ VRS.VPSI(7)
    validateTotVrsSum(totSeg, vrsSegments, 4, 7, 'FPSI', 'VPSI')
  }
}

function validateTotVrsSum(
  totSeg: ParsedSegment,
  vrsSegments: ParsedSegment[],
  totElemIdx: number,
  vrsElemIdx: number,
  totName: string,
  vrsName: string,
): void {
  const totSub = totSeg.elements[totElemIdx]?.subElements[0]
  if (!totSub || totSub.raw === '') return

  const totValue = parseInt(totSub.raw, 10)
  if (isNaN(totValue)) return

  let sum = 0
  for (const vrs of vrsSegments) {
    const vrsSub = vrs.elements[vrsElemIdx]?.subElements[0]
    if (!vrsSub || vrsSub.raw === '') continue
    const val = parseInt(vrsSub.raw, 10)
    if (!isNaN(val)) sum += val
  }

  if (totValue !== sum) {
    totSub.issues.push(
      issue(
        'error',
        `TOT/${totName} (${totValue}) does not equal Σ VRS/${vrsName} (${sum})`,
        totSub.span,
      ),
    )
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
    countSub.issues.push(
      issue(
        'error',
        `END message count declares ${declared} messages, but transmission contains ${actual}`,
        countSub.span,
      ),
    )
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
      validateGenericCodeLists(seg)
    }
  }
}

/**
 * Generic code list validation: for any sub-element that has a codeList defined
 * in the schema, check that the actual value is in the list.
 */
function validateGenericCodeLists(seg: ParsedSegment): void {
  for (const el of seg.elements) {
    for (const sub of el.subElements) {
      if (!sub.def?.codeList || sub.raw === '') continue
      const validCodes = sub.def.codeList.map((c) => c.code)
      if (!validCodes.includes(sub.raw)) {
        // Don't duplicate issues already raised by specific validators
        const alreadyHasCodeError = sub.issues.some(
          (i) => i.message.includes('Invalid') || i.message.includes('Unexpected'),
        )
        if (!alreadyHasCodeError) {
          const entry = sub.def.codeList.slice(0, 5).map((c) => `${c.code} (${c.name})`)
          const suffix = sub.def.codeList.length > 5 ? `, … (${sub.def.codeList.length} total)` : ''
          sub.issues.push(
            issue(
              'warning',
              `Value "${sub.raw}" is not in the expected code list for ${el.def?.code ?? seg.tag}. Valid: ${entry.join(', ')}${suffix}`,
              sub.span,
            ),
          )
        }
      }
    }
  }
}

function validateSegmentCodeLists(seg: ParsedSegment, messageType: string): void {
  switch (seg.tag) {
    case 'TYP':
      validateTypCodes(seg, messageType)
      break
    case 'ILD':
      validateIldCodes(seg)
      break
    case 'CLD':
      validateCldCodes(seg)
      break
    case 'STL':
    case 'VRS':
    case 'CST':
      validateVatcCode(seg)
      break
  }
}

function validateTypCodes(seg: ParsedSegment, messageType: string): void {
  const tcdeSub = seg.elements[0]?.subElements[0]
  if (!tcdeSub || tcdeSub.raw === '') return

  const invoiceCodes = ['0700', '0709']
  const creditCodes = ['0740', '0749']
  const isCredit = messageType === 'CREHDR'
  const validCodes = isCredit ? creditCodes : invoiceCodes

  if (!validCodes.includes(tcdeSub.raw)) {
    const desc = isCredit
      ? '0740 (Original credit note), 0749 (Copy credit note)'
      : '0700 (Original invoice), 0709 (Copy invoice)'
    tcdeSub.issues.push(
      issue(
        'error',
        `Invalid transaction code "${tcdeSub.raw}". Valid BIC codes: ${desc}`,
        tcdeSub.span,
      ),
    )
  }
}

function validateIldCodes(seg: ParsedSegment): void {
  // PIND = F means all monetary values should be zero (info-level, not enforced yet)
  const pindSub = seg.elements[20]?.subElements[0]
  if (pindSub && pindSub.raw === 'F') {
    pindSub.issues.push(
      issue('info', 'Free item: all monetary values should be zero for this line', pindSub.span),
    )
  }
}

function validateCldCodes(_seg: ParsedSegment): void {
  // All CLD code list validation is handled by the generic validator
}

function validateVatcCode(seg: ParsedSegment): void {
  // VATC is element index 1 in STL, VRS, and CST
  const vatcSub = seg.elements[1]?.subElements[0]
  if (!vatcSub || vatcSub.raw === '') return

  // 'A' (mixed) must not appear in trailer segments — the generic code list
  // validator handles the full set, but we add a specific message for 'A'
  if (vatcSub.raw === 'A') {
    vatcSub.issues.push(
      issue(
        'error',
        `VAT code 'A' (mixed) should not appear in ${seg.tag}. Mixed-rate items should be broken into their real rate components.`,
        vatcSub.span,
      ),
    )
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
  return dateKeywords.some((kw) => name.toLowerCase().includes(kw.toLowerCase()))
}

function validateDateValue(sub: ParsedSubElement): void {
  const value = sub.raw
  if (value.length !== 6) return // format validation will catch this

  const yy = parseInt(value.slice(0, 2), 10)
  const mm = parseInt(value.slice(2, 4), 10)
  const dd = parseInt(value.slice(4, 6), 10)

  if (mm < 1 || mm > 12) {
    sub.issues.push(
      issue('error', `Invalid month ${mm} in date "${value}" (format: YYMMDD)`, sub.span),
    )
    return
  }

  if (dd < 1 || dd > 31) {
    sub.issues.push(
      issue('error', `Invalid day ${dd} in date "${value}" (format: YYMMDD)`, sub.span),
    )
    return
  }

  // Basic month-day validation
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (dd > daysInMonth[mm - 1]!) {
    sub.issues.push(
      issue('error', `Invalid day ${dd} for month ${mm} in date "${value}"`, sub.span),
    )
  }

  // Suppress unused
  void yy
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isElementEmpty(el: ParsedElement): boolean {
  return el.subElements.every((sub) => sub.raw === '')
}

function issue(
  severity: ValidationIssue['severity'],
  message: string,
  span: Span,
): ValidationIssue {
  return { severity, message, span }
}
