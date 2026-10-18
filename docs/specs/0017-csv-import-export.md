# 0017. CSV import and export

**Date**: 2026-10-18
**Status**: Proposed

## Summary

Guided CSV import for products, customers, vendors, prices, and starting stock levels (column mapping, a dry run that shows errors, then the import), and CSV export of the same lists. Parsing and checking happen in the browser, and records go in through Blocks bulk inserts. Products, customers, vendors, and prices are fine. Starting stock levels are stock postings, so that part waits on spec 0007 and D1.

## Context

PRD PRD-P11 (P0), §1.4 activation goal ("import products and complete one order within 14 days").

## Requirements

**Acceptance criteria**:
- **AC-1**: A user uploads a CSV, maps columns to fields, and sees a dry run listing every row error before anything is saved.
- **AC-2**: Import creates or updates records matched by SKU or name (products), name (customers, vendors).
- **AC-3**: A failed import can be re run; rows already imported are updated, not duplicated.
- **AC-4**: Stock levels import as one opening adjustment per location.
- **AC-5**: Products, customers, vendors, stock levels, and prices export to CSV.
- **AC-6**: Imports respect plan limits (spec 0023).

## Options considered

### Option 1: Browser parse and validate, then `insertMany` in chunks
**Pros**: no server; instant dry run. **Cons**: a big file in a weak browser is slow; a closed tab stops mid way.

### Option 2: Upload the file, a webhook workflow imports it
**Pros**: survives closed tabs. **Cons**: workflow limits on big files unverified; harder error reporting.

## Decision

**Chosen option**: Option 1, with chunks of 100 and an `ImportJob` record tracking progress so a re run resumes.

**Implementation skills**: `blocks-data-gateway-crud` (`insertManyProduct` etc.), `blocks-data-storage`.

## Rationale

Matching by SKU or name plus unique indexes makes re runs safe, so a stopped import can resume without a server.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| PRD-P11 | Mapping and dry run | Browser | ✅ Can do |
| PRD-P11 | Bulk create | `insertMany<Schema>`, `updateMany<Schema>` | ✅ Can do |
| AC-3 | Safe re run | Unique indexes + match by key | ✅ Can do |
| AC-4 | Opening stock | Spec 0008 adjustment + 0007 posting | ⚠️ Blocked by D1 |
| AC-5 | Export | Browser pages and writes CSV | ✅ Can do |

## Feature design

**Data model sketch**:
- `ImportJob`: `entity`, `fileId`, `mapping` String (JSON), `totalRows`, `doneRows`, `errorRows`, `errors` String (JSON), `status` (`dry_run`, `running`, `done`, `failed`).

**API surface**: browser `parse(file)` → `validate(rows, mapping)` → `importChunks(rows)` using `insertMany`/`updateMany`; progress saved to `ImportJob`.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Match | existing record | unique SKU or name index |
| Opening stock | cost | CSV column, else product average cost |

**Key invariants**: no duplicate records after any number of re runs.

**Security model**: Import and Export permissions (PRD SEC-2).

**Critical test scenarios**:
- Happy path: 500 products import with 0 errors, verifies **AC-1**, **AC-2**
- Failure case: rows with a duplicate SKU show in the dry run, nothing saved, verifies **AC-1**
- Re run: import stopped at row 300, re run finishes with 500 records, not 800, verifies **AC-3**

## Build plan

1. `ImportJob` schema, satisfies **AC-3**
2. Upload, mapping, dry run screen, satisfies **AC-1**
3. Chunked import for products, customers, vendors, prices, satisfies **AC-2**, **AC-3**, **AC-6**
4. Export screens, satisfies **AC-5**
5. Opening stock import (after D1), satisfies **AC-4**

## Consequences

**Positive**: fast onboarding without a server.
**Negative / tradeoffs**: very large files depend on the user's browser.
**Neutral**: opening stock waits on D1.
