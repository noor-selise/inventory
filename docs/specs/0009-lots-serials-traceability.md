# 0009. Lots, serials, expiry and traceability

**Date**: 2026-10-18
**Status**: Proposed

## Summary

Batches (lots) with expiry dates, unique serial numbers, first expiry first out suggestions, expiry alerts, and tracing a lot or serial forward to customers and back to the purchase order. The records and alerts fit Blocks. Tracing works because every movement already stores lot, serial, and source document. Keeping a serial at exactly 0 or 1 depends on the safe posting step (spec 0007, D1).

## Context

PRD PRD-P4, PRD-P5, INV-8, INV-9, §5.2 (serials). All P1 except the tracking flags (P0). DB design LOT, and `serial` on INVENTORY_BALANCE.

## Requirements

**User stories**:
- As a receiver, I want to record lot numbers and expiry dates, or serial numbers, when goods arrive.
- As a picker, I want the app to suggest the lot that expires first and never offer expired lots.
- As an owner, I want to find every customer who got lot X, and which PO supplied serial Y.

**Acceptance criteria**:
- **AC-1**: A lot has a number (unique per product), and optional made on, expires on, sell by dates; default expiry = receive date + shelf life days.
- **AC-2**: A serial is unique per product and is either in stock (1) or not (0) at one place.
- **AC-3**: Receiving or putting away a tracked product requires a lot or serial on every line.
- **AC-4**: Picking suggests lots by earliest expiry and excludes expired lots from automatic allocation.
- **AC-5**: An alert goes out N days before a lot expires (product setting).
- **AC-6**: Forward trace: for a lot or serial, list every sales order and customer it shipped to.
- **AC-7**: Backward trace: for a lot or serial, list the PO (or MO) that brought it in.

## Options considered

### Option 1: `Lot` schema, serial as text on movements and balances
**Pros**: matches the DB design; tracing is a movement query. **Cons**: serial uniqueness needs the balance unique index.

### Option 2: A `Serial` schema too
**Pros**: per serial cost and history in one place. **Cons**: another write per posting (more L1 exposure).

## Decision

**Chosen option**: Option 1, with per serial cost stored on the receiving movement.

**Implementation skills**: `blocks-data-gateway-configuration`, `blocks-data-gateway-crud`, `blocks-workflow` (schedule), `blocks-mail`, `blocks-notifier`.

## Rationale

Fewer writes per posting means fewer partial failures while D1 is open. Movements already carry lot, serial, and source document, so tracing needs no extra records.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| PRD-P4 | Lot and serial capture | Schema + required checks in app | ✅ Can do |
| PRD-P5 | Expiry dates and alert days | Fields + schedule workflow | ✅ Can do |
| INV-9 | First expiry first out, skip expired | Query balances sorted by lot expiry | ✅ Can do |
| §5.2 | Serial qty 0 or 1 | Balance unique index + posting step | ⚠️ Depends on D1 |
| INV-8 | Forward and backward trace | Query movements by lot or serial (indexed) | ✅ Can do |
| AC-5 | Expiry alerts | Schedule workflow → `sendMail` + notifier | ✅ Can do |

## Feature design

**Data model sketch**:
- `Lot`: `productId` req, `lotNumber` req (unique with `productId`), `madeOn`, `expiresOn`, `sellBy` DateTime.
- Serial: `serial` String on `InventoryMovement` and `InventoryBalance` (spec 0007), indexed.

**API surface**: lot CRUD; `allocateLots(productId, locationId, qty)` returns lots sorted by `expiresOn`, skipping expired; `trace(lotId | serial)` queries movements by lot or serial and joins source documents.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Receive | default expiry | receive date + `Product.shelfLifeDays` |
| Alert | when | `Lot.expiresOn − Product.expiryNoticeDays` |
| Trace | customers | `sales_pick` movements → sales order → customer |

**Key invariants**: lot number unique per product; serial unique per product; expiry needs lots.

**Security model**: same as stock; traceability report needs Reports View.

**Critical test scenarios**:
- Happy path: receive lot L1 (exp June) and L2 (exp May); pick suggests L2, verifies **AC-4**
- Failure case: receive a serial already in stock is rejected, verifies **AC-2**
- Trace: lot L1 lists the two customers it shipped to, verifies **AC-6**

## Build plan

1. Push `Lot` and serial indexes, satisfies **AC-1**, **AC-2**
2. Lot and serial capture on receive and put away, satisfies **AC-3**
3. Lot allocation by expiry, satisfies **AC-4**
4. Expiry alert schedule workflow, satisfies **AC-5**
5. Trace screens, satisfies **AC-6**, **AC-7**

## Consequences

**Positive**: tracing is free from the ledger.
**Negative / tradeoffs**: serial 0 or 1 guarantee waits on D1.
**Neutral**: per serial cost lives on movements.
