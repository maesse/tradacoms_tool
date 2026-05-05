# TRADACOMS INVFIL – UK Trade Invoice File Format Specification

> Based on: BIC EDI Standards & Implementation Guidelines for the Book Trade – TRADACOMS File Format Specifications: The Invoice (January 2023, © BIC 2019)

---

## Table of Contents

1. [The Invoice Message](#1-the-invoice-message)
2. [Invoice Message Version Number](#2-invoice-message-version-number)
3. [Use of the Invoice Message](#3-use-of-the-invoice-message)
4. [VAT Procedures](#4-vat-procedures)
5. [Function of the Invoice Message](#5-function-of-the-invoice-message)
6. [VAT on Invoice Line Items](#6-vat-on-invoice-line-items)
7. [Sundry Charges on Invoices](#7-sundry-charges-on-invoices)
8. [Additional Notes](#8-additional-notes)
9. [Example of Invoice Transmission](#9-example-of-invoice-transmission)
10. [Invoice File Header (INVFIL)](#10-invoice-file-header-invfil)
11. [Invoice Message Level Content (INVOIC)](#11-invoice-message-level-content-invoic)
12. [Invoice Order and Delivery References (ODD)](#12-invoice-order-and-delivery-references-odd)
13. [Invoice Line Level Content (ILD, DNC)](#13-invoice-line-level-content-ild-dnc)
14. [Invoice Message Trailer (STL, TLR, MTR)](#14-invoice-message-trailer-stl-tlr-mtr)
15. [Invoice File VAT Trailer (VATTLR)](#15-invoice-file-vat-trailer-vattlr)
16. [Invoice File Trailer (INVTLR)](#16-invoice-file-trailer-invtlr)

---

## 1. The Invoice Message

The Invoice message is **ANA TRADACOMS File Format 8, Version 9**.

### Message Structure

| Message | Name | Segments | Repeat |
|---------|------|----------|--------|
| **INVFIL** | Invoice File Header | MHD, TYP, SDT, CDT, DNA, FIL, FDT, ACD, MTR | One occurrence only, at the start of the file |
| **INVOIC** | Invoice Details | MHD, CLO, IRF, PYT, DNA, ODD, ILD, DNC, STL, TLR, MTR | One occurrence for each invoice |
| **VATTLR** | File VAT Trailer | MHD, VRS, MTR | One occurrence only, after all INVOIC messages |
| **INVTLR** | Invoice File Trailer | MHD, TOT, MTR | One occurrence only, at the end of the file |

### Segment Definitions

| Segment | Full Name | Notes |
|---------|-----------|-------|
| MHD | Message Header | |
| TYP | Transaction Type Details | |
| SDT | Supplier Details | |
| CDT | Customer Details | |
| DNA | Data Narrative | Repeat as necessary at header level |
| FIL | File Details | |
| FDT | File Period Dates | |
| ACD | Audit Control Details | |
| MTR | Message Trailer | |
| CLO | Customer's Location | |
| IRF | Invoice References | |
| PYT | Settlement Terms | Repeat as necessary at invoice level |
| ODD | Order and Delivery References | Repeat for each order in a multiple order invoice |
| ILD | Invoice Line Details | Repeat for each line item |
| DNC | Data Narrative | Repeat if necessary at line level |
| STL | VAT Rate Invoice Sub Trailer | Repeat for each VAT rate in the message |
| TLR | Invoice Trailer | |
| VRS | VAT Rate Summary | Repeat for each VAT rate in the file |
| TOT | File Totals | |

---

## 2. Invoice Message Version Number

The BIC Invoice message version number for implementations which comply with this issue is **T02**. This version number should be sent as DNAC code 206 in the DNA segment in the message file header (INVFIL).

---

## 3. Use of the Invoice Message

A TRADACOMS Invoice message has four principal components:

1. **INVFIL** – the file header message
2. **INVOIC** – the invoice details message (may be repeated as many times as desired)
3. **VATTLR** – the file VAT trailer (occurs once only in each file)
4. **INVTLR** – the file trailer

The Invoice details message has four sections:

1. Invoice "message level" segments: MHD to DNA
2. Invoice "order and delivery references" segment: ODD
3. Invoice "line level" segments: ILD to DNC
4. Invoice "trailer" segments: STL, TLR and MTR

**Rules:**
- Each EDI Invoice must have at least one invoice line (at least one ILD segment)
- An Invoice consisting only of a header and trailer is invalid
- It is possible to send an EDI Invoice in which the only line items are "sundry charges"
- Where a despatch includes items supplied free-of-charge, these should be listed in the Invoice

---

## 4. VAT Procedures

The Invoice message must be used in accordance with the requirements of HM Revenue and Customs.

---

## 5. Function of the Invoice Message

The Invoice message enables a supplier to communicate to a customer a commercial invoice (transaction code **0700** in TYP TCDE) which matches a single delivery and may also serve as a delivery notification.

**Rules:**
- Negative or credit items appearing as lines in the Invoice file format is NOT permitted in BIC practice
- All credit items must be sent separately using the Credit Note format
- When an item is sent free-of-charge as a result of a shortage in a previous delivery, it should always be credited and re-charged, not shown as a "free" item

---

## 6. VAT on Invoice Line Items

Three cases for VAT handling:

### Zero-Rated Product

| Field | Value | Description |
|-------|-------|-------------|
| QTYI | 2 | Quantity |
| AUCT | £5.995 | Unit cost price after discount and excluding VAT |
| LEXC | £11.99 | Extended line cost (rounded up from £11.988) |
| VATC | Z | Zero-rated |
| VATP | 0 | VAT percentage rate |
| MSPR | £9.99 | Manufacturer's recommended selling price |
| BUCT | £9.99 | Unit price before discount and excluding VAT |
| DSCV | £7.99 | Line discount value excluding VAT |
| DSCP | 40% | Discount percentage |

```
ILD=1+6+9780713639040+++1+2+59950+119900+Z+0++++99900++99900+79900+40000'
```

### Standard Rate VAT

| Field | Value | Description |
|-------|-------|-------------|
| QTYI | 2 | Quantity |
| AUCT | £5.10 | Unit cost price after discount and excluding VAT |
| LEXC | £10.20 | Extended line cost: 2 × £5.10 |
| VATC | S | Standard rate VAT |
| VATP | 20 | VAT percentage rate |
| MSPR | £10.20 | Manufacturer's recommended selling price |
| BUCT | £8.50 | Unit price before discount and excluding VAT |
| DSCV | £6.80 | Line discount value excluding VAT |
| DSCP | 40% | Discount percentage |

```
ILD=1+7+9780713639040+++1+2+51000+102000+S+20000++++102000++85000+68000+40000'
```

### Mixed-Rate VAT (e.g., book & cassette pack)

A mixed-rate product uses **three invoice lines**:
1. First line: details for the product/transaction as a whole (MIXI=0)
2. Second line: zero-rated component (MIXI=1)
3. Third line: standard-rate component (MIXI=2)

**Rules:**
- If invoice lines carry a reference to a buyer's order number in RTEX 082, it must appear on the first line
- If invoice lines carry HMRC commodity code in RTEX 982, there should be no commodity code on the first line, but codes on lines 2 and 3
- The monetary amount in the first line must NOT be included in invoice totals

```
ILD=1+32+9780563399104+++1+1+200900+200900+A+0+0+++379900++334900+134000+40000'
ILD=1+33+9780563399104+++1+1+65900+65900+Z+0+1+++++109900+44000+40000'
ILD=1+34+9780563399104+++1+1+135000+135000+S+20000+2+++++225000+90000+40000'
```

**Rounding rule:** ≤ 0.4p – rounded down, >0.4p – rounded up

---

## 7. Sundry Charges on Invoices

Two approaches:

### a) Invoice-Level Charges
Additional lines at the end of the invoice detail section carrying a charge code from **Code List 205** in place of the product code (ISBN) in ILD/SPRO. Must be coded **G** in ILD/IGPI.

### b) Line-Level Charges
Additional lines immediately following the invoice line to which they relate. Must be coded **I** in ILD/IGPI.

> **Deprecated:** Using STL/SURA for a single unspecified "below the line" surcharge should NOT be used.

### ILD Fields for Sundry Charges

| Field | Usage |
|-------|-------|
| ILD SPRO | Must carry a charge code from Code List 205 (e.g., Z13 = postage and packing) |
| ILD SACU | Do not use |
| ILD CPRO | Do not use |
| ILD UNOR | Do not use |
| ILD QTYI | Mandatory, always 1 for a single monetary amount charge |
| ILD AUCT | Mandatory: unit cost / whole charge amount |
| ILD LEXC | Mandatory: AUCT × QTYI |
| ILD VATC/VATP/MIXI | Follow same rules as any other invoice line |
| ILD CRLI | Do not use |
| ILD TDES | May carry text description (recommended to omit) |
| ILD MSPR/SRSP/BUCT/DSCV/DSCP/SUBA/PIND | Do not use |
| ILD IGPI | Must carry **G** (charge applied at invoice level) |
| ILD CSDI/TSUP/SCRF | Do not use |

Example:
```
ILD=1+1+:Z13++++1+75000+75000+Z+0++++++++++G'
```
Postage and packing £7.50

---

## 8. Additional Notes

### 8.1 Multiple Order Deliveries

- One delivery note → one invoice
- One order may result in more than one delivery, each with a separate delivery note and invoice
- Multiple orders may lead to one delivery → one delivery note → one invoice
- In multi-order case: one ODD segment per order, line details linked by sequence number

### 8.2 File Period Dates

No fixed rule about the period — should be agreed between exchange partners.

### 8.3 Credit Lines on Invoices

Credit lines in Invoices are **not used** in book trade practice.

### 8.4 Supplier and Customer Details (SDT and CDT)

The supplier and customer details reported in INVFIL must be those relating to the **VAT identity** of the invoicer (SDT) and invoicee (CDT). These may not be the physical locations of supply or receipt.

### 8.5 VAT Numbers for Supplier and Customer

- Each invoice file must be between two VAT entities
- If a supplier/customer has more than one VAT number, separate invoice files are needed for each identity
- Each VAT identity should have a unique EAN (GLN) location number
- VATN in SDT has an additional sub-element for non-UK numeric VAT numbers
- CDT has an additional element VATR for customer's VAT number
- The X(17) element is used to contain the 2-digit alpha country code and VAT number (e.g., "GB987654321")

### 8.6 Use of ISBN and RTEX 971 in Packs

For composite packs whose components all carry the same VAT rate: use the ISBN for the pack, and use RTEX 971 to identify component items.

### 8.7 Use of Book Industry Commodity Codes in DNC/RTEX

BIC recommends adding Commodity Codes in DNC/RTEX using the HMRC commodity codes list.

### 8.8 Control Totals

#### STL Segment (one per VAT rate)
```
LVLA = Σ LEXC
EVLA = LVLA - QYDA - VLDA + SURA - SSUB
SEDA is calculated from the sum of those lines (EVLA) which attract settlement discount
ASDA = EVLA - SEDA
VATA is calculated from VATP applied to ASDA
APSE = EVLA + VATA
APSI = ASDA + VATA
```

#### TLR Segment
```
LVLT = Σ LVLA = Σ LEXC
EVLT = Σ EVLA
SEDT = Σ SEDA
ASDT = Σ ASDA
TVAT = Σ VATA
TPSE = Σ APSE
TPSI = Σ APSI
TPSI - TPSE = ASDT - EVLT = SEDT
```

#### VRS Segment (one per VAT rate)
```
VSDE = Σ EVLA
VSDI = Σ ASDA
VVAT = Σ VATA
VPSE = Σ APSE
VPSI = Σ APSI
VPSI - VPSE = VSDI - VSDE
```

#### TOT Segment
```
FASE = Σ VSDE = Σ EVLT = Σ EVLA
FASI = Σ VSDI = Σ ASDT = Σ ASDA
FVAT = Σ VVAT = Σ TVAT = Σ VATA
FPSE = Σ VPSE = Σ TPSE = Σ APSE
FPSI = Σ VPSI = Σ TPSI = Σ APSI
FPSI - FPSE = FASI - FASE
```

---

## 9. Example of Invoice Transmission

> Note: for clarity each segment is shown on a new line. In reality there are no carriage returns or line feeds within or at the end of a segment.

This example shows an Original Invoice: Publisher to Bookseller, containing 1 invoice line.

```
STX=ANAA:1+5023456789541:XYZ PUBLISHER+5098765432156:ABC BOOKSELLERS+070430:104133+9++INVFIL'
MHD=1+INVFIL:9'
TYP=0700'
SDT=5023456789541'
CDT=5098765432156+ABC BOOKSELLERS+STREET HOUSE:HIGH STREET:NEWTOWN:NT3 4TS'
DNA=1+206:T02'
DNA=2+207:005'
FIL=25+1+070430'
MTR=8'
MHD=2+INVOIC:9'
CLO=5012345678954'
IRF=847077+070331+070331'
PYT=1+070430+30'
ODD=1+454546:0023036011:070331:070331+0001447930:070331'
ILD=1+1+9780091888972+++1+15+80197+1202900+Z+0++++149900++149900+1045600+46500'
DNC=1+1+1++082:XYZ009988'
STL=1+Z+0+1+12029+++++12029++12029+0++12029'
TLR=1+12029+++++12029++12029+0++12029'
MTR=10'
MHD=3+INVTLR:9'
TOT=12029+12029+0++12029+1'
MTR=3'
MHD=4+RSGRSG:2'
RSG=9+5098765432156'
MTR=3'
END=4'
```

### Segment-by-Segment Explanation

| Segment | Description |
|---------|-------------|
| STX | Start of transmission: sender's EAN/GLN = supplier's in SDT |
| MHD=1+INVFIL:9 | Message 1: invoice file header |
| TYP=0700 | Transaction code 'original invoice' |
| SDT | Publisher's EAN/GLN number |
| CDT | Bookseller's EAN/GLN + name and address (required by HMRC) |
| DNA=1+206:T02 | BIC message version number T02 |
| DNA=2+207:005 | BIC Code version number 005 |
| FIL=25+1+070430 | File generation 25, file version 1, 30 April 2007 |
| MTR=8 | End of message 1: 8 segments |
| MHD=2+INVOIC:9 | Message 2: Invoice message |
| CLO | Delivery location, EAN/GLN number |
| IRF | Invoice number, date of invoice, tax-point date |
| PYT | Payment date 30 April 2007, terms 30 days from date of invoice |
| ODD | Order & Delivery reference: customer's order number, supplier's order number, dates, delivery note number |
| ILD | Invoice line: ISBN-13, 15 copies, unit cost £8.0197, line cost £120.29, zero-rated |
| DNC | Customer order line reference |
| STL | VAT at zero rate; 1 item line; sub-total £120.29; VAT £0; payable £120.29 |
| TLR | Invoice trailer: totals |
| MTR=10 | End of message 2: 10 segments |
| MHD=3+INVTLR:9 | Message 3: invoice file trailer |
| TOT | File totals |
| MTR=3 | End of message 3 |
| MHD=4+RSGRSG:2 | Message 4: reconciliation message |
| END=4 | End of transmission: 4 messages |

---

## 10. Invoice File Header (INVFIL)

Each Invoice file begins with a file header INVFIL.

### MHD – Message Header

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = MSRF | Message reference | M V | 9(12) | Consecutive count of messages within the file: start at 1, increment by 1 |
| + TYPE | Type of message | M | | |
| + Type | | M F | X(6) | Always `INVFIL` |
| : Version no | | M F | 9(1) | Always `9` |

Example: `MHD=1+INVFIL:9'`

### TYP – Transaction Type Details

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = TCDE | Transaction code | M F | 9(4) | Code List 2. Only BIC authorised values: `0700` (Original invoice – VAT invoice), `0709` (Copy invoice – not for VAT purposes) |
| + TTYP | Transaction type | C V | X(12) | Do not use: redundant |

Example: `TYP=0700'`

### SDT – Supplier Details

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| SIDN | Supplier's identity | M | | Either GLN or alternative code (or both) must be sent |
| = | Supplier's EAN location number | C F | 9(13) | EAN location number (GLN) |
| : | Supplier's identity allocated by customer | C V | X(17) | Alternative supplier code |
| + SNAM | Supplier's name | C V | X(40) | Legal name as printed on invoices. Required by HMRC unless code method approved. |
| + SADD | Supplier's address | C | | Max 5 lines. Required by HMRC unless code method approved. |
| + | Address line 1 | C V | X(35) | |
| : | Address line 2 | C V | X(35) | |
| : | Address line 3 | C V | X(35) | |
| : | Address line 4 | C V | X(35) | |
| : | Post code | C V | X(8) | |
| VATN | Supplier's VAT registration no | C | | Mandatory even if whole invoice is zero-rated |
| + | VAT number – numeric | C F | 9(9) | UK VAT number from HMRC |
| : | VAT number – alphanumeric | C V | X(17) | Non-UK or with country code (GB) |

Example: `SDT=5012345678987+ABC Book Services Ltd+ABC Trading Estate:ABC:::TW25 0XY+987654321+GB987654321'`

### CDT – Customer Details

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| CIDN | Customer's identity | M | | |
| = | Customer's EAN location no | C F | 9(13) | EAN location number (GLN). Strongly recommended. |
| : | Customer's identity allocated by supplier | C V | X(17) | Alternative code, may be customer's SAN |
| + CNAM | Customer's name | C V | X(40) | Registered legal name. Required by HMRC. |
| + CADD | Customer's address | C | | Max 5 lines. Required by HMRC. |
| + | Address line 1 | C V | X(35) | |
| : | Address line 2 | C V | X(35) | |
| : | Address line 3 | C V | X(35) | |
| : | Address line 4 | C V | X(35) | |
| : | Post code | C V | X(8) | |
| VATR | Customer's VAT registration no | C | | Required only for supply to customer in different EU country |
| + | VAT registration no – numeric | C F | 9(9) | UK VAT number |
| : | VAT registration no – alphanumeric | C V | X(17) | Non-UK or with country code |

Example: `CDT=5098765432123+XYZ Bookshop+234 High Street:XYZ:::XY1 5AB'`

### DNA – Data Narrative (File Header Level)

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = SEQA | First level sequence number | M V | 9(10) | Starts at 1, incremented by 1 for each repeat |
| DNAC | Data narrative code | C | | Use only for BIC message and code list version |
| + | Code table number | C V | 9(4) | `206` = BIC message version (T02), `207` = BIC code list version |
| : | Code value | C V | X(3) | Code value from code list |
| RTEX | Registered text | C | | Only RTEX code `073` (Currency code) may be used here |
| + | 1st registered application code | C V | X(3) | |
| : | Application text | C V | X(40) | |
| : | 2nd registered application code | C V | X(3) | |
| : | Application text | C V | X(40) | |
| : | 3rd registered application code | C V | X(3) | |
| : | Application text | C V | X(40) | |
| : | 4th registered application code | C V | X(3) | |
| : | Application text | C V | X(40) | |
| GNAR | General narrative | C | | Do not use |
| + | Line 1 | C V | X(40) | |
| : | Line 2 | C V | X(40) | |
| : | Line 3 | C V | X(40) | |
| : | Line 4 | C V | X(40) | |

Examples:
```
DNA=1+206:T02'    (INVOIC version T02)
DNA=2+207:005'    (BIC code lists issue 005)
```

### FIL – File Details

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = FLGN | File generation number | M V | 9(4) | Sequential for each successive Invoice file exchanged between partners |
| + FLVN | File version number | M V | 9(4) | Retransmission indicator. Original is always `1`. |
| + FLDT | File creation date | M F | 9(6) | Format: YYMMDD |
| + FLID | File (reel) identification | C V | X(6) | Do not use (only for magnetic media) |

Example: `FIL=1207+1+070302'` (file sequence 1207, original transmission, created 2 March 2007)

### MTR – Message Trailer

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = NOSG | Number of segments in message | M V | 9(10) | Count includes MHD and MTR segments |

Example: `MTR=8'` (eight segments, including two occurrences of DNA)

### Complete File Header Example

```
MHD=1+INVFIL:9'
TYP=0700'
SDT=5012345678987+ABC Book Services Ltd+ABC Trading Estate:ABC:::TW25 0XY+987654321'
CDT=5098765432123+XYZ Bookshop+234 High Street:XYZ:::XY1 5AB'
DNA=1+206:T02'
DNA=2+207:005'
FIL=4125+1+070302'
MTR=8'
```

---

## 11. Invoice Message Level Content (INVOIC)

Each invoice message begins with "message level" segments MHD to DNA.

### MHD – Message Header

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = MSRF | Message reference | M V | 9(12) | Consecutive count of messages within the file |
| + TYPE | Type of message | M | | |
| + Type | | M F | X(6) | Always `INVOIC` |
| : Version number | | M F | 9(1) | Always `9` |

Example: `MHD=2+INVOIC:9'`

### CLO – Customer's Location

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| CLOC | Customer's location | M | | One of three references must be present |
| = | Customer's EAN location number | C F | 9(13) | EAN location number (GLN) |
| : | Customer's own location code | C V | X(17) | Branch or department code |
| : | Supplier's identification of customer's location | C V | X(17) | Supplier's reference / SAN |
| + CNAM | Customer's name | C V | X(40) | Not recommended – coded ID is sufficient |
| + CADD | Customer's address | C | | Not recommended – coded ID is sufficient |
| + | Address line 1 | C V | X(35) | |
| : | Address line 2 | C V | X(35) | |
| : | Address line 3 | C V | X(35) | |
| : | Address line 4 | C V | X(35) | |
| : | Post code | C V | X(8) | |

### IRF – Invoice References

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = INVN | Invoice number | M V | X(17) | Invoice number allocated by supplier |
| + IVDT | Date of invoice | M F | 9(6) | Format: YYMMDD |
| + TXDT | Tax-point date | M F | 9(6) | Format: YYMMDD |

Example: `IRF=517539+070123+070123'`

### PYT – Settlement Terms

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = SEQA | First level sequence number | M V | 9(10) | Starts at 1, incremented by 1 |
| + PAYT | Terms of payment | C V | X(40) | Text description: **do not use** |
| PAYD | Payment date and terms | C | | |
| + | Payment date | M F | 9(6) | Date payment should be available |
| : | Settlement discount % | M V | 9(3)V9(3) | Percentage discount. Use `0` if none. |
| PAYY | Settlement terms | C | | |
| + | Number of days | M V | 9(3) | Calendar days after reference date |
| : | Settlement discount percentage | C V | 9(3)V9(3) | |
| : | Settlement code | C V | X(3) | User-defined code |

**BIC recommends either:**
- `PYT=1+++30'` (payment terms as number of days)
- `PYT=1++060930:0'` (payment terms as a fixed date)

Example: `PYT=1++30'` (payment 30 days from date of invoice)

### DNA – Data Narrative (Invoice Level)

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = SEQA | First level sequence number | M V | 9(10) | Starts at 1 |
| DNAC | Data narrative code | C | | No DNAC codes allocated for this segment |
| + | Code table number | C V | 9(4) | |
| : | Code value | C V | X(3) | |
| RTEX | Registered text | C | | Valid RTEX codes: `978` (Cancelled invoice number), `979` (Supplier's internal code), `984` (Cancelled credit note number) |
| + | 1st registered application code | C V | X(3) | |
| : | Application text | C V | X(40) | |
| : | 2nd registered application code | C V | X(3) | |
| : | Application text | C V | X(40) | |
| : | 3rd registered application code | C V | X(3) | |
| : | Application text | C V | X(40) | |
| : | 4th registered application code | C V | X(3) | |
| : | Application text | C V | X(40) | |
| GNAR | General narrative | C | | Do not use |

---

## 12. Invoice Order and Delivery References (ODD)

### ODD – Order and Delivery References

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = SEQA | First level sequence number | M V | 9(10) | Starts at 1, incremented by 1 |
| ORNO | Order number and date | M | | |
| + | Customer's order number | C V | X(17) | As allocated by customer |
| : | Supplier's order number | C V | X(17) | As allocated by supplier |
| : | Date order placed by customer | C F | 9(6) | YYMMDD. Not required if order number sent. |
| : | Date order received by supplier | C F | 9(6) | YYMMDD |
| DELN | Delivery note details | M | | Either/both delivery note number and/or despatch date must be sent |
| + | Delivery note number | C V | X(17) | Allocated by supplier. N/A if Invoice is the delivery notification. |
| : | Date of document | C F | 9(6) | YYMMDD. Date of despatch where appropriate. |
| + NODU | Number of delivery or uplift units | C V | 9(15) | Estimated number of packages (only if Invoice is itself the delivery notification) |
| DEWT | Delivery weights | C | | |
| + | Vehicle tare weight | C V | 9(10)V9(3) | Do not use |
| : | Total goods weight | C V | 9(10)V9(3) | In kilos. Total weight of consignment. |
| + PODN | Proof of delivery details | C | | Do not use |
| + SCAR | Name of carrier | C | | Do not use |
| + DLOC | Despatch location | C | | Do not use |
| + TLOC | Transhipment location | C | | Do not use |
| + JORF | Journey reference | C | | Do not use |
| SCRF | Specification/Contract references | C | | |
| + | Specification number | C V | X(17) | Do not use |
| : | Contract number | C V | X(17) | Special deal or promotion reference. Use "/" as delimiter between contract and promotion number. |

Examples:
```
ODD=1+95TD0137+:070123+2+:38600'
ODD=1+96TD0148+137042:070120'
```

---

## 13. Invoice Line Level Content (ILD, DNC)

### ILD – Invoice Line Details

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = SEQA | First level sequence number | M V | 9(10) | Same value as corresponding ODD segment |
| + SEQB | Second level sequence number | M V | 9(10) | Starts at 1, incremented by 1. Invoice line number. |
| SPRO | Supplier's product number | M | | Must match Order, except for: (a) zero-code ordered by description, (b) substituted items, (c) charge codes from Code List 205 |
| + | EAN-13 article number | C F | 9(13) | "Bookland" EAN-13 or ISBN-13 |
| : | Supplier's code for traded unit | C V | X(30) | ISBN-10 (deprecated from Jan 2007) or charge code from Code List 205 |
| : | DUN-14 code | C F | 9(14) | Do not use |
| + SACU | Supplier's EAN for consumer unit | C F | 9(13) | Do not use |
| CPRO | Customer's product number | C | | Do not use |
| + | Customer's own brand EAN | C F | 9(15) | |
| : | Customer's item code | C V | X(30) | |
| UNOR | Unit of ordering | C | | |
| + | Consumer units in traded unit | C V | 9(15) | Always 1 in book supply |
| : | Ordering measure | C V | 9(10)V9(3) | Do not use |
| : | Measure indicator | C V | X(6) | Do not use |
| QTYI | Quantity invoiced | M | | |
| + | Number of traded units invoiced | C V | 9(15) | Mandatory: number of copies invoiced |
| : | Total measure ordered | C V | 9(10)V9(3) | Do not use |
| : | Measure indicator | C V | X(6) | Do not use |
| AUCT | Unit cost price (excl. VAT) | M | | Customer price per unit including discount |
| + | Cost price | M V | 9(10)V9(4) | Net unit cost in pounds (after discounts, before VAT). Always 4 decimal places. |
| : | Measure indicator | C V | X(6) | Do not use |
| + LEXC | Extended line cost (excl. VAT) | M V | 9(10)V9(4) | Total line cost after discounts, before VAT. Always 4 decimal places. |
| + VATC | VAT Rate category code | M F | X(1) | Code List 12 |
| + VATP | VAT Rate percentage | M V | 9(3)V9(3) | |
| + MIXI | Mixed VAT Rate product indicator | C F | 9(1) | `0` = product as a whole, `1` = zero-rated component, `2` = standard-rate component |
| + CRLI | Credit Line indicator | C V | X(4) | Do not use |
| TDES | Traded unit description | C | | Use for substituted items or description-only orders |
| + | Description line 1 | C V | X(40) | Author |
| : | Description line 2 | C V | X(40) | Title |
| MSPR | Selling on price | C | | |
| + | Manufacturer's recommended selling price | C V | 9(10)V9(4) | Price in pounds. Required in book trade practice. 4 decimal places. |
| : | Marked price | C V | 9(10)V9(4) | Do not use |
| : | Split pack price | C V | 9(10)V9(4) | Do not use |
| + SRSP | Statutory retail selling price | C V | 9(10)V9(4) | Do not use |
| + BUCT | Unit cost price (excl. VAT) before discount | C V | 9(10)V9(4) | Required in book trade practice. 4 decimal places. |
| + DSCV | Discount value | C V | 9(10)V9(4) | Line discount value in pounds. Required. 4 decimal places. |
| + DSCP | Discount percentage | C V | 9(3)V9(3) | Required in book trade practice |
| + SUBA | Subsidy amount | C V | 9(10)V9(4) | Do not use |
| + PIND | Special Price indicator | C V | X(4) | Code List 5. If `F` = free of charge, all monetary values carry zeros. |
| + IGPI | Item Group identifier | C V | X(4) | Code List 10. `I` = line-level charge, `G` = invoice-level charge |
| + CSDI | Cash settlement discount identifier | C F | X(1) | Do not use |
| + TSUP | VAT – Type of supply | C F | X(1) | Code List 14. Omitted for normal sale. |
| SCRF | Specification/Contract references | C | | |
| + | Specification number | C V | X(17) | Do not use |
| : | Contract number | C V | X(17) | Special deal or promotion reference |

#### AUCT/LEXC Calculation Rules

- **If trading based on agreed unit cost:** LEXC = AUCT × QTYI
- **If trading based on normal book trade practice:** LEXC = BUCT × QTYI × (100 – DSCP)/100, then AUCT = LEXC / QTYI (using all 4 decimal places)

#### Monetary Value Encoding

All monetary values use 4 decimal places (implied). E.g., £12.99 = `129900`, £13.924 = `139240`.

### DNC – Data Narrative (Line Level)

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = SEQA | First level sequence number | M V | 9(10) | Must match ODD/SEQA |
| + SEQB | Second level sequence number | M V | 9(10) | Must match ILD/SEQB |
| + SEQC | Third level sequence number | M V | 9(10) | Starts at 1, incremented by 1 for each repeat |
| DNAC | Data narrative code | C | | |
| + | Code table number | C V | 9(4) | Only: BIC list 203 (Order qualifier: BIC, FMS, SLR, SSF) |
| : | Code value | C V | X(3) | |
| RTEX | Registered text | C | | Up to 4 RTEX elements per segment |
| + | 1st registered application code | C V | X(3) | |
| : | Application text | C V | X(40) | |
| : | 2nd registered application code | C V | X(3) | |
| : | Application text | C V | X(40) | |
| : | 3rd registered application code | C V | X(3) | |
| : | Application text | C V | X(40) | |
| : | 4th registered application code | C V | X(3) | |
| : | Application text | C V | X(40) | |
| GNAR | General narrative | C | | Do not use |

#### Valid RTEX Codes in DNC

| Code | Description |
|------|-------------|
| 073 | Currency code, format X(3) (ANA list 31). Overrules file-level currency. |
| 082 | Order line reference (buyer's unique order line number). Must be included if given in Order message. |
| 314 | Binder's pack quantity (variable-length integer) |
| 971 | Component items of dumpbin or pack |
| 980 | SOR number (unconditional sale-or-return deal reference) |
| 982 | HMRC commodity code |

**Mixed-Rate VAT DNC rule:** For a mixed-rate VAT item (3 ILD segments), there should be only one DNC segment, located after the 3rd ILD segment.

Example: `DNC=1+1+1++082:06GH1473'` (Customer order line reference 06GH1473)

---

## 14. Invoice Message Trailer (STL, TLR, MTR)

### STL – VAT Rate Invoice Sub-Trailer

Repeated for each 'real' VAT rate appearing in the invoice message. VAT rate codes S and Z are relevant; A (mixed rate) is NOT a separate rate since its components are covered under S and Z.

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = SEQA | First level sequence number | M V | 9(10) | Starts at 1 |
| + VATC | VAT Rate category code | M F | X(1) | Code List 12: `S` (Standard), `Z` (Zero-rated/Export), `O` (Outside scope) |
| + VATP | VAT Rate percentage | M V | 9(3)V9(3) | Percentage for the VAT rate category |
| + NRIL | Number of item lines | M V | 9(10) | Count of ILD segments with this VAT code (including mixed-rate components) |
| + LVLA | Line sub-total amount (before VAT) | M V | 9(10)V9(2) | Σ LEXC for this VAT code |
| + QYDA | Discount amount for invoice quantity | C V | 9(10)V9(2) | Not used in book trade practice |
| + VLDA | Discount amount for invoice value | C V | 9(10)V9(2) | Not used in book trade practice |
| + SURA | Surcharge amount | C V | 9(10)V9(2) | Do not use |
| + SSUB | Sub-total subsidy | C V | 9(10)V9(2) | Do not use |
| + EVLA | Extended sub-total amount (before settlement discount) | M V | 9(10)V9(2) | = LVLA – QYDA – VLDA + SURA – SSUB (or = LVLA if others unused) |
| + SEDA | Sub-total settlement discount amount | C V | 9(10)V9(2) | Only if payment terms include settlement discount |
| + ASDA | Extended sub-total amount (after settlement discount) | M V | 9(10)V9(2) | = EVLA – SEDA (or = EVLA if no settlement discount) |
| + VATA | VAT amount payable | M V | 9(10)V9(2) | = VATP applied to ASDA |
| + APSE | Payable sub-total (before settlement discount) | C V | 9(10)V9(2) | = EVLA + VATA. Only if settlement discount applies. |
| + APSI | Payment sub-total (after settlement discount) | M V | 9(10)V9(2) | = ASDA + VATA |

Examples:
```
STL=1+S+17500+3+4325+++++4325++4325+757++5082'
STL=2+Z+0+12+34567+++++34567++34567+0++34567'
```

### TLR – Invoice Trailer

One occurrence mandatory at end of each invoice message. Carries totals for the invoice as a whole.

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = NSTL | Number of total segments | M V | 9(10) | Number of STL segments in message |
| + LVLT | Lines total amount (before settlement discount) | M V | 9(10)V9(2) | Σ LVLA |
| + QYDT | Total discount amount for invoice quantity | C V | 9(10)V9(2) | Σ QYDA. Not used in book trade. |
| + VLDT | Total discount amount for invoice value | C V | 9(10)V9(2) | Σ VLDA. Not used in book trade. |
| + SURT | Total surcharge amount | C V | 9(10)V9(2) | Do not use |
| + TSUB | Total subsidy amount | C V | 9(10)V9(2) | Do not use |
| + EVLT | Total extended amount (before settlement discount) | M V | 9(10)V9(2) | Σ EVLA |
| + SEDT | Total settlement discount amount | C V | 9(10)V9(2) | Σ SEDA |
| + ASDT | Total amount (after settlement discount) | M V | 9(10)V9(2) | Σ ASDA |
| + TVAT | Total VAT amount payable | M V | 9(10)V9(2) | Σ VATA |
| + TPSE | Total payable (before settlement discount) | C V | 9(10)V9(2) | Σ APSE. Only if settlement discount applies. |
| + TPSI | Total payable (after settlement discount) | M V | 9(10)V9(2) | Σ APSI. Final total payable including VAT. |

Example:
```
TLR=2+38892+++++38892++38892+757++39649'
```

### MTR – Message Trailer

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = NOSG | Number of segments in message | M V | 9(10) | Includes MHD and MTR |

Example: `MTR=54'`

---

## 15. Invoice File VAT Trailer (VATTLR)

### MHD – Message Header

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = MSRF | Message reference | M V | 9(12) | Consecutive count |
| + TYPE | Type | M F | X(6) | Always `VATTLR` |
| : | Version number | M F | 9(1) | Always `9` |

Example: `MHD=5+VATTLR:9'`

### VRS – VAT Rate Summary

Repeated for each different 'real' VAT rate in the file. Mixed rate A is not a 'real' rate.

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = SEQA | First level sequence number | M V | 9(10) | Starts at 1 |
| + VATC | VAT Rate category code | M F | X(1) | `S`, `Z`, or `O` |
| + VATP | VAT Rate percentage | M V | 9(3)V9(3) | |
| + VSDE | File sub-total amount (before settlement discount) | M V | 9(10)V9(2) | Σ EVLA across all STL with this VAT code |
| + VSDI | File sub-total amount (after settlement discount) | M V | 9(10)V9(2) | Σ ASDA across all STL with this VAT code |
| + VVAT | File VAT sub-total | M V | 9(10)V9(2) | Σ VATA across all STL with this VAT code |
| + VPSE | File sub-total payable (before settlement discount) | C V | 9(10)V9(2) | Σ APSE. Only if settlement discount applies. |
| + VPSI | File sub-total payable (after settlement discount) | M V | 9(10)V9(2) | Σ APSI across all STL with this VAT code |

Examples:
```
VRS=1+S+17500+4325+4325+757++5082'
VRS=2+Z+0+34567+34567+0++34567'
```

### MTR – Message Trailer

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = NOSG | Number of segments in message | M V | 9(10) | Includes MHD and MTR |

Example: `MTR=3'`

---

## 16. Invoice File Trailer (INVTLR)

### MHD – Message Header

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = MSRF | Message reference | M V | 9(12) | Consecutive count |
| + TYPE | Type | M F | X(6) | Always `INVTLR` |
| : | Version number | M F | 9(1) | Always `9` |

Example: `MHD=5+INVTLR:9'`

### TOT – File Totals

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = FASE | File total amount (before VAT and settlement discount) | M V | 9(10)V9(2) | Σ VSDE |
| + FASI | File total amount (before VAT, after settlement discount) | M V | 9(10)V9(2) | Σ VSDI |
| + FVAT | File total VAT amount | M V | 9(10)V9(2) | Σ VVAT |
| + FPSE | File total payable (after VAT, before settlement discount) | C V | 9(10)V9(2) | Σ VPSE. Only if settlement discount applies. |
| + FPSI | File total payable (after VAT and settlement discount) | M V | 9(10)V9(2) | Σ VPSI |
| + FTNI | File total number of invoice messages | M V | 9(10) | Total Invoice messages in file |

Example: `TOT=38892+38892+757++39649+15'`

### MTR – Message Trailer

| Field | Name | M/C | Format | Description |
|-------|------|-----|--------|-------------|
| = NOSG | Number of segments in message | M V | 9(10) | Includes MHD and MTR |

Example: `MTR=3'`

---

## Appendix: TRADACOMS Syntax Reference

### Segment Separator
- Segments are terminated with a single quote `'`

### Element Separators
- `=` separates the segment tag from the first data element
- `+` separates data elements
- `:` separates sub-elements (components within a data element)

### Data Types
- `9(n)` – Numeric, n digits
- `9(n)V9(m)` – Numeric with implied decimal point: n integer digits, m decimal digits
- `X(n)` – Alphanumeric, up to n characters

### Mandatory/Conditional Indicators
- `M` – Mandatory
- `C` – Conditional (optional)

### Fixed/Variable Indicators
- `F` – Fixed length
- `V` – Variable length

### VAT Rate Category Codes (Code List 12)

| Code | Description |
|------|-------------|
| A | Mixed rate (combination of S and Z) |
| S | Standard rate |
| Z | Zero-rated |
| O | Outside scope of VAT |
| E | Exempt (not used in UK book trade) |

### Transmission Envelope

Messages are wrapped in STX (Start of Transmission) and END (End of Transmission) segments:

```
STX=ANAA:1+<sender GLN>:<sender name>+<recipient GLN>:<recipient name>+<date>:<time>+<reference>++<application>'
...messages...
END=<message count>'
```
