# 0008. Stock adjustments, transfers and counts

**Date**: 2026-10-18
**Status**: In Progress

## Summary

The three ways stock changes without buying or selling: adjustments (with a reason), transfers between locations (open, in transit, completed), and stock counts (count sheets, review, post the differences). The documents themselves fit Blocks well. Every one of them ends in a stock posting, so the parts that change quantities wait on spec 0007 and decision D1.

## Context

PRD INV-2, INV-3, INV-4, INV-5, §5.1 lifecycles, DB design STOCK_ADJUSTMENT, STOCK_TRANSFER, STOCK_COUNT (and their line tables, left off the diagram).

## Requirements

**User stories**:
- As a warehouse worker, I want to adjust stock with a reason when things break or go missing.
- As a warehouse lead, I want to send stock from the warehouse to a truck and see it in transit until it arrives.
- As a manager, I want to run a count, split it into sheets for different people, review differences, and post them.

**Acceptance criteria**:
- **AC-1**: An adjustment has a location, reason, date, and lines (product, bin, lot or serial, signed quantity); saving posts movements; cancelling reverses them.
- **AC-2**: A transfer goes Open → In transit → Completed; on send, stock leaves the source and shows as in transit; on receive, it arrives at the destination.
- **AC-3**: Transfers can require approval by a user with "Transfer Approve". (optional)
- **AC-4**: A count for a location is split into count sheets, each assigned to a person; the expected quantity is captured when the sheet starts.
- **AC-5**: Staff enter counted quantities; the count moves Open → In progress → In review; the reviewer sees variances.
- **AC-6**: Completing a count posts one adjustment per variance line.
- **AC-7**: A cost adjustment sets a new unit cost from a date (per serial for serialized items). (P1)
- **AC-8**: Lines are stored inside their document, so a document and its lines save in one write.

## Options considered

### Option 1: Lines embedded in the document (array field)
**Pros**: one write per document (avoids L1 for document plus lines). **Cons**: line level queries scan documents.

### Option 2: Separate line schemas (as the DB design implies)
**Pros**: line level queries and indexes. **Cons**: document and lines are separate writes with no transaction.

## Decision

**Chosen option**: Option 1: lines embedded as an array of a line Dto schema; postings go through spec 0007.

**Implementation skills**: `blocks-data-gateway-configuration` (Dto schemas for lines), `blocks-data-gateway-crud`, `blocks-notifier`.

## Rationale

Blocks writes one document atomically (MongoDB guarantees single document writes). Keeping lines inside the document means a document can never be half saved, which removes one class of L1 problems at no cost.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| INV-2 | Adjustment with reasons, cancel | Schema + spec 0007 posting | ✅ document; ⚠️ posting blocked by D1 |
| INV-3 | Transfer lifecycle, in transit | Schema + status field + two postings | ✅ document; ⚠️ posting blocked by D1 |
| INV-3 | Approval right | Permission + app check | ⚠️ Status change not enforced on server (L4) |
| INV-4 | Count sheets, snapshot, review, post | Schemas + notifier to assignees | ✅ document; ⚠️ posting blocked by D1 |
| INV-5 | Cost adjustment | Compare and set on `averageCost` | ⚠️ Same as spec 0007 |
| §5.1 | Valid status transitions only | App rule | ⚠️ App only (L4) |

## Feature design

**Data model sketch**:
- `StockAdjustment`: `number` req (unique), `locationId` req, `reasonId` req, `adjustedAt` DateTime req, `status` (`posted`, `cancelled`), `lines` array of `AdjustmentLine` {`productId`, `sublocationId`, `lotId`, `serial`, `qtyDelta`, `uom`}.
- `StockTransfer`: `number` req (unique), `fromLocationId` req, `toLocationId` req, `status` (`open`, `in_transit`, `completed`, `cancelled`), `requiresApproval`, `approvedBy`, `sentAt`, `receivedAt`, `lines` array of `TransferLine` {`productId`, `fromSublocationId`, `toSublocationId`, `lotId`, `serial`, `qty`, `uom`}.
- `StockCount`: `number` req (unique), `locationId` req, `status` (`open`, `in_progress`, `in_review`, `completed`), `sheets` array of `CountSheet` {`assigneeId`, `status`, `lines` [{`productId`, `sublocationId`, `lotId`, `serial`, `expectedQty`, `countedQty`}]}.
- `CostAdjustment` (P1): `productId`, `serial`, `newUnitCost`, `effectiveOn`.

**State transitions**: transfer `open → in_transit → completed`, `open → cancelled`; count `open → in_progress → in_review → completed`.

**API surface**: CRUD through `data.collection`; actions `postAdjustment`, `sendTransfer`, `receiveTransfer`, `completeCount` each call spec 0007 `post()` with `sourceType` and line ids.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Start sheet | expected qty | `InventoryBalance.onHand` at sheet start |
| Complete count | variance | `countedQty − expectedQty` |
| Adjustment in | unit cost | current `Product.averageCost` (PRD §5.4) |

**Key invariants**: a completed or cancelled document never changes; from and to locations differ; variance lines post exactly once (spec 0007 `postingKey`).

**Security model**: Adjust Edit, Transfer Edit or Approve, Count Edit or Count only (enter quantities without seeing expected), per PRD SEC-2.

**Critical test scenarios**:
- Happy path: transfer 5 from warehouse to truck; in transit shows 5; receive; truck shows 5, verifies **AC-2**
- Failure case: completing a count twice posts variances once, verifies **AC-6**
- Auth/permission: a Count only user cannot see expected quantities, verifies **AC-5**

## Build plan

- [x] 1. Push the three schemas with line Dtos, satisfies **AC-8**
- [x] 2. Adjustment screen with reasons, satisfies **AC-1** (posting after D1)
- [x] 3. Transfer screen and lifecycle, satisfies **AC-2**, **AC-3** (posting after D1) (approval, AC-3, optional and not built)
- [x] 4. Count, sheets, review, satisfies **AC-4**, **AC-5**, **AC-6** (posting after D1)
- [ ] 5. P1: cost adjustments, satisfies **AC-7** (P1, not built)

## Consequences

**Positive**: documents save atomically.
**Negative / tradeoffs**: anything that moves stock waits on D1.
**Neutral**: line level reports read documents and flatten lines.
