/**
 * TRADACOMS INVFIL Parser - Type Definitions
 *
 * The parsed structure is designed to:
 * 1. Preserve source positions for highlighting
 * 2. Carry schema metadata for hover/description
 * 3. Support validation issues (populated later)
 */

// ─── Source Position Tracking ───────────────────────────────────────────────

export interface Span {
  /** Inclusive start offset in the raw text */
  start: number
  /** Exclusive end offset in the raw text */
  end: number
}

// ─── Validation (stub for future) ───────────────────────────────────────────

export type Severity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  severity: Severity
  message: string
  span: Span
}

// ─── Schema Metadata ────────────────────────────────────────────────────────

export type Requirement = 'M' | 'C'
export type LengthType = 'F' | 'V'

export interface DataFormat {
  /** e.g. "9(13)", "X(17)", "9(10)V9(4)" */
  notation: string
  /** Human-friendly description of format */
  description: string
}

export interface CodeListEntry {
  code: string
  name: string
}

export interface SubElementDef {
  /** Position index within the element (0-based) */
  index: number
  /** Short code name (e.g., "Supplier's EAN location number") */
  name: string
  /** Full description / remarks */
  description: string
  requirement: Requirement
  lengthType: LengthType | null
  format: DataFormat | null
  /** Optional code list: valid code values with descriptions */
  codeList: CodeListEntry[] | null
}

export interface ElementDef {
  /** Element mnemonic (e.g., "SIDN", "SNAM") */
  code: string
  /** Human-readable name */
  name: string
  /** Full description / remarks */
  description: string
  requirement: Requirement
  /** Separator that introduces this element: '=' for first, '+' for subsequent */
  separator: '=' | '+'
  subElements: SubElementDef[]
}

export interface SegmentDef {
  /** 3-character segment tag (e.g., "MHD", "ILD") */
  tag: string
  /** Full name (e.g., "MESSAGE HEADER") */
  name: string
  /** Description of the segment's purpose */
  description: string
  requirement: Requirement
  /** Repeat rules description */
  repeat: string
  elements: ElementDef[]
}

export interface MessageDef {
  /** Message type code (e.g., "INVFIL", "INVOIC", "VATTLR", "INVTLR") */
  type: string
  /** Human-readable name */
  name: string
  description: string
  segments: SegmentDef[]
}

// ─── Parsed Structure ───────────────────────────────────────────────────────

export interface ParsedSubElement {
  /** Index within parent element */
  index: number
  /** Raw text value (empty string if omitted) */
  raw: string
  /** Source position in document */
  span: Span
  /** Reference to schema definition (null if unknown) */
  def: SubElementDef | null
  issues: ValidationIssue[]
}

export interface ParsedElement {
  /** Position within the segment (0-based) */
  index: number
  /** The separator character that preceded this element ('=' or '+') */
  separator: '=' | '+'
  /** Raw text of the entire element (including sub-element separators) */
  raw: string
  span: Span
  /** Sub-elements split by ':' */
  subElements: ParsedSubElement[]
  /** Reference to schema definition (null if unknown) */
  def: ElementDef | null
  issues: ValidationIssue[]
}

export interface ParsedSegment {
  /** Segment tag (e.g., "MHD", "ILD") */
  tag: string
  /** Full raw text including tag and terminator */
  raw: string
  span: Span
  /** Parsed elements (index 0 is the first element after '=') */
  elements: ParsedElement[]
  /** Reference to schema definition (null if unknown) */
  def: SegmentDef | null
  issues: ValidationIssue[]
}

export interface ParsedMessage {
  /** Message type (e.g., "INVFIL", "INVOIC") determined from MHD */
  type: string
  /** Human-readable label */
  label: string
  /** All segments in this message (MHD through MTR) */
  segments: ParsedSegment[]
  span: Span
  /** Reference to schema definition (null if unknown) */
  def: MessageDef | null
  issues: ValidationIssue[]
}

export interface ParsedTransmission {
  /** STX segment (transmission envelope start), if present */
  stx: ParsedSegment | null
  /** All messages in the file */
  messages: ParsedMessage[]
  /** END segment (transmission envelope end), if present */
  end: ParsedSegment | null
  /** Full source text */
  raw: string
  issues: ValidationIssue[]
}
