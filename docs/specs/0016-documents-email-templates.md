# 0016. Printable documents and emails

**Date**: 2026-10-18
**Status**: Proposed

## Summary

Invoices, quotes, POs, pick lists, packing slips, and labels as PDFs, plus emailing invoices and receipts from editable templates. Blocks sends mail with templates and attachments and stores files, which covers the email side. Blocks does not make PDFs, so PDFs are made in the browser and uploaded to Blocks storage before they are attached.

## Context

PRD SO-7, SET-3, SET-7 (labels, P1). Depends on orders (0011, 0012) and company settings (0004).

## Requirements

**Acceptance criteria**:
- **AC-1**: Each document type (invoice, quote, PO, pick list, packing slip) renders as a PDF from a company template with logo and chosen fields.
- **AC-2**: Marking an order invoiced records the invoice date; the invoice can be emailed with the PDF attached.
- **AC-3**: Email templates (subject and body with placeholders) are editable per document type.
- **AC-4**: Each sent document is stored and linked to its order.
- **AC-5**: Paid plans can remove product branding from documents. (spec 0023)
- **AC-6**: Barcode labels print on normal printers and Bluetooth label printers. (P1)

## Options considered

### Option 1: Browser made PDFs, uploaded to storage, sent with Blocks mail
**Pros**: no backend; documented mail and storage. **Cons**: PDF quality depends on the browser library.

### Option 2: Workflow calls an external PDF service
**Pros**: server side, consistent output. **Cons**: another paid service and secret.

## Decision

**Chosen option**: Option 1. Option 2 stays a fallback if browser PDFs fall short.

**Implementation skills**: `blocks-mail`, `blocks-data-storage`, `blocks-secrets` (only for Option 2).

## Rationale

Blocks mail accepts storage file ids as attachments, so a browser made PDF uploaded to storage completes the flow without any server.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| SO-7, SET-3 | PDFs from templates | none in Blocks; browser library | ⚠️ Can do in browser |
| SO-7 | Email invoice with PDF | `mail.send` with attachments, mail templates | ✅ Can do |
| SET-3 | Editable email templates | `blocks mail template` (CLI) for system templates; company text stored in `DocumentTemplate` | ⚠️ Mail templates are project wide, not per company; per company text needs placeholders filled in app |
| AC-4 | Store sent documents | `blocks-data-storage` | ✅ Can do |
| SET-7 | Labels, Bluetooth printers | Browser and device printing | ⚠️ Outside Blocks; device support varies |

## Feature design

**Data model sketch**:
- `DocumentTemplate`: `documentType` req (unique per org), `logoFileId`, `fields` String array, `footerText`, `emailSubject`, `emailBody`, `hideBranding` Boolean.
- Order documents get `documentFileIds` array (spec 0011, 0012).

**API surface**: `renderPdf(order, template)` in browser → `data.files` upload → `mail.send({ to, template, bodyDataContext, attachments: [fileId] })`.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Render | company details | `Company` (spec 0004) |
| Email | recipient | order contact or customer email |
| Email | body | `DocumentTemplate.emailBody` with order placeholders |

**Key invariants**: a sent invoice PDF is never changed; a new version is a new file.

**Security model**: send needs Sales Order Edit; templates need Settings Edit.

**Critical test scenarios**:
- Happy path: invoice an order, email it, customer gets the PDF, verifies **AC-1**, **AC-2**
- Failure case: mail send fails and the user sees a retry, nothing marked sent, verifies **AC-2**
- Storage: the sent PDF is linked on the order, verifies **AC-4**

## Build plan

1. `DocumentTemplate` schema and editor, satisfies **AC-3**, **AC-5**
2. Browser PDF rendering for the five document types, satisfies **AC-1**
3. Upload and email flow, satisfies **AC-2**, **AC-4**
4. P1: label printing, satisfies **AC-6**

## Consequences

**Positive**: no server needed.
**Negative / tradeoffs**: PDFs are made in the browser; per company email templates are filled in the app.
**Neutral**: mail server configuration (SMTP) is set once per project.

## Follow-up

- [ ] Check the 7 mail templates the project reports (the list came back empty on 2026-10-18).
