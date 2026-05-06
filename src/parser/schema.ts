import type {
  SegmentDef,
  MessageDef,
  ElementDef,
  SubElementDef,
  Requirement,
  LengthType,
} from './types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function sub(
  index: number,
  name: string,
  description: string,
  requirement: Requirement,
  lengthType: LengthType | null,
  notation: string | null,
  formatDesc?: string,
): SubElementDef {
  return {
    index,
    name,
    description,
    requirement,
    lengthType,
    format: notation ? { notation, description: formatDesc ?? '' } : null,
  }
}

function elem(
  code: string,
  name: string,
  description: string,
  requirement: Requirement,
  separator: '=' | '+',
  subElements: SubElementDef[],
): ElementDef {
  return { code, name, description, requirement, separator, subElements }
}

function seg(
  tag: string,
  name: string,
  description: string,
  requirement: Requirement,
  repeat: string,
  elements: ElementDef[],
): SegmentDef {
  return { tag, name, description, requirement, repeat, elements }
}

// ─── MHD (common) ───────────────────────────────────────────────────────────

function mhdSegment(expectedType: string, typeDesc: string): SegmentDef {
  return seg('MHD', 'MESSAGE HEADER', 'One mandatory occurrence per message', 'M', 'Once', [
    elem(
      'MSRF',
      'Message reference',
      'Consecutive count of messages within the file: start at 1 and increment by 1 for each new message header.',
      'M',
      '=',
      [sub(0, 'Message reference number', 'Consecutive message count', 'M', 'V', '9(12)')],
    ),
    elem('TYPE', 'Type of message', `Message type identifier`, 'M', '+', [
      sub(0, 'Type', `Always '${expectedType}'`, 'M', 'F', 'X(6)', typeDesc),
      sub(1, 'Version number', "Always '9' for this version", 'M', 'F', '9(1)'),
    ]),
  ])
}

// ─── MTR (common) ───────────────────────────────────────────────────────────

const mtrSegment: SegmentDef = seg(
  'MTR',
  'MESSAGE TRAILER',
  'One mandatory occurrence per message',
  'M',
  'Once',
  [
    elem(
      'NOSG',
      'Number of segments in message',
      'Control count of segments comprising the message, including MHD and MTR.',
      'M',
      '=',
      [sub(0, 'Segment count', 'Total number of segments in this message', 'M', 'V', '9(10)')],
    ),
  ],
)

// ─── TYP ────────────────────────────────────────────────────────────────────

const typSegment: SegmentDef = seg(
  'TYP',
  'TRANSACTION TYPE DETAILS',
  'Specifies the type of invoice. Invoice types must not be mixed within a single file.',
  'M',
  'Once',
  [
    elem(
      'TCDE',
      'Transaction code',
      'Code List 2: 0700 = Original invoice (VAT invoice), 0709 = Copy invoice (not for VAT purposes)',
      'M',
      '=',
      [
        sub(
          0,
          'Transaction code',
          '0700 = Original invoice, 0709 = Copy invoice',
          'M',
          'F',
          '9(4)',
        ),
      ],
    ),
    elem('TTYP', 'Transaction type', 'Do not use: this field is redundant.', 'C', '+', [
      sub(0, 'Transaction type text', 'Redundant field – do not use', 'C', 'V', 'X(12)'),
    ]),
  ],
)

// ─── SDT ────────────────────────────────────────────────────────────────────

const sdtSegment: SegmentDef = seg(
  'SDT',
  'SUPPLIER DETAILS',
  'Identifies the supplier/sender of the invoice file. Either GLN or alternative code (or both) must be sent.',
  'M',
  'Once',
  [
    elem(
      'SIDN',
      "Supplier's identity",
      'Coded identity of the supplier, preferably as an EAN location number (GLN).',
      'M',
      '=',
      [
        sub(
          0,
          "Supplier's EAN location number (GLN)",
          'EAN location number identifying the supplier.',
          'C',
          'F',
          '9(13)',
        ),
        sub(
          1,
          "Supplier's identity allocated by customer",
          'Alternative supplier code agreed between trading partners.',
          'C',
          'V',
          'X(17)',
        ),
      ],
    ),
    elem(
      'SNAM',
      "Supplier's name",
      "Supplier's legal name as printed on invoices. Required by HMRC unless code method approved.",
      'C',
      '+',
      [sub(0, "Supplier's name", 'Legal name', 'C', 'V', 'X(40)')],
    ),
    elem(
      'SADD',
      "Supplier's address",
      'Max 5 lines. Required by HMRC unless code method approved.',
      'C',
      '+',
      [
        sub(0, 'Address line 1', '', 'C', 'V', 'X(35)'),
        sub(1, 'Address line 2', '', 'C', 'V', 'X(35)'),
        sub(2, 'Address line 3', '', 'C', 'V', 'X(35)'),
        sub(3, 'Address line 4', '', 'C', 'V', 'X(35)'),
        sub(4, 'Post code', '', 'C', 'V', 'X(8)'),
      ],
    ),
    elem(
      'VATN',
      "Supplier's VAT registration no",
      'Mandatory even if the whole invoice is zero-rated.',
      'C',
      '+',
      [
        sub(0, 'VAT number – numeric', 'UK VAT number allocated by HMRC.', 'C', 'F', '9(9)'),
        sub(
          1,
          'VAT number – alphanumeric',
          'Non-UK or with country code (e.g., GB987654321).',
          'C',
          'V',
          'X(17)',
        ),
      ],
    ),
  ],
)

// ─── CDT ────────────────────────────────────────────────────────────────────

const cdtSegment: SegmentDef = seg(
  'CDT',
  'CUSTOMER DETAILS',
  'Identifies the customer to whom the invoice file is addressed.',
  'M',
  'Once',
  [
    elem('CIDN', "Customer's identity", '', 'M', '=', [
      sub(
        0,
        "Customer's EAN location no (GLN)",
        'EAN location number. Use strongly recommended.',
        'C',
        'F',
        '9(13)',
      ),
      sub(
        1,
        "Customer's identity allocated by supplier",
        "Alternative code, may be customer's SAN.",
        'C',
        'V',
        'X(17)',
      ),
    ]),
    elem('CNAM', "Customer's name", 'Registered legal name. Required by HMRC.', 'C', '+', [
      sub(0, "Customer's name", '', 'C', 'V', 'X(40)'),
    ]),
    elem('CADD', "Customer's address", 'Max 5 lines. Required by HMRC.', 'C', '+', [
      sub(0, 'Address line 1', '', 'C', 'V', 'X(35)'),
      sub(1, 'Address line 2', '', 'C', 'V', 'X(35)'),
      sub(2, 'Address line 3', '', 'C', 'V', 'X(35)'),
      sub(3, 'Address line 4', '', 'C', 'V', 'X(35)'),
      sub(4, 'Post code', '', 'C', 'V', 'X(8)'),
    ]),
    elem(
      'VATR',
      "Customer's VAT registration no",
      'Required only for supply to customer in different EU country.',
      'C',
      '+',
      [
        sub(0, 'VAT registration no – numeric', 'UK VAT number.', 'C', 'F', '9(9)'),
        sub(
          1,
          'VAT registration no – alphanumeric',
          'Non-UK or with country code.',
          'C',
          'V',
          'X(17)',
        ),
      ],
    ),
  ],
)

// ─── DNA (file header level) ────────────────────────────────────────────────

const dnaFileHeaderSegment: SegmentDef = seg(
  'DNA',
  'DATA NARRATIVE',
  'Carries BIC message/code list version numbers or currency code. Two occurrences recommended.',
  'C',
  'Repeat as necessary',
  [
    elem(
      'SEQA',
      'First level sequence number',
      'Starts at 1, incremented by 1 for each repeat.',
      'M',
      '=',
      [sub(0, 'Sequence number', '', 'M', 'V', '9(10)')],
    ),
    elem(
      'DNAC',
      'Data narrative code',
      'Code table reference. 206 = BIC message version, 207 = BIC code list version.',
      'C',
      '+',
      [
        sub(
          0,
          'Code table number',
          '206 = message version (T02), 207 = code list version',
          'C',
          'V',
          '9(4)',
        ),
        sub(1, 'Code value', 'Value from specified code list', 'C', 'V', 'X(3)'),
      ],
    ),
    elem('RTEX', 'Registered text', 'Only RTEX 073 (Currency code) may be used here.', 'C', '+', [
      sub(0, '1st registered application code', '', 'C', 'V', 'X(3)'),
      sub(1, 'Application text', '', 'C', 'V', 'X(40)'),
      sub(2, '2nd registered application code', '', 'C', 'V', 'X(3)'),
      sub(3, 'Application text', '', 'C', 'V', 'X(40)'),
      sub(4, '3rd registered application code', '', 'C', 'V', 'X(3)'),
      sub(5, 'Application text', '', 'C', 'V', 'X(40)'),
      sub(6, '4th registered application code', '', 'C', 'V', 'X(3)'),
      sub(7, 'Application text', '', 'C', 'V', 'X(40)'),
    ]),
    elem('GNAR', 'General narrative', 'Do not use.', 'C', '+', [
      sub(0, 'General narrative line 1', '', 'C', 'V', 'X(40)'),
      sub(1, 'General narrative line 2', '', 'C', 'V', 'X(40)'),
      sub(2, 'General narrative line 3', '', 'C', 'V', 'X(40)'),
      sub(3, 'General narrative line 4', '', 'C', 'V', 'X(40)'),
    ]),
  ],
)

// ─── FIL ────────────────────────────────────────────────────────────────────

const filSegment: SegmentDef = seg(
  'FIL',
  'FILE DETAILS',
  'File sequence number, version number and date.',
  'M',
  'Once',
  [
    elem(
      'FLGN',
      'File generation number',
      'Sequential for each successive Invoice file exchanged between trading partners.',
      'M',
      '=',
      [sub(0, 'File generation number', '', 'M', 'V', '9(4)')],
    ),
    elem(
      'FLVN',
      'File version number',
      "Retransmission indicator. Original is always '1'. Incremented for each retransmission.",
      'M',
      '+',
      [sub(0, 'File version number', '', 'M', 'V', '9(4)')],
    ),
    elem('FLDT', 'File creation date', 'Date the file is created. Format: YYMMDD', 'M', '+', [
      sub(0, 'File creation date', 'YYMMDD', 'M', 'F', '9(6)'),
    ]),
    elem('FLID', 'File (reel) identification', 'Do not use. Only for magnetic media.', 'C', '+', [
      sub(0, 'File reel ID', '', 'C', 'V', 'X(6)'),
    ]),
  ],
)

// ─── CLO ────────────────────────────────────────────────────────────────────

const cloSegment: SegmentDef = seg(
  'CLO',
  "CUSTOMER'S LOCATION",
  'Identifies delivery location for items invoiced. Must be included even if same as CDT in file header.',
  'M',
  'Once',
  [
    elem(
      'CLOC',
      "Customer's location",
      'One of three customer references must be present.',
      'M',
      '=',
      [
        sub(0, "Customer's EAN location number (GLN)", '', 'C', 'F', '9(13)'),
        sub(1, "Customer's own location code", 'Branch or department code', 'C', 'V', 'X(17)'),
        sub(
          2,
          "Supplier's identification of customer's location",
          "Supplier's reference / SAN of delivery location",
          'C',
          'V',
          'X(17)',
        ),
      ],
    ),
    elem('CNAM', "Customer's name", 'Not recommended – coded ID is sufficient.', 'C', '+', [
      sub(0, "Customer's name", '', 'C', 'V', 'X(40)'),
    ]),
    elem('CADD', "Customer's address", 'Not recommended – coded ID is sufficient.', 'C', '+', [
      sub(0, 'Address line 1', '', 'C', 'V', 'X(35)'),
      sub(1, 'Address line 2', '', 'C', 'V', 'X(35)'),
      sub(2, 'Address line 3', '', 'C', 'V', 'X(35)'),
      sub(3, 'Address line 4', '', 'C', 'V', 'X(35)'),
      sub(4, 'Post code', '', 'C', 'V', 'X(8)'),
    ]),
  ],
)

// ─── IRF ────────────────────────────────────────────────────────────────────

const irfSegment: SegmentDef = seg(
  'IRF',
  'INVOICE REFERENCES',
  'Date of Invoice and Tax-point Date.',
  'M',
  'Once',
  [
    elem('INVN', 'Invoice number', 'Invoice number allocated by the supplier.', 'M', '=', [
      sub(0, 'Invoice number', '', 'M', 'V', 'X(17)'),
    ]),
    elem('IVDT', 'Date of invoice', 'Format: YYMMDD', 'M', '+', [
      sub(0, 'Date of invoice', 'YYMMDD', 'M', 'F', '9(6)'),
    ]),
    elem('TXDT', 'Tax-point date', 'Format: YYMMDD', 'M', '+', [
      sub(0, 'Tax-point date', 'YYMMDD', 'M', 'F', '9(6)'),
    ]),
  ],
)

// ─── PYT ────────────────────────────────────────────────────────────────────

const pytSegment: SegmentDef = seg(
  'PYT',
  'SETTLEMENT TERMS',
  'Settlement terms for the invoice. BIC recommends days-based or fixed-date approach.',
  'C',
  'Repeat as necessary',
  [
    elem('SEQA', 'First level sequence number', 'Starts at 1, incremented by 1.', 'M', '=', [
      sub(0, 'Sequence number', '', 'M', 'V', '9(10)'),
    ]),
    elem('PAYT', 'Terms of payment', 'Text description: do not use.', 'C', '+', [
      sub(0, 'Payment terms text', 'Do not use', 'C', 'V', 'X(40)'),
    ]),
    elem('PAYD', 'Payment date and terms', 'Fixed payment date and discount.', 'C', '+', [
      sub(0, 'Payment date', 'YYMMDD', 'M', 'F', '9(6)'),
      sub(1, 'Settlement discount %', 'Percentage discount. Use 0 if none.', 'M', 'V', '9(3)V9(3)'),
    ]),
    elem('PAYY', 'Settlement terms', 'Number of days until payment is due.', 'C', '+', [
      sub(
        0,
        'Number of days',
        'Calendar days after reference date (date of invoice unless otherwise agreed)',
        'M',
        'V',
        '9(3)',
      ),
      sub(1, 'Settlement discount percentage', '', 'C', 'V', '9(3)V9(3)'),
      sub(2, 'Settlement code', 'User defined code', 'C', 'V', 'X(3)'),
    ]),
  ],
)

// ─── DNA (invoice level) ────────────────────────────────────────────────────

const dnaInvoiceSegment: SegmentDef = seg(
  'DNA',
  'DATA NARRATIVE',
  'Coded or free text at invoice level. RTEX codes: 978 (Cancelled invoice number), 979 (Supplier internal code), 984 (Cancelled credit note number).',
  'C',
  'Repeat as necessary',
  [
    elem('SEQA', 'First level sequence number', 'Starts at 1.', 'M', '=', [
      sub(0, 'Sequence number', '', 'M', 'V', '9(10)'),
    ]),
    elem('DNAC', 'Data narrative code', 'No DNAC codes allocated for this segment.', 'C', '+', [
      sub(0, 'Code table number', '', 'C', 'V', '9(4)'),
      sub(1, 'Code value', '', 'C', 'V', 'X(3)'),
    ]),
    elem('RTEX', 'Registered text', 'Valid codes: 978, 979, 984', 'C', '+', [
      sub(0, '1st registered application code', '', 'C', 'V', 'X(3)'),
      sub(1, 'Application text', '', 'C', 'V', 'X(40)'),
      sub(2, '2nd registered application code', '', 'C', 'V', 'X(3)'),
      sub(3, 'Application text', '', 'C', 'V', 'X(40)'),
      sub(4, '3rd registered application code', '', 'C', 'V', 'X(3)'),
      sub(5, 'Application text', '', 'C', 'V', 'X(40)'),
      sub(6, '4th registered application code', '', 'C', 'V', 'X(3)'),
      sub(7, 'Application text', '', 'C', 'V', 'X(40)'),
    ]),
    elem('GNAR', 'General narrative', 'Do not use.', 'C', '+', [
      sub(0, 'General narrative line 1', '', 'C', 'V', 'X(40)'),
      sub(1, 'General narrative line 2', '', 'C', 'V', 'X(40)'),
      sub(2, 'General narrative line 3', '', 'C', 'V', 'X(40)'),
      sub(3, 'General narrative line 4', '', 'C', 'V', 'X(40)'),
    ]),
  ],
)

// ─── ODD ────────────────────────────────────────────────────────────────────

const oddSegment: SegmentDef = seg(
  'ODD',
  'ORDER AND DELIVERY REFERENCES',
  'Introduces a group of invoice lines from a single order/delivery. Repeated for each order.',
  'M',
  'Repeat for each order',
  [
    elem('SEQA', 'First level sequence number', 'Starts at 1, incremented by 1.', 'M', '=', [
      sub(0, 'Sequence number', '', 'M', 'V', '9(10)'),
    ]),
    elem('ORNO', 'Order number and date', '', 'M', '+', [
      sub(0, "Customer's order number", 'As allocated by the customer.', 'C', 'V', 'X(17)'),
      sub(1, "Supplier's order number", 'As allocated by the supplier.', 'C', 'V', 'X(17)'),
      sub(
        2,
        'Date order placed by customer',
        'YYMMDD. Not required if order number sent.',
        'C',
        'F',
        '9(6)',
      ),
      sub(3, 'Date order received by supplier', 'YYMMDD', 'C', 'F', '9(6)'),
    ]),
    elem(
      'DELN',
      'Delivery note details',
      'Either/both delivery note number and/or despatch date must be sent.',
      'M',
      '+',
      [
        sub(0, 'Delivery note number', 'Allocated by the supplier.', 'C', 'V', 'X(17)'),
        sub(1, 'Date of document', 'YYMMDD. Date of despatch.', 'C', 'F', '9(6)'),
      ],
    ),
    elem(
      'NODU',
      'Number of delivery or uplift units',
      'Estimated number of packages (only if Invoice is delivery notification).',
      'C',
      '+',
      [sub(0, 'Number of units', '', 'C', 'V', '9(15)')],
    ),
    elem('DEWT', 'Delivery weights', '', 'C', '+', [
      sub(0, 'Vehicle tare weight', 'Do not use', 'C', 'V', '9(10)V9(3)'),
      sub(1, 'Total goods weight', 'In kilos.', 'C', 'V', '9(10)V9(3)'),
    ]),
    elem('PODN', 'Proof of delivery details', 'Do not use.', 'C', '+', [
      sub(0, 'Proof of delivery', '', 'C', 'V', 'X(17)'),
    ]),
    elem('SCAR', 'Name of carrier', 'Do not use.', 'C', '+', [
      sub(0, 'Carrier name', '', 'C', 'V', 'X(17)'),
    ]),
    elem('DLOC', 'Despatch location', 'Do not use.', 'C', '+', [
      sub(0, 'Location', '', 'C', 'V', 'X(17)'),
    ]),
    elem('TLOC', 'Transhipment location', 'Do not use.', 'C', '+', [
      sub(0, 'Location', '', 'C', 'V', 'X(17)'),
    ]),
    elem('JORF', 'Journey reference', 'Do not use.', 'C', '+', [
      sub(0, 'Reference', '', 'C', 'V', 'X(17)'),
    ]),
    elem(
      'SCRF',
      'Specification/Contract references',
      'Special deal or promotion reference.',
      'C',
      '+',
      [
        sub(0, 'Specification number', 'Do not use', 'C', 'V', 'X(17)'),
        sub(
          1,
          'Contract number',
          'Special deal or promotion. Use "/" as delimiter.',
          'C',
          'V',
          'X(17)',
        ),
      ],
    ),
  ],
)

// ─── ILD ────────────────────────────────────────────────────────────────────

const ildSegment: SegmentDef = seg(
  'ILD',
  'INVOICE LINE DETAILS',
  'One occurrence per invoice line. For sundry charges, refer to section 7.',
  'M',
  'Repeat for each line item',
  [
    elem(
      'SEQA',
      'First level sequence number',
      'Same value as corresponding ODD segment.',
      'M',
      '=',
      [sub(0, 'Sequence number', 'Matches ODD/SEQA', 'M', 'V', '9(10)')],
    ),
    elem(
      'SEQB',
      'Second level sequence number',
      'Invoice line number. Starts at 1, incremented by 1.',
      'M',
      '+',
      [sub(0, 'Line number', '', 'M', 'V', '9(10)')],
    ),
    elem(
      'SPRO',
      "Supplier's product number",
      'Product identification. ISBN-13/EAN-13, or charge code from Code List 205 for sundry charges.',
      'M',
      '+',
      [
        sub(0, 'EAN-13 article number', '"Bookland" EAN-13 or ISBN-13', 'C', 'F', '9(13)'),
        sub(
          1,
          "Supplier's code for traded unit",
          'ISBN-10 (deprecated) or charge code from Code List 205',
          'C',
          'V',
          'X(30)',
        ),
        sub(2, 'DUN-14 code', 'Do not use', 'C', 'F', '9(14)'),
      ],
    ),
    elem('SACU', "Supplier's EAN for consumer unit", 'Do not use.', 'C', '+', [
      sub(0, 'EAN code', '', 'C', 'F', '9(13)'),
    ]),
    elem('CPRO', "Customer's product number", 'Do not use.', 'C', '+', [
      sub(0, "Customer's own brand EAN", '', 'C', 'F', '9(15)'),
      sub(1, "Customer's item code", '', 'C', 'V', 'X(30)'),
    ]),
    elem('UNOR', 'Unit of ordering', '', 'C', '+', [
      sub(0, 'Consumer units in traded unit', 'Always 1 in book supply', 'C', 'V', '9(15)'),
      sub(1, 'Ordering measure', 'Do not use', 'C', 'V', '9(10)V9(3)'),
      sub(2, 'Measure indicator', 'Do not use', 'C', 'V', 'X(6)'),
    ]),
    elem('QTYI', 'Quantity invoiced', '', 'M', '+', [
      sub(0, 'Number of traded units invoiced', 'Number of copies invoiced', 'C', 'V', '9(15)'),
      sub(1, 'Total measure ordered', 'Do not use', 'C', 'V', '9(10)V9(3)'),
      sub(2, 'Measure indicator', 'Do not use', 'C', 'V', 'X(6)'),
    ]),
    elem(
      'AUCT',
      'Unit cost price (excl. VAT)',
      'Net unit cost after discounts, before VAT. Always 4 decimal places (e.g., £12.99 = 129900).',
      'M',
      '+',
      [
        sub(0, 'Cost price', 'In pounds, 4 implied decimal places', 'M', 'V', '9(10)V9(4)'),
        sub(1, 'Measure indicator', 'Do not use', 'C', 'V', 'X(6)'),
      ],
    ),
    elem(
      'LEXC',
      'Extended line cost (excl. VAT)',
      'Total line cost after discounts, before VAT. 4 decimal places.',
      'M',
      '+',
      [sub(0, 'Extended line cost', 'In pounds, 4 implied decimal places', 'M', 'V', '9(10)V9(4)')],
    ),
    elem(
      'VATC',
      'VAT Rate category code',
      'Code List 12: S=Standard, Z=Zero-rated, A=Mixed, O=Outside scope',
      'M',
      '+',
      [sub(0, 'VAT category code', 'S, Z, A, O, E, X, H, L', 'M', 'F', 'X(1)')],
    ),
    elem('VATP', 'VAT Rate percentage', '', 'M', '+', [
      sub(0, 'VAT percentage', '3 integer + 3 decimal digits', 'M', 'V', '9(3)V9(3)'),
    ]),
    elem(
      'MIXI',
      'Mixed VAT Rate product indicator',
      'Only for mixed-rate items. 0=product as whole, 1=zero-rated component, 2=standard-rate component.',
      'C',
      '+',
      [sub(0, 'Mixed-rate indicator', '0, 1, or 2', 'C', 'F', '9(1)')],
    ),
    elem('CRLI', 'Credit Line indicator', 'Do not use.', 'C', '+', [
      sub(0, 'Credit line indicator', '', 'C', 'V', 'X(4)'),
    ]),
    elem(
      'TDES',
      'Traded unit description',
      'Use for substituted items or description-only orders.',
      'C',
      '+',
      [
        sub(0, 'Description line 1', 'Author', 'C', 'V', 'X(40)'),
        sub(1, 'Description line 2', 'Title', 'C', 'V', 'X(40)'),
      ],
    ),
    elem(
      'MSPR',
      'Selling on price',
      "Manufacturer's recommended selling price including VAT. Required in book trade.",
      'C',
      '+',
      [
        sub(
          0,
          "Manufacturer's recommended selling price",
          'In pounds, 4 decimal places',
          'C',
          'V',
          '9(10)V9(4)',
        ),
        sub(1, 'Marked price', 'Do not use', 'C', 'V', '9(10)V9(4)'),
        sub(2, 'Split pack price', 'Do not use', 'C', 'V', '9(10)V9(4)'),
      ],
    ),
    elem('SRSP', 'Statutory retail selling price', 'Do not use.', 'C', '+', [
      sub(0, 'Statutory price', '', 'C', 'V', '9(10)V9(4)'),
    ]),
    elem(
      'BUCT',
      'Unit cost price (excl. VAT) before discount',
      'Required in book trade. 4 decimal places.',
      'C',
      '+',
      [sub(0, 'Unit cost before discount', 'In pounds, 4 decimal places', 'C', 'V', '9(10)V9(4)')],
    ),
    elem(
      'DSCV',
      'Discount value',
      'Line discount value in pounds. Required. 4 decimal places.',
      'C',
      '+',
      [sub(0, 'Discount value', 'In pounds, 4 decimal places', 'C', 'V', '9(10)V9(4)')],
    ),
    elem('DSCP', 'Discount percentage', 'Required in book trade practice.', 'C', '+', [
      sub(0, 'Discount percentage', '3 integer + 3 decimal', 'C', 'V', '9(3)V9(3)'),
    ]),
    elem('SUBA', 'Subsidy amount', 'Do not use.', 'C', '+', [
      sub(0, 'Subsidy', '', 'C', 'V', '9(10)V9(4)'),
    ]),
    elem(
      'PIND',
      'Special Price indicator',
      'Code List 5. F = free of charge (all monetary values carry zeros).',
      'C',
      '+',
      [sub(0, 'Price indicator code', '', 'C', 'V', 'X(4)')],
    ),
    elem(
      'IGPI',
      'Item Group identifier',
      'Code List 10. I = line-level charge, G = invoice-level charge.',
      'C',
      '+',
      [sub(0, 'Group identifier', 'I or G', 'C', 'V', 'X(4)')],
    ),
    elem('CSDI', 'Cash settlement discount identifier', 'Do not use.', 'C', '+', [
      sub(0, 'Identifier', '', 'C', 'F', 'X(1)'),
    ]),
    elem(
      'TSUP',
      'VAT – Type of supply',
      'Code List 14. Omitted for normal sale (code A).',
      'C',
      '+',
      [sub(0, 'Type of supply code', '', 'C', 'F', 'X(1)')],
    ),
    elem(
      'SCRF',
      'Specification/Contract references',
      'Special deal or promotion reference.',
      'C',
      '+',
      [
        sub(0, 'Specification number', 'Do not use', 'C', 'V', 'X(17)'),
        sub(1, 'Contract number', 'Special deal or promotion. "/" delimiter.', 'C', 'V', 'X(17)'),
      ],
    ),
  ],
)

// ─── DNC (line level) ───────────────────────────────────────────────────────

const dncSegment: SegmentDef = seg(
  'DNC',
  'DATA NARRATIVE',
  'Qualifies the invoice line. One DNC per ILD (for mixed-rate: one DNC after 3rd ILD).',
  'C',
  'One per ILD group',
  [
    elem('SEQA', 'First level sequence number', 'Must match ODD/SEQA.', 'M', '=', [
      sub(0, 'Sequence number', '', 'M', 'V', '9(10)'),
    ]),
    elem('SEQB', 'Second level sequence number', 'Must match ILD/SEQB.', 'M', '+', [
      sub(0, 'Line number', '', 'M', 'V', '9(10)'),
    ]),
    elem(
      'SEQC',
      'Third level sequence number',
      'Starts at 1, incremented by 1 for each repeat.',
      'M',
      '+',
      [sub(0, 'Sub-sequence', '', 'M', 'V', '9(10)')],
    ),
    elem(
      'DNAC',
      'Data narrative code',
      'Only BIC list 203 (Order qualifier: BIC, FMS, SLR, SSF).',
      'C',
      '+',
      [
        sub(0, 'Code table number', '', 'C', 'V', '9(4)'),
        sub(1, 'Code value', '', 'C', 'V', 'X(3)'),
      ],
    ),
    elem(
      'RTEX',
      'Registered text',
      'Valid codes: 073 (currency), 082 (order line ref), 314 (binder pack qty), 971 (component items), 980 (SOR number), 982 (HMRC commodity code).',
      'C',
      '+',
      [
        sub(0, '1st registered application code', '', 'C', 'V', 'X(3)'),
        sub(1, 'Application text', '', 'C', 'V', 'X(40)'),
        sub(2, '2nd registered application code', '', 'C', 'V', 'X(3)'),
        sub(3, 'Application text', '', 'C', 'V', 'X(40)'),
        sub(4, '3rd registered application code', '', 'C', 'V', 'X(3)'),
        sub(5, 'Application text', '', 'C', 'V', 'X(40)'),
        sub(6, '4th registered application code', '', 'C', 'V', 'X(3)'),
        sub(7, 'Application text', '', 'C', 'V', 'X(40)'),
      ],
    ),
    elem('GNAR', 'General narrative', 'Do not use.', 'C', '+', [
      sub(0, 'General narrative line 1', '', 'C', 'V', 'X(40)'),
      sub(1, 'General narrative line 2', '', 'C', 'V', 'X(40)'),
      sub(2, 'General narrative line 3', '', 'C', 'V', 'X(40)'),
      sub(3, 'General narrative line 4', '', 'C', 'V', 'X(40)'),
    ]),
  ],
)

// ─── STL ────────────────────────────────────────────────────────────────────

const stlSegment: SegmentDef = seg(
  'STL',
  'VAT RATE INVOICE SUB-TRAILER',
  'Repeated for each real VAT rate in the invoice. Not for A (mixed rate).',
  'M',
  'Repeat for each VAT rate',
  [
    elem('SEQA', 'First level sequence number', 'Starts at 1.', 'M', '=', [
      sub(0, 'Sequence number', '', 'M', 'V', '9(10)'),
    ]),
    elem('VATC', 'VAT Rate category code', 'S=Standard, Z=Zero-rated, O=Outside scope', 'M', '+', [
      sub(0, 'VAT category code', '', 'M', 'F', 'X(1)'),
    ]),
    elem('VATP', 'VAT Rate percentage', '', 'M', '+', [
      sub(0, 'VAT percentage', '', 'M', 'V', '9(3)V9(3)'),
    ]),
    elem(
      'NRIL',
      'Number of item lines',
      'Count of ILD segments with this VAT code (including mixed-rate components).',
      'M',
      '+',
      [sub(0, 'Item line count', '', 'M', 'V', '9(10)')],
    ),
    elem('LVLA', 'Line sub-total amount (before VAT)', 'Σ LEXC for this VAT code', 'M', '+', [
      sub(0, 'Line sub-total', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)'),
    ]),
    elem(
      'QYDA',
      'Discount amount for invoice quantity',
      'Not used in book trade practice.',
      'C',
      '+',
      [sub(0, 'Quantity discount', '', 'C', 'V', '9(10)V9(2)')],
    ),
    elem(
      'VLDA',
      'Discount amount for invoice value',
      'Not used in book trade practice.',
      'C',
      '+',
      [sub(0, 'Value discount', '', 'C', 'V', '9(10)V9(2)')],
    ),
    elem('SURA', 'Surcharge amount', 'Do not use.', 'C', '+', [
      sub(0, 'Surcharge', '', 'C', 'V', '9(10)V9(2)'),
    ]),
    elem('SSUB', 'Sub-total subsidy', 'Do not use.', 'C', '+', [
      sub(0, 'Subsidy', '', 'C', 'V', '9(10)V9(2)'),
    ]),
    elem(
      'EVLA',
      'Extended sub-total amount (before settlement discount)',
      'EVLA = LVLA – QYDA – VLDA + SURA – SSUB (or = LVLA if others unused)',
      'M',
      '+',
      [sub(0, 'Extended sub-total', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)')],
    ),
    elem(
      'SEDA',
      'Sub-total settlement discount amount',
      'Only if payment terms include settlement discount.',
      'C',
      '+',
      [sub(0, 'Settlement discount', '', 'C', 'V', '9(10)V9(2)')],
    ),
    elem(
      'ASDA',
      'Extended sub-total amount (after settlement discount)',
      'ASDA = EVLA – SEDA (or = EVLA if no settlement discount)',
      'M',
      '+',
      [sub(0, 'Amount after settlement', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)')],
    ),
    elem('VATA', 'VAT amount payable', 'VAT = VATP applied to ASDA', 'M', '+', [
      sub(0, 'VAT amount', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)'),
    ]),
    elem(
      'APSE',
      'Payable sub-total (before settlement discount)',
      'APSE = EVLA + VATA. Only if settlement discount applies.',
      'C',
      '+',
      [sub(0, 'Payable before settlement', '', 'C', 'V', '9(10)V9(2)')],
    ),
    elem('APSI', 'Payment sub-total (after settlement discount)', 'APSI = ASDA + VATA', 'M', '+', [
      sub(0, 'Payable after settlement', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)'),
    ]),
  ],
)

// ─── TLR ────────────────────────────────────────────────────────────────────

const tlrSegment: SegmentDef = seg(
  'TLR',
  'INVOICE TRAILER',
  'Totals for the invoice message as a whole.',
  'M',
  'Once',
  [
    elem('NSTL', 'Number of total segments', 'Number of STL segments in the message.', 'M', '=', [
      sub(0, 'STL count', '', 'M', 'V', '9(10)'),
    ]),
    elem('LVLT', 'Lines total amount (before settlement discount)', 'Σ LVLA', 'M', '+', [
      sub(0, 'Lines total', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)'),
    ]),
    elem(
      'QYDT',
      'Total discount amount for invoice quantity',
      'Not used in book trade.',
      'C',
      '+',
      [sub(0, 'Quantity discount total', '', 'C', 'V', '9(10)V9(2)')],
    ),
    elem('VLDT', 'Total discount amount for invoice value', 'Not used in book trade.', 'C', '+', [
      sub(0, 'Value discount total', '', 'C', 'V', '9(10)V9(2)'),
    ]),
    elem('SURT', 'Total surcharge amount', 'Do not use.', 'C', '+', [
      sub(0, 'Surcharge total', '', 'C', 'V', '9(10)V9(2)'),
    ]),
    elem('TSUB', 'Total subsidy amount', 'Do not use.', 'C', '+', [
      sub(0, 'Subsidy total', '', 'C', 'V', '9(10)V9(2)'),
    ]),
    elem('EVLT', 'Total extended amount (before settlement discount)', 'Σ EVLA', 'M', '+', [
      sub(0, 'Extended total', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)'),
    ]),
    elem('SEDT', 'Total settlement discount amount', 'Σ SEDA', 'C', '+', [
      sub(0, 'Settlement discount total', '', 'C', 'V', '9(10)V9(2)'),
    ]),
    elem('ASDT', 'Total amount (after settlement discount)', 'Σ ASDA', 'M', '+', [
      sub(0, 'Total after settlement', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)'),
    ]),
    elem('TVAT', 'Total VAT amount payable', 'Σ VATA', 'M', '+', [
      sub(0, 'Total VAT', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)'),
    ]),
    elem(
      'TPSE',
      'Total payable (before settlement discount)',
      'Σ APSE. Only if settlement discount applies.',
      'C',
      '+',
      [sub(0, 'Total payable before settlement', '', 'C', 'V', '9(10)V9(2)')],
    ),
    elem(
      'TPSI',
      'Total payable (after settlement discount)',
      'Σ APSI. Final total payable including VAT.',
      'M',
      '+',
      [sub(0, 'Total payable', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)')],
    ),
  ],
)

// ─── VRS ────────────────────────────────────────────────────────────────────

const vrsSegment: SegmentDef = seg(
  'VRS',
  'VAT RATE SUMMARY',
  'Repeated for each real VAT rate in the file. A (mixed) is not a real rate.',
  'M',
  'Repeat for each VAT rate',
  [
    elem('SEQA', 'First level sequence number', 'Starts at 1.', 'M', '=', [
      sub(0, 'Sequence number', '', 'M', 'V', '9(10)'),
    ]),
    elem('VATC', 'VAT Rate category code', 'S, Z, or O', 'M', '+', [
      sub(0, 'VAT category code', '', 'M', 'F', 'X(1)'),
    ]),
    elem('VATP', 'VAT Rate percentage', '', 'M', '+', [
      sub(0, 'VAT percentage', '', 'M', 'V', '9(3)V9(3)'),
    ]),
    elem(
      'VSDE',
      'File sub-total amount (before settlement discount)',
      'Σ EVLA across all STL with this VAT code',
      'M',
      '+',
      [
        sub(
          0,
          'File sub-total before settlement',
          'In pounds, 2 decimal places',
          'M',
          'V',
          '9(10)V9(2)',
        ),
      ],
    ),
    elem(
      'VSDI',
      'File sub-total amount (after settlement discount)',
      'Σ ASDA across all STL with this VAT code',
      'M',
      '+',
      [
        sub(
          0,
          'File sub-total after settlement',
          'In pounds, 2 decimal places',
          'M',
          'V',
          '9(10)V9(2)',
        ),
      ],
    ),
    elem('VVAT', 'File VAT sub-total', 'Σ VATA across all STL with this VAT code', 'M', '+', [
      sub(0, 'File VAT sub-total', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)'),
    ]),
    elem(
      'VPSE',
      'File sub-total payable (before settlement discount)',
      'Σ APSE. Only if settlement discount applies.',
      'C',
      '+',
      [sub(0, 'File payable before settlement', '', 'C', 'V', '9(10)V9(2)')],
    ),
    elem(
      'VPSI',
      'File sub-total payable (after settlement discount)',
      'Σ APSI across all STL with this VAT code',
      'M',
      '+',
      [
        sub(
          0,
          'File payable after settlement',
          'In pounds, 2 decimal places',
          'M',
          'V',
          '9(10)V9(2)',
        ),
      ],
    ),
  ],
)

// ─── TOT ────────────────────────────────────────────────────────────────────

const totSegment: SegmentDef = seg(
  'TOT',
  'FILE TOTALS',
  'Mandatory control totals for the invoice file.',
  'M',
  'Once',
  [
    elem('FASE', 'File total amount (before VAT and settlement discount)', 'Σ VSDE', 'M', '=', [
      sub(
        0,
        'File total before VAT/settlement',
        'In pounds, 2 decimal places',
        'M',
        'V',
        '9(10)V9(2)',
      ),
    ]),
    elem('FASI', 'File total amount (before VAT, after settlement discount)', 'Σ VSDI', 'M', '+', [
      sub(0, 'File total after settlement', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)'),
    ]),
    elem('FVAT', 'File total VAT amount', 'Σ VVAT', 'M', '+', [
      sub(0, 'File VAT total', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)'),
    ]),
    elem(
      'FPSE',
      'File total payable (after VAT, before settlement discount)',
      'Σ VPSE. Only if settlement discount applies.',
      'C',
      '+',
      [sub(0, 'File payable before settlement', '', 'C', 'V', '9(10)V9(2)')],
    ),
    elem('FPSI', 'File total payable (after VAT and settlement discount)', 'Σ VPSI', 'M', '+', [
      sub(0, 'File payable', 'In pounds, 2 decimal places', 'M', 'V', '9(10)V9(2)'),
    ]),
    elem(
      'FTNI',
      'File total number of invoice messages',
      'Total number of Invoice messages in the file.',
      'M',
      '+',
      [sub(0, 'Invoice message count', '', 'M', 'V', '9(10)')],
    ),
  ],
)

// ─── STX (transmission envelope) ────────────────────────────────────────────

export const stxSegmentDef: SegmentDef = seg(
  'STX',
  'START OF TRANSMISSION',
  'Transmission envelope header.',
  'M',
  'Once',
  [
    elem('SEDE', 'Syntax and encoding details', '', 'M', '=', [
      sub(0, 'Syntax identifier', 'ANA or ANAA', 'M', 'V', 'X(4)'),
      sub(1, 'Syntax version number', 'Always 1', 'M', 'F', '9(1)'),
    ]),
    elem('SNDR', 'Sender identification', '', 'M', '+', [
      sub(0, "Sender's EAN/GLN", '', 'M', 'F', '9(13)'),
      sub(1, "Sender's name", '', 'C', 'V', 'X(35)'),
    ]),
    elem('RCVR', 'Receiver identification', '', 'M', '+', [
      sub(0, "Receiver's EAN/GLN", '', 'M', 'F', '9(13)'),
      sub(1, "Receiver's name", '', 'C', 'V', 'X(35)'),
    ]),
    elem('DTMS', 'Date and time of transmission', '', 'M', '+', [
      sub(0, 'Date', 'YYMMDD', 'M', 'F', '9(6)'),
      sub(1, 'Time', 'HHMMSS', 'M', 'F', '9(6)'),
    ]),
    elem('SNRF', "Sender's transmission reference", '', 'M', '+', [
      sub(0, 'Reference', '', 'M', 'V', 'X(14)'),
    ]),
    elem('APRF', "Recipient's transmission reference", '', 'C', '+', [
      sub(0, 'Reference', '', 'C', 'V', 'X(14)'),
    ]),
    elem('PRCD', 'Application reference', '', 'C', '+', [
      sub(0, 'Application reference', 'File type (e.g., INVFIL)', 'C', 'V', 'X(14)'),
    ]),
  ],
)

// ─── END (transmission envelope) ────────────────────────────────────────────

export const endSegmentDef: SegmentDef = seg(
  'END',
  'END OF TRANSMISSION',
  'Transmission envelope trailer.',
  'M',
  'Once',
  [
    elem('NMST', 'Number of messages in transmission', '', 'M', '=', [
      sub(0, 'Message count', 'Total number of messages in this transmission', 'M', 'V', '9(6)'),
    ]),
  ],
)

// ─── Message Definitions ────────────────────────────────────────────────────

export const invfilMessageDef: MessageDef = {
  type: 'INVFIL',
  name: 'Invoice File Header',
  description:
    'One occurrence at the start of the file. Contains supplier/customer details and file metadata.',
  segments: [
    mhdSegment('INVFIL', 'Invoice file header'),
    typSegment,
    sdtSegment,
    cdtSegment,
    dnaFileHeaderSegment,
    filSegment,
    mtrSegment,
  ],
}

export const invoicMessageDef: MessageDef = {
  type: 'INVOIC',
  name: 'Invoice Details',
  description: 'One occurrence per invoice. Contains line items, order references, and totals.',
  segments: [
    mhdSegment('INVOIC', 'Invoice details'),
    cloSegment,
    irfSegment,
    pytSegment,
    dnaInvoiceSegment,
    oddSegment,
    ildSegment,
    dncSegment,
    stlSegment,
    tlrSegment,
    mtrSegment,
  ],
}

export const vattlrMessageDef: MessageDef = {
  type: 'VATTLR',
  name: 'File VAT Trailer',
  description:
    'One occurrence after all INVOIC messages. Summarises VAT by rate for the whole file.',
  segments: [mhdSegment('VATTLR', 'File VAT trailer'), vrsSegment, mtrSegment],
}

export const invtlrMessageDef: MessageDef = {
  type: 'INVTLR',
  name: 'Invoice File Trailer',
  description: 'One occurrence at the end of the file. File-level control totals.',
  segments: [mhdSegment('INVTLR', 'Invoice file trailer'), totSegment, mtrSegment],
}

// ─── Lookup Utilities ───────────────────────────────────────────────────────

const messageDefsByType: Record<string, MessageDef> = {
  INVFIL: invfilMessageDef,
  INVOIC: invoicMessageDef,
  VATTLR: vattlrMessageDef,
  INVTLR: invtlrMessageDef,
}

export function getMessageDef(type: string): MessageDef | null {
  return messageDefsByType[type] ?? null
}

export function getSegmentDef(messageType: string, segmentTag: string): SegmentDef | null {
  const msgDef = messageDefsByType[messageType]
  if (!msgDef) return null
  return msgDef.segments.find((s) => s.tag === segmentTag) ?? null
}

export function getSegmentDefStandalone(segmentTag: string): SegmentDef | null {
  if (segmentTag === 'STX') return stxSegmentDef
  if (segmentTag === 'END') return endSegmentDef
  // Search across all message types, return first match
  for (const msgDef of Object.values(messageDefsByType)) {
    const found = msgDef.segments.find((s) => s.tag === segmentTag)
    if (found) return found
  }
  return null
}
