# 0014. Reorder settings, reorder list and low stock alerts

**Date**: 2026-10-18
**Status**: In Progress

## Summary

Per product and location reorder points, a list of what to reorder, one click creation of POs, transfers, or manufacture orders, and low stock alerts by email and in the app. Settings, alerts, and draft creation all fit Blocks (a nightly schedule workflow does the checks). The list is only as right as the quantities from spec 0007.

## Context

PRD RO-1 to RO-5, DB design REORDER_SETTING. Anticipated quantity = on hand − reserved + on order (PRD §5.3).

## Requirements

**Acceptance criteria**:
- **AC-1**: A reorder setting per product and location has reorder point, reorder quantity, method (PO, manufacture, transfer), preferred vendor or source location, default bin.
- **AC-2**: The reorder list shows every product and location whose anticipated quantity is below the reorder point.
- **AC-3**: From the list, one click creates draft POs grouped by vendor, transfers grouped by source, or MOs.
- **AC-4**: Low stock alerts go out by email and in app to chosen roles, at most once per product and location until restocked.
- **AC-5**: A suggested reorder point = daily sales rate × vendor lead time + safety stock. (P1)

**User stories**:
- As a purchaser, I want one list of what to reorder and one click to raise the POs.

## Options considered

### Option 1: Nightly schedule workflow builds a `ReorderSuggestion` list and sends alerts
**Pros**: fast list; alerts on time. **Cons**: list is up to a day old unless refreshed on demand.

### Option 2: Compute the list in the browser on open
**Pros**: always current. **Cons**: reads every balance and open line (L3), slow at scale.

## Decision

**Chosen option**: Option 1, plus a "refresh now" button that runs the same check for one location in the browser.

**Implementation skills**: `blocks-data-gateway-crud`, `blocks-workflow`, `blocks-mail`, `blocks-notifier`.

## Rationale

Without sums on the server (L3), a precomputed list is the only way to keep the screen fast at 250k products.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| RO-1 | Reorder settings | Schema + unique (product, location) | ✅ Can do |
| RO-2 | Reorder list | Schedule workflow + `code` node → `ReorderSuggestion` | ⚠️ Can do; workflow paging over large data unverified |
| RO-3 | One click drafts | Browser creates PO, transfer, MO documents | ✅ Can do |
| RO-4 | Suggested reorder point | Nightly workflow over sales movements | ⚠️ Same paging concern |
| RO-5 | Email and in app alerts | `sendMail` node + notifier | ✅ Can do |

## Feature design

**Data model sketch**:
- `ReorderSetting`: `productId`, `locationId` (unique pair), `reorderPoint` Float, `reorderQty` Float, `method`, `vendorId`, `sourceLocationId`, `sublocationId`, `lastAlertedAt`.
- `ReorderSuggestion`: `productId`, `locationId`, `anticipated` Float, `reorderPoint`, `suggestedQty`, `computedAt`.

**API surface**: CRUD on settings; schedule workflow `reorder-check` (daily) → `dataAction getData` → `code` → `insertData` suggestions → `sendMail`/notify; browser `createDrafts(suggestionIds)`.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Check | anticipated | spec 0007 quantities |
| Draft PO | vendor, price | `ReorderSetting.vendorId`, `VendorItem.unitCost` |
| Alert | recipients | users with Purchasing role |

**Key invariants**: one setting per product and location; one alert per breach until restocked.

**Security model**: Reorder Edit to change settings; Purchasing to create drafts.

**Critical test scenarios**:
- Happy path: product drops below point; nightly run lists it and emails purchasing, verifies **AC-2**, **AC-4**
- One click: three suggestions from two vendors create two draft POs, verifies **AC-3**
- Failure case: no repeat alert the next night if still low, verifies **AC-4**

## Build plan

1. Push `ReorderSetting`, `ReorderSuggestion`, satisfies **AC-1**
2. Settings screen, satisfies **AC-1**
3. Reorder check workflow with alerts, satisfies **AC-2**, **AC-4**
4. Reorder list with one click drafts, satisfies **AC-3**
5. P1: suggested reorder point, satisfies **AC-5**

## Consequences

**Positive**: alerts and list cost nothing to read.
**Negative / tradeoffs**: list can be a day old; depends on spec 0007 quantities.
**Neutral**: one more schedule workflow to watch.

## Follow-up

- [ ] Check how many records a workflow `getData` can page through in one run.
