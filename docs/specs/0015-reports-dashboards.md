# 0015. Reports and dashboards

**Date**: 2026-10-18
**Status**: Proposed

## Summary

The core 20 reports (sales, purchasing, inventory), filters, saved reports, CSV and PDF export, a home dashboard, and long reports run in the background. Blocks has no sums or grouping over data (L3), so every total has to be either worked out in the browser from raw rows or precomputed by scheduled workflows into summary records. Small companies will be fine; large ones (millions of movements) need the summary approach and will see numbers that are hours old.

## Context

PRD RPT-1 to RPT-5, NFR performance and scale. Reports read orders (0011, 0012), movements and balances (0007), payments (0013).

## Requirements

**Acceptance criteria**:
- **AC-1**: The core 20 reports exist: sales by product, sales profit, returns, sales tax, payments received, back orders, sales by rep, PO summary, PO status, vendor payments, purchase tax, inventory summary, inventory by location, inventory value (cost), movement history, stock as of a date, reorder report, adjustments, transfers, lot expiry.
- **AC-2**: Each report filters by date range, location, product, customer or vendor, groups, picks columns, and exports CSV and PDF.
- **AC-3**: Reports can be saved and shared with the team.
- **AC-4**: Users without Cost View never see cost or profit in any report.
- **AC-5**: Long reports run in the background with a status (not started, in progress, success, error) and a download link. (P1)
- **AC-6**: A home dashboard shows chosen widgets (sales today, low stock count, open orders). (P1)

## Options considered

### Option 1: Browser side reports over raw rows, plus nightly summary records for heavy ones
**Pros**: simple for small data; summaries keep big reports fast. **Cons**: summaries are hours old; two code paths.

### Option 2: Everything precomputed by workflows
**Pros**: fast. **Cons**: every filter combination cannot be precomputed.

### Option 3: Export data to an external warehouse
**Pros**: real sums. **Cons**: extra service (a backend in disguise).

## Decision

**Chosen option**: Option 1. Daily summary records (`DailySalesSummary`, `DailyStockSummary`) built by schedule workflows; detailed reports page raw rows in the browser; background reports run as a webhook workflow that writes a CSV to Blocks storage.

**Implementation skills**: `blocks-data-gateway-crud`, `blocks-workflow`, `blocks-data-storage`, `blocks-iam-access-control`.

## Rationale

L3 rules out server sums. Daily summaries cover most report questions (by day, product, location, customer); the rest pages raw rows, which is fine at small company scale.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| RPT-1 | Core 20 reports | Browser over raw rows + daily summaries | ⚠️ Can do; slow or stale at large scale (L3) |
| RPT-2 | Filters, CSV/PDF export | Browser (CSV, PDF made in browser) | ✅ Can do |
| RPT-3 | Saved, shared reports | `SavedReport` schema | ✅ Can do |
| RPT-4 | AI assistant (P2) | Workflow `agent` node exists, unverified for this | ⚠️ Unverified |
| RPT-5 | Async reports | Webhook workflow → CSV file in storage → notifier | ⚠️ Can do; workflow limits on large data unverified |
| AC-4 | Hide cost | DataProtection masking (spec 0003) | ✅ Can do |
| NFR | Performance at 250k products, 5M movements | none | ❌ Not proven; no server aggregation |

## Feature design

**Data model sketch**:
- `DailySalesSummary`: `day`, `productId`, `locationId`, `customerId`, `salesRepUserId`, `qty`, `revenue`, `cogs`, `tax`.
- `DailyStockSummary`: `day`, `productId`, `locationId`, `onHand`, `value`.
- `SavedReport`: `name`, `reportKey`, `filters` String (JSON), `columns` String array, `isShared`, `ownerId`.
- `ReportJob`: `reportKey`, `filters`, `status`, `fileId`, `error`.

**API surface**: report screens read summaries or page raw rows; `run-report` webhook workflow (blocksAuthorization) writes `ReportJob` and a CSV file.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Sales by product | revenue, qty | `DailySalesSummary` (nightly) or order lines |
| Inventory value | value | `DailyStockSummary` or balances × average cost |
| Stock as of date | on hand | monthly `StockSnapshot` + movements since (spec 0007) |

**Key invariants**: summaries are rebuilt, never edited; masked fields stay masked in exports.

**Security model**: Reports View; cost columns need Cost View.

**Critical test scenarios**:
- Happy path: sales by product for last month matches the orders, verifies **AC-1**
- Failure case: a Sales user exports inventory value and the cost columns are empty, verifies **AC-4**
- Background: a large report finishes and the user gets a download link, verifies **AC-5**

## Build plan

1. Push summary, saved report, and job schemas, satisfies **AC-3**, **AC-5**
2. Nightly summary workflows, satisfies **AC-1**
3. Report framework (filters, group, columns, CSV and PDF), satisfies **AC-2**, **AC-4**
4. The core 20 reports, satisfies **AC-1**
5. P1: background jobs, dashboard, satisfies **AC-5**, **AC-6**

## Consequences

**Positive**: works without a backend for small and medium companies.
**Negative / tradeoffs**: summaries are hours old; big companies may hit limits.
**Neutral**: if the Blocks team confirms server aggregation, most summaries can go away.
