# 0007. Stock ledger, balances, quantities and costing

**Date**: 2026-10-18
**Status**: Proposed

## Summary

This is the heart of the product: every stock change writes a movement (the ledger), updates the on hand balance, and updates the average cost. The PRD says those writes must happen together, and two people must never take the same last unit. Blocks has no documented transactions, atomic increments, or sums (spec 0002, L1 to L3), so this feature **cannot be built safely on Blocks today**. This spec defines the design and the three ways forward; it stays blocked until decision D1 is closed.

## Context

PRD §5.2 (posting), §5.3 (quantity definitions), §5.4 (costing), INV-6, INV-7, INV-10, NFR Correctness ("Inventory posting is transactional; quantities reconstructible from the movement ledger at any date") and Concurrency ("pick allocation uses row locks"). DB design §2: "Every document writes a row to INVENTORY_MOVEMENT, and INVENTORY_BALANCE is updated in the same transaction."

Every stock changing feature (adjustments, transfers, counts, receiving, picking, shipping, manufacturing, stockroom scans) calls this one posting step. If it is wrong, every count in the product is wrong.

Volumes: up to 5M movements a year per company, 100 users at once, and a quantity summary for one product in under 100 ms.

## Requirements

**User stories**:
- As a warehouse worker, I want stock to update the moment I receive or pick, so the numbers I see are true.
- As an owner, I want the full history of every quantity change (who, what, when, which document).
- As an owner, I want correct average cost so margins are right.

**Acceptance criteria**:
- **AC-1**: Every quantity change is a movement row (product, location, bin, lot, serial, signed quantity in standard unit, unit cost, source document type and id, who, when). Movements are never edited or deleted; a cancel writes reversing movements.
- **AC-2**: After any posting, the balance for (product, location, bin, lot, serial) equals the sum of its movements.
- **AC-3**: If posting fails part way, no movement is left counted without its balance change, or the system detects and repairs it within a stated time.
- **AC-4**: Two users posting against the same balance at the same time both land correctly (no lost update).
- **AC-5**: A posting that would make on hand negative is refused, unless the user has the override right.
- **AC-6**: For one product, the app shows on hand, picked, reserved, available, on order, in transit, anticipated, per location and company wide, matching PRD §5.3 exactly, in under 100 ms.
- **AC-7**: Receiving updates moving average cost: new avg = (old qty × old avg + received qty × landed unit cost) / (old qty + received qty).
- **AC-8**: Cost of goods is fixed when stock leaves (pick or ship) and stored on that movement.
- **AC-9**: Stock on hand at any past date can be rebuilt from the ledger.
- **AC-10**: Serialized items have one balance row per serial with quantity 0 or 1.

## Options considered

### Option 1: Compare and set on balance rows (needs Blocks to confirm L10)

Each balance row has a `version`. Posting: write the movement as `pending`, update the balance with a filter on `ItemId` and `version` (setting the new quantity, the new version, and for receipts the new average cost on the product the same way), then mark the movement `posted`. If the update touches 0 rows, read again and retry. A schedule workflow every few minutes finds `pending` movements older than a minute and finishes or reverses them.

**Pros**: no lost updates (AC-4); negative stock check is safe because it is part of the filtered update; no backend.
**Cons**: depends on an undocumented feature; several round trips per posting; repair job needed for AC-3.

### Option 2: One webhook workflow as the only stock writer

The app calls one published webhook workflow with the document lines. The workflow reads balances, checks, writes movements and balances with `dataAction`.

**Pros**: logic runs on the server; the browser cannot skip the checks.
**Cons**: the workflow skill says not to use it for transactional logic; calls run in parallel, so races remain; partial failure still possible.

### Option 3: Posting service behind `logic proxy`

A small service with a transactional database (or a MongoDB transaction with direct access) does posting; the app calls it through Blocks `logic proxy`.

**Pros**: correct by construction (real transaction, row locks); meets every AC.
**Cons**: it is a backend to build, host, and operate.

### Option 4: Ledger only, no balance rows

Write movements only; compute balances by summing movements.

**Pros**: one write per posting, no drift.
**Cons**: no sums on the server (L3); at 5M movements a year the browser cannot sum fast enough (AC-6 fails).

## Decision

**Chosen option**: none yet. **Open decision D1** (spec 0002). Recommended: Option 1 if the Blocks team confirms filtered updates are atomic compare and set; otherwise Option 3. Option 2 only for a prototype.

**Implementation skills**: `blocks-data-gateway-configuration`, `blocks-data-gateway-crud`, `blocks-workflow`.

## Rationale

Options 1 and 3 are the only ones that meet AC-4 (no lost updates), which the PRD treats as a correctness requirement, not a nice to have. Option 1 keeps "no backend" but rests on one unconfirmed Blocks behavior; that is why the decision waits for the Blocks answer instead of guessing.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| §5.2 / NFR | Movement + balance in one transaction | none | ❌ Cannot (L1). Workaround: pending + repair job (Option 1) |
| NFR | No double allocation, row locks | Filtered update as compare and set | ⚠️ Only if L10 is confirmed; otherwise ❌ |
| INV-7 | Full movement history | `InventoryMovement` schema, deny Edit and Delete for all roles | ✅ Can do |
| INV-10 | Block negative stock | Part of the compare and set filter (`onHand >= qty`) | ⚠️ Only if L10 is confirmed |
| INV-6 | Quantity model per product | Read balance rows + open order lines for one product | ✅ Can do for one product; ⚠️ company wide totals need precomputed rows (L3) |
| §5.4 | Moving average cost | Compare and set on product `averageCost` + `costVersion` | ⚠️ Only if L10 is confirmed |
| §5.4 | FIFO / LIFO layers (P2) | Cost layer records consumed in order | ❌ Not safely without transactions |
| AC-9 | Stock at a past date | Read movements up to a date, sum in browser or nightly snapshot rows | ⚠️ Slow without sums (L3); use monthly snapshot rows |

## Feature design

**Data model sketch**:
- `InventoryMovement`: `productId` req, `locationId` req, `sublocationId`, `lotId`, `serial` String, `qtyDelta` Float req (standard unit), `enteredQty` Float, `enteredUom` String, `unitCost` Float, `sourceType` String req (`purchase_receive`, `sales_pick`, `sales_restock`, `adjustment`, `transfer_send`, `transfer_receive`, `count`, `mo_pick`, `mo_put`, `po_unstock`), `sourceId` ID req, `sourceLineId` ID, `effectiveAt` DateTime req, `status` String req (`pending`, `posted`, `reversed`), `postingKey` String req (unique: idempotency, `sourceType:sourceLineId:attempt`).
- `InventoryBalance`: `productId` req, `locationId` req, `sublocationId`, `lotId`, `serial`, `onHand` Float req, `picked` Float req, `version` Int req. Unique index on (`productId`, `locationId`, `sublocationId`, `lotId`, `serial`).
- `Product.averageCost` Float, `Product.costVersion` Int (spec 0005).
- `StockSnapshot` (monthly, written by a schedule workflow): `productId`, `locationId`, `asOf`, `onHand`, `value`.

**State transitions**: movement `pending → posted`, `pending → reversed` (repair job), `posted` is final (a cancel writes new reversing movements).

**API surface** (one shared posting module in the app, or the workflow / service per D1):
| Operation | Inputs | Outputs | Errors |
|---|---|---|---|
| `post(lines[], source)` | product, location, bin, lot, serial, qtyDelta, unitCost, source | movement ids | `insufficient_stock`, `conflict_retry_exhausted` |
| `reverse(sourceType, sourceId)` | source | reversing movement ids | `already_reversed` |
| `quantities(productId, locationId?)` | ids | on hand, picked, reserved, available, on order, in transit, anticipated | none |

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Post | qty in standard unit | entered qty × product unit ratio (spec 0005) |
| Post receipt | landed unit cost | spec 0012 landed cost |
| Post pick | cost of goods | `Product.averageCost` at posting time |
| Quantities | reserved | open sales lines (0011), MO materials (0020), outgoing transfers (0008) |
| Quantities | on order | open PO lines (0012), unfinished MO outputs, incoming transfers |
| Quantities | in transit | transfers sent, not received (0008) |

**Key invariants**: balance = sum of posted movements; `onHand >= 0` unless overridden; serial balance is 0 or 1; `postingKey` unique (retrying a posting never double counts).

**Security model**: movements and balances are written only by the posting step; no role has Edit or Delete on `InventoryMovement`. Read needs "Current stock View"; history needs "History View".

**Critical test scenarios**:
- Happy path: receive 10, pick 3, balance shows 7 and three movements exist, verifies **AC-1**, **AC-2**
- Failure case: two pickers take the last unit at the same time; exactly one succeeds, verifies **AC-4**, **AC-5**
- Failure case: browser closes after the movement write; the repair job finishes or reverses it within 5 minutes, verifies **AC-3**
- Auth/permission: no role can edit a movement (403), verifies **AC-1**

## Build plan

Blocked until D1 is closed. Once closed:

1. Push `InventoryMovement`, `InventoryBalance` with unique indexes and deny edit and delete policies, satisfies **AC-1**, **AC-10**
2. Build the posting step per the chosen option (idempotency key, negative check, retries), satisfies **AC-2**, **AC-4**, **AC-5**
3. Moving average cost update on receipt; cost of goods on pick, satisfies **AC-7**, **AC-8**
4. Repair schedule workflow for `pending` movements, satisfies **AC-3**
5. Quantity summary for one product, satisfies **AC-6**
6. Monthly snapshot workflow and as of date view, satisfies **AC-9**

## Consequences

**Positive**: one posting step used everywhere; ledger kept forever.
**Negative / tradeoffs**: blocks most of the MVP until D1 closes; even Option 1 is several round trips per posting.
**Neutral**: FIFO and LIFO (P2) only become possible with Option 3.

## Follow-up

- [ ] Close D1 after the Blocks team answers (filtered update as compare and set, transactions, aggregation).
- [ ] If Option 3 wins, write a spec for the posting service and its `logic proxy` route.
