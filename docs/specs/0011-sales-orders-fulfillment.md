# 0011. Sales quotes, orders, fulfillment and returns

**Date**: 2026-10-18
**Status**: In Progress

## Summary

The order to cash flow: quote, order, pick, pack, ship, invoice, returns, back orders, quick actions, and profit per order. The order document (with its lines inside) fits Blocks well, and statuses can be worked out from the lines. Picking, shipping, and restocking all change stock, so they wait on spec 0007 and decision D1. Reserving stock without double allocation has the same dependency.

## Context

PRD §4.4 (SO-1 to SO-17), §5.1 sales lifecycle, §5.3 (reserved, picked). DB design SALES_ORDER, SALES_ORDER_LINE, SHIPMENT. Payments are spec 0013, invoice PDFs and emails spec 0016, shipping labels spec 0018.

## Requirements

**User stories**:
- As a sales rep, I want to make a quote, turn it into an order, and see whether it can ship now.
- As a warehouse worker, I want to pick, pack into boxes, and ship part or all of an order.
- As an owner, I want to see cost of goods and profit on each order.

**Acceptance criteria**:
- **AC-1**: A quote converts to an order and back; the order keeps a snapshot of the customer's addresses, scheme, currency, rate, terms (due date), rep, customer PO number, requested ship date, freight, external id and source.
- **AC-2**: Lines hold product, description, quantity and unit, unit price, discount (percent or fixed), tax code, service done flag; a negative quantity is a return, marked restock or discard.
- **AC-3**: Pick, pack, ship, and restock are each recorded separately and can be partial; the rest stays open as a back order.
- **AC-4**: Inventory status (Quote, Unconfirmed, Unfulfilled, Started, Fulfilled) and payment status (Quote, Unconfirmed, Uninvoiced, Invoiced, Partial, Paid, Owing) are worked out from lines, shipments, invoice, and payments, never set by hand.
- **AC-5**: Quick actions: pick all, pack all, ship all, invoice, pay in full, fulfill, restock, cancel, convert.
- **AC-6**: Cancel reverses every stock movement and payment of the order.
- **AC-7**: Once fulfilled, the order shows cost of goods and profit, minus non customer costs.
- **AC-8**: Sales reps with the restriction see only their own customers and orders. (P1)
- **AC-9**: An order that pushes the customer over the credit limit becomes Unconfirmed until a user with "Confirm" confirms it. (P1)
- **AC-10**: A fulfillment queue can be ordered by priority and shows "can ship now" vs "needs stock". (P1)
- **AC-11**: Start picking reserves stock and locks the order; failures are shown per line; stop picking releases it. (P1)
- **AC-12**: Every change to an order is kept in its history (who, what, when).

## Options considered

### Option 1: Order document with embedded lines, shipments, and history
**Pros**: one atomic write per order change (no L1 problem inside an order); statuses computed from one document. **Cons**: line level reports flatten documents.

### Option 2: Separate line and shipment schemas (DB design)
**Pros**: line level queries. **Cons**: order and lines saved separately with no transaction.

## Decision

**Chosen option**: Option 1: `SalesOrder` with embedded `lines`, `packages`, `shipments`, and `history` arrays; stock changes through spec 0007.

**Implementation skills**: `blocks-data-gateway-configuration`, `blocks-data-gateway-crud`, `blocks-notifier`, `blocks-workflow`.

## Rationale

Keeping the whole order in one document means order edits are atomic on Blocks. Only the stock side needs D1.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| SO-1, SO-2, SO-3 | Quote, order, lines, returns | One document with line Dtos | ✅ Can do |
| SO-4, SO-12 | Pick, pack, ship, restock, partial | Embedded arrays + spec 0007 posting | ✅ document; ⚠️ stock blocked by D1 |
| SO-5 | Picking session, allocation lock | Compare and set lock on the order + reservations | ⚠️ Depends on L10 |
| SO-6 | Derived statuses | Computed in browser on save | ✅ Can do; ⚠️ not enforced on server (L4) |
| SO-7, SO-8 | Invoice, payments | Spec 0013, 0016 | see those |
| SO-9, SO-10 | Credit limit gate | Customer balance (spec 0013) + app check | ⚠️ App only (L4) |
| SO-11 | Priority queue | `priority` field + sort | ✅ Can do |
| SO-13 | Dropship (P2) | Linked PO with customer ship to (spec 0012) | ✅ Can do |
| SO-14 | Quick actions | Browser actions | ✅ document; ⚠️ stock ones blocked by D1 |
| SO-15 | Cost of goods and profit | Stored on pick movements (spec 0007) and summed per order | ✅ Can do once posting works |
| SO-16 | Shipping labels (P1) | Spec 0018 | see 0018 |
| SO-17 | Rep sees own only | Row policy on `salesRepUserId` | ⚠️ Policy grammar undocumented (L6) |
| SEC-6 | Order history | Embedded `history` array | ✅ Can do |

## Feature design

**Data model sketch**:
- `SalesOrder`: `number` req (unique), `isQuote` Boolean, `customerId` req, `contact`, `billingAddress`, `shippingAddress` (snapshots), `locationId` req, `pricingSchemeId`, `currencyCode`, `exchangeRate` Float, `taxingSchemeId`, `paymentTermId`, `dueDate`, `salesRepUserId`, `assignedUserId`, `customerPoNumber`, `requestedShipDate`, `freight` Float, `externalId`, `source` (`manual`, `shopify`, `portal`, ...), `priority` Int, `needsConfirmation` Boolean, `confirmedBy`, `pickingLockedBy`, `invoicedOn`, `remarks` (per stage), `inventoryStatus`, `paymentStatus` (computed and stored for listing), `total`, `cogs`, `nonCustomerCosts` Float, `lines` array of `SalesLine` {`lineId`, `productId`, `description`, `qty`, `uom`, `unitPrice`, `discountType`, `discount`, `taxCodeId`, `serviceDone`, `returnAction` (`restock`, `discard`), `pickedQty`, `packedQty`, `shippedQty`, `restockedQty`}, `packages` array {`number`, `lineQtys`}, `shipments` array {`carrier`, `trackingNumber`, `shippedAt`, `packageNumbers`}, `history` array {`at`, `by`, `action`, `details`}.

**State transitions**: Quote → Unconfirmed (if needs confirmation) → Unfulfilled → Started → Fulfilled. Payment: Uninvoiced → Invoiced → Partial → Paid (Owing when overpaid). Cancelled from any state before completion.

**API surface**: `data.collection("SalesOrder")` CRUD; actions `convert`, `confirm`, `pick(lines)`, `pack`, `ship`, `restock`, `cancel`, `quickAction(name)`; pick and restock call spec 0007 `post()`.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| New order | number | `NumberingRule` (spec 0004) |
| Line price, tax | price, tax | spec 0010 module |
| Due date | date | order date + `PaymentTerm.daysDue` |
| Can ship now | available | spec 0007 `quantities()` |
| Profit | cogs | sum of `unitCost × qty` on this order's pick movements |
| Over credit | balance | customer open balance (spec 0013) + this order total |

**Key invariants**: `shipped <= packed <= picked <= ordered` per line; derived statuses always match lines; a completed order never changes, and orders before the company's closed date are locked (SET-6, spec 0004, app side).

**Security model**: Sales Order View/Edit/Pick/Confirm/Prioritize; reps limited to own customers (P1).

**Critical test scenarios**:
- Happy path: quote → order → pick all → pack → ship → status Fulfilled, verifies **AC-1**, **AC-3**, **AC-4**
- Failure case: ship 6 of 10, the order stays Started with 4 on back order, verifies **AC-3**
- Auth/permission: rep B cannot open rep A's order (P1), verifies **AC-8**

## Build plan

1. Push `SalesOrder` with line, package, shipment, history Dtos, satisfies **AC-1**, **AC-2**, **AC-12**
2. Quote and order screens with price and tax module, satisfies **AC-1**, **AC-2**
3. Derived status functions with tests, satisfies **AC-4**
4. Pick, pack, ship, restock screens (stock posting after D1), satisfies **AC-3**, **AC-5**, **AC-6**
5. Profit view, satisfies **AC-7**
6. P1: rep restriction, credit gate, priority queue, picking session, satisfies **AC-8** to **AC-11**

## Consequences

**Positive**: order edits are atomic.
**Negative / tradeoffs**: no real fulfillment until D1 closes; credit gate and status rules app only.
**Neutral**: line reports read and flatten order documents.
