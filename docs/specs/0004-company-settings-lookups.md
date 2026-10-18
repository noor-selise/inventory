# 0004. Company settings, currencies, numbering and lookup lists

**Date**: 2026-10-18
**Status**: Proposed

## Summary

Each company sets its profile, home currency, exchange rates, document number formats, payment terms, taxing schemes, adjustment reasons, carriers, and payment methods. These are plain records on Blocks and are easy to build. The one weak spot is running document numbers (SO-0001, SO-0002): Blocks can stop duplicates with a unique index, but it has no counter, so two orders saved at the same moment can collide and one must retry.

## Context

PRD SET-1, SET-2, SET-5, §5.5 (tax), §5.6 (defaults, uniqueness), NFR localization. These lookups are read by almost every other feature (orders, products, reports), so they come early. The DB design leaves most of them out of the diagram.

## Requirements

**User stories**:
- As an owner, I want to set my company profile, home currency, and other currencies with exchange rates.
- As an owner, I want my own document number formats per type, like `SO-` plus five digits.
- As an owner, I want to manage payment terms, taxing schemes, carriers, adjustment reasons, and payment methods.

**Acceptance criteria**:
- **AC-1**: An owner edits the company profile (name, address, time zone, home currency, date format).
- **AC-2**: An owner adds currencies and sets an exchange rate manually with an effective date.
- **AC-3**: Each document type has a prefix and padded sequence; a new document gets the next number, and no two documents of the same type in a company share a number.
- **AC-4**: Payment terms (name, days due) are listed, added, edited, deactivated.
- **AC-5**: A taxing scheme has up to two components, each with a rate, an optional "compound on tax 1" flag, and an "applies to shipping" flag; tax codes give per product rates.
- **AC-6**: Exactly one default exists per company for taxing scheme (and for location, category, pricing scheme in their own specs).
- **AC-7**: Adjustment reasons, carriers, and payment methods are editable lists, and system reasons cannot be deleted.
- **AC-8**: Money shows in each currency's own format (decimals, symbol, negatives), dates in the company time zone.

## Options considered

### Option 1: One schema per lookup list

`Company`, `Currency`, `ExchangeRate`, `NumberingRule`, `PaymentTerm`, `TaxingScheme`, `TaxCode`, `AdjustmentReason`, `Carrier`, `PaymentMethod`.

**Pros**:
- Clear queries and indexes per list; unique indexes per list.

**Cons**:
- Many small schemas (each needs access rules).

### Option 2: One generic `Lookup` schema with a `kind` field

**Pros**:
- Fewer schemas.

**Cons**:
- Fields differ a lot (tax has rates and flags), so the generic shape loses validation.

## Decision

**Chosen option**: Option 1: one schema per lookup list, with numbering done by a counter record per document type plus a unique index on each document's number.

**Implementation skills**: `blocks-data-gateway-configuration`, `blocks-data-gateway-crud`, `blocks-localization-implementation`.

## Rationale

Validation rules and unique indexes in Blocks are per schema, so separate schemas keep the server checks that exist. For numbering, a counter record gives the next number, and the unique index on `orderNumber` (L9) turns a rare collision into a retry instead of a duplicate.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| SET-1 | Profile, home currency, multi currency | Schemas + CRUD | ✅ Can do |
| SET-1 | Auto exchange rates | Schedule workflow + `httpRequest` to a rates API | ✅ Can do |
| SET-2 | Prefix + padded sequence | Counter record + unique index per document type | ⚠️ Collisions possible without atomic increment (L2); unique index catches them, app retries |
| SET-5 | Terms, taxes, reasons, carriers, methods | Schemas + CRUD + validation rules | ✅ Can do |
| §5.6 | Exactly one default | App rule (unset the old default, set the new) | ⚠️ Two writes, not atomic (L1); low risk, settings change rarely |
| NFR | Currency and date formatting | Browser `Intl` + company time zone | ✅ Can do (no Blocks needed) |
| NFR | UI translations | `blocks-localization-*` (en, de, bn exist) | ✅ Can do |
| SET-6 | Close transactions (lock records before a cutoff) | `Company.closedBefore` date + app check on every edit | ⚠️ App only (L4); the server still accepts edits to closed records (P1) |

## Feature design

**Data model sketch**:
- `Company`: `name` String req, `address` String, `timeZone` String req, `homeCurrency` String req (ISO 4217), `dateFormat` String. One per organization (unique index on `OrganizationId`).
- `Currency`: `code` String req (unique per org), `symbol`, `decimals` Int.
- `ExchangeRate`: `currencyCode` String req, `rate` Float req (> 0), `effectiveOn` DateTime req, `source` String (`manual` or `auto`).
- `NumberingRule`: `documentType` String req (unique per org), `prefix` String, `padding` Int, `nextNumber` Int req.
- `PaymentTerm`: `name` req, `daysDue` Int req (>= 0), `isActive` Boolean.
- `TaxingScheme`: `name` req, `isDefault` Boolean, `tax1Name`, `tax1Rate` Float, `tax2Name`, `tax2Rate` Float, `tax2CompoundsOnTax1` Boolean, `tax1OnShipping` Boolean, `tax2OnShipping` Boolean, `isTaxInclusive` Boolean.
- `TaxCode`: `name` req, `taxingSchemeId` ID req, `tax1Rate` Float, `tax2Rate` Float.
- `AdjustmentReason`, `Carrier`, `PaymentMethod`: `name` req, `isSystem` Boolean, `isActive` Boolean.

**API surface**: `data.collection(<Schema>)` list, get, create, update for each. Numbering: read `NumberingRule`, write the document with `prefix + padded(nextNumber)`, then update `nextNumber`; on a unique index error, read again and retry (max 3).

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| New document | number | `NumberingRule` for that type |
| Order in foreign currency | rate | latest `ExchangeRate` on or before order date |
| Money display | format | `Currency.decimals` + browser `Intl` |

**Key invariants**: unique `code`, `documentType`, document number per type and org; tax rates >= 0; one default taxing scheme.

**Security model**: settings editable only with "Settings Edit"; everyone signed in can read lookups.

**Critical test scenarios**:
- Happy path: create two sales orders and they get `SO-00001` and `SO-00002`, verifies **AC-3**
- Failure case: two orders saved at once; one hits the unique index, retries, and gets the next number, verifies **AC-3**
- Auth/permission: a Sales user cannot edit taxing schemes (403), verifies **AC-5**

## Build plan

1. Push the lookup schemas with unique indexes and validation rules, satisfies **AC-1**, **AC-4**, **AC-5**, **AC-7**
2. Company profile and currency screens, satisfies **AC-1**, **AC-2**, **AC-8**
3. Numbering rule with retry on unique conflict, satisfies **AC-3**
4. Lookup list screens with defaults, satisfies **AC-4** to **AC-7**
5. Optional schedule workflow for automatic exchange rates, satisfies **AC-2**

## Consequences

**Positive**: simple records, all on documented Blocks features.

**Negative / tradeoffs**: numbering needs a retry loop; numbers may have gaps after a failed save.

**Neutral**: tax engines for more than two components (PRD §9 item 2) stay out of scope.

## Follow-up

- [ ] Pick the exchange rate source for automatic rates.
