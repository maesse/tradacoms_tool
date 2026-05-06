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

function validateDocumentStructure(transmission: ParsedTransmission): void {
  const messages = transmission.messages

  // Check required message types present
  const types = messages.map((m) => m.type)
  const hasInvfil = types.includes('INVFIL')
  const hasInvoic = types.includes('INVOIC')
  const hasVattlr = types.includes('VATTLR')
  const hasInvtlr = types.includes('INVTLR')

  const docSpan: Span = { start: 0, end: transmission.raw.length }

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
      validateStlVatCoverage(msg)
    }
  }

  // Cross-check VRS against file-wide VAT codes
  validateVrsCoverage(transmission)

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
      transmission.issues.push(
        issue(
          'warning',
          `Message ${msg.type} appears out of expected order (expected: INVFIL → INVOIC(s) → VATTLR → INVTLR)`,
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
    let actualCount = ildVatCounts.get(vatCode) ?? 0

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
 * real VAT codes found across all INVOIC messages in the file.
 */
function validateVrsCoverage(transmission: ParsedTransmission): void {
  const vattlr = transmission.messages.find((m) => m.type === 'VATTLR')
  if (!vattlr) return

  const vrsSegments = vattlr.segments.filter((s) => s.tag === 'VRS')
  const invoicMessages = transmission.messages.filter((m) => m.type === 'INVOIC')

  // Collect all distinct real VAT codes from all STL segments across all invoices
  const fileVatCodes = new Set<string>()
  for (const msg of invoicMessages) {
    for (const seg of msg.segments) {
      if (seg.tag === 'STL') {
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
          `VRS VAT code '${vrsVatcSub.raw}' does not appear in any STL segment in the file`,
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
          `Missing VRS segment for VAT code '${code}' which appears in STL segments`,
          vattlr.span,
        ),
      )
    }
  }
}

function validateFileTotals(transmission: ParsedTransmission): void {
  const invtlr = transmission.messages.find((m) => m.type === 'INVTLR')
  if (!invtlr) return

  const totSeg = invtlr.segments.find((s) => s.tag === 'TOT')
  if (!totSeg) return

  // FTNI should match number of INVOIC messages
  const ftniSub = totSeg.elements[5]?.subElements[0]
  if (ftniSub && ftniSub.raw !== '') {
    const declared = parseInt(ftniSub.raw, 10)
    const actualInvoicCount = transmission.messages.filter((m) => m.type === 'INVOIC').length
    if (!isNaN(declared) && declared !== actualInvoicCount) {
      ftniSub.issues.push(
        issue(
          'error',
          `TOT/FTNI declares ${declared} invoice messages, but file contains ${actualInvoicCount}`,
          ftniSub.span,
        ),
      )
    }
  }

  // Cross-check FASE = Σ EVLT across all INVOIC TLR segments
  const invoicMessages = transmission.messages.filter((m) => m.type === 'INVOIC')
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
    const tlr = msg.segments.find((s) => s.tag === 'TLR')
    if (!tlr) continue
    const tlrSub = tlr.elements[tlrElemIdx]?.subElements[0]
    if (!tlrSub || tlrSub.raw === '') continue
    const val = parseInt(tlrSub.raw, 10)
    if (!isNaN(val)) sum += val
  }

  if (totValue !== sum) {
    totSub.issues.push(
      issue(
        'error',
        `${totName} value (${totValue}) does not equal sum of ${tlrName} across invoices (${sum})`,
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
    tcdeSub.issues.push(
      issue(
        'error',
        `Invalid transaction code "${tcdeSub.raw}". Valid BIC codes: 0700 (Original invoice), 0709 (Copy invoice)`,
        tcdeSub.span,
      ),
    )
  }
}

function validateIldCodes(seg: ParsedSegment): void {
  // VATC (element index 9)
  const vatcSub = seg.elements[9]?.subElements[0]
  if (vatcSub && vatcSub.raw !== '') {
    const validVatc = ['S', 'Z', 'A', 'O', 'E', 'X', 'H', 'L']
    if (!validVatc.includes(vatcSub.raw)) {
      vatcSub.issues.push(
        issue(
          'error',
          `Invalid VAT category code "${vatcSub.raw}". Valid: S (Standard), Z (Zero), A (Mixed), O (Outside scope)`,
          vatcSub.span,
        ),
      )
    }
  }

  // MIXI (element index 11)
  const mixiSub = seg.elements[11]?.subElements[0]
  if (mixiSub && mixiSub.raw !== '') {
    const validMixi = ['0', '1', '2']
    if (!validMixi.includes(mixiSub.raw)) {
      mixiSub.issues.push(
        issue(
          'error',
          `Invalid mixed-rate indicator "${mixiSub.raw}". Valid: 0 (whole product), 1 (zero-rated component), 2 (standard-rate component)`,
          mixiSub.span,
        ),
      )
    }
  }

  // IGPI (element index 21)
  const igpiSub = seg.elements[21]?.subElements[0]
  if (igpiSub && igpiSub.raw !== '') {
    const validIgpi = ['I', 'G']
    if (!validIgpi.includes(igpiSub.raw)) {
      igpiSub.issues.push(
        issue(
          'warning',
          `Unexpected IGPI code "${igpiSub.raw}". Expected: I (line-level charge) or G (invoice-level charge)`,
          igpiSub.span,
        ),
      )
    }
  }

  // PIND = F means all monetary values should be zero (info-level, not enforced yet)
  const pindSub = seg.elements[20]?.subElements[0]
  if (pindSub && pindSub.raw === 'F') {
    // Just info for now
    pindSub.issues.push(
      issue('info', 'Free item: all monetary values should be zero for this line', pindSub.span),
    )
  }
}

function validateVatcCode(seg: ParsedSegment): void {
  // VATC is element index 1 in STL and VRS
  const vatcSub = seg.elements[1]?.subElements[0]
  if (!vatcSub || vatcSub.raw === '') return

  const validCodes = ['S', 'Z', 'O']
  if (!validCodes.includes(vatcSub.raw)) {
    vatcSub.issues.push(
      issue(
        'error',
        `Invalid VAT category code "${vatcSub.raw}" in ${seg.tag}. Valid in trailers: S (Standard), Z (Zero-rated), O (Outside scope). Code A (mixed) should not appear in ${seg.tag}.`,
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
