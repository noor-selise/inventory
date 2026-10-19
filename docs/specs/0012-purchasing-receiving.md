# 0012. Purchase quotes, orders, receiving, returns and landed cost

**Date**: 2026-10-18
**Status**: In Progress

## Summary

The procure to pay flow: request for quote, purchase order, approval by limit, receiving (partial, with lots and serials), returns to vendor, and landed cost (freight and other costs spread over received lines). The PO document fits Blocks. Receiving changes stock and average cost, so it waits on spec 0007 and D1. The approval limit is checked in the app, not on the server.

## Context

PRD §4.5 (PO-1 to PO-9), §5.1 PO lifecycle, §5.4 landed cost. DB design PURCHASE_ORDER, PURCHASE_ORDER_LINE. Vendor payments are spec 0013.

## Requirements

**User stories**:
- As a purchaser, I want to send a quote request, turn it into a PO, and get it approved.
- As a receiver, I want to receive part of a PO into a bin, scanning lots or serials.
- As an owner, I want freight and duties spread into product cost.

**Acceptance criteria**:
- **AC-1**: A quote converts to a PO; the PO keeps vendor, contact, address snapshot, ship to (company or customer for dropship), receive location, currency, rate, taxing scheme, terms, carrier, requested ship date, vendor order number, freight, non vendor costs (percent or fixed).
- **AC-2**: Lines hold product, vendor item code, quantity and unit, unit price, discount, tax code; negative quantity = return to vendor.
- **AC-3**: A PO stays Unapproved until a user whose approval limit is at least the PO total approves it. (P1)
- **AC-4**: Receiving can be partial and repeated, into a location and bin, capturing lot or serial; returns unstock items.
- **AC-5**: Landed cost spreads freight and non vendor costs over received stocked lines by value (default), weight, or volume, and that cost feeds average cost.
- **AC-6**: Inventory status (Quote, Unapproved, Unfulfilled, Started, Fulfilled) and payment status (Quote, Unapproved, Unpaid, Partial, Paid, Owing) are derived.
- **AC-7**: The product remembers the last vendor; the vendor price can be updated from the latest PO after a prompt. (P1)

## Options considered

### Option 1: PO document with embedded lines and receipts
**Pros**: atomic PO edits. **Cons**: line reports flatten documents.

### Option 2: Separate line and receipt schemas
**Pros**: line queries. **Cons**: no transaction across them.

## Decision

**Chosen option**: Option 1, same pattern as sales orders (spec 0011); receipts post through spec 0007.

**Implementation skills**: `blocks-data-gateway-configuration`, `blocks-data-gateway-crud`, `blocks-notifier`.

## Rationale

Same reasoning as spec 0011: one document per PO keeps edits atomic on Blocks.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| PO-1, PO-3, PO-4 | Quote, PO, lines, returns | Document with line Dtos | ✅ Can do |
| PO-2 | Approval by limit | `TeamMemberProfile.poApprovalLimit` + app check + notifier to approvers | ⚠️ App only (L4) |
| PO-5 | Receive, partial, lots, serials, unstock | Embedded receipts + spec 0007 | ✅ document; ⚠️ stock blocked by D1 |
| PO-6 | Landed cost | Browser calculation at receipt | ✅ Can do; feeds 0007 average cost (D1) |
| PO-7 | Vendor payments, aging | Spec 0013 | see 0013 |
| PO-8 | Derived statuses | Browser | ✅ Can do; ⚠️ not enforced on server |
| PO-9 | Last vendor, price update | Update `VendorItem` after prompt | ✅ Can do |

## Feature design

**Data model sketch**:
- `PurchaseOrder`: `number` req (unique), `isQuote`, `vendorId` req, `contact`, `vendorAddress` (snapshot), `shipToName`, `shipToAddress`, `dropshipSalesOrderId`, `receiveLocationId` req, `currencyCode`, `exchangeRate`, `taxingSchemeId`, `paymentTermId`, `carrierId`, `requestedShipDate`, `vendorOrderNumber`, `freight` Float, `nonVendorCosts` array {`name`, `type` (`pct`, `fixed`), `amount`}, `allocationMethod` (`value`, `weight`, `volume`), `approvedBy`, `approvedAt`, `inventoryStatus`, `paymentStatus`, `total`, `lines` array {`lineId`, `productId`, `vendorItemCode`, `qty`, `uom`, `unitPrice`, `discount`, `taxCodeId`, `receivedQty`}, `receipts` array {`receivedAt`, `by`, `lines` [{`lineId`, `qty`, `sublocationId`, `lotNumber`, `expiresOn`, `serials`, `landedUnitCost`}]}, `history` array.

**State transitions**: Quote → Unapproved → Unfulfilled → Started → Fulfilled; payment Unpaid → Partial → Paid.

**API surface**: CRUD; actions `convert`, `approve`, `receive(lines)`, `unstock(lines)`, `cancel`; receive calls spec 0007 `post()` with landed unit cost.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Receive | landed unit cost | (unit price − discount) × exchange rate + share of freight and non vendor costs by the chosen method |
| Approve | allowed? | approver's `poApprovalLimit` ≥ PO total in home currency |
| Weight/volume share | weight, size | product fields (spec 0005) |

**Key invariants**: `receivedQty <= qty` per line (unless over receive allowed); landed cost shares sum to total extra costs.

**Security model**: PO View/Edit/Receive; approval by limit.

**Critical test scenarios**:
- Happy path: PO for 2 products, freight 100 by value, receive all, landed costs correct, verifies **AC-4**, **AC-5**
- Failure case: approver with limit 1,000 tries a 5,000 PO and is refused, verifies **AC-3**
- Auth/permission: Warehouse user can receive but not edit prices, verifies **AC-4**

## Build plan

1. Push `PurchaseOrder` with Dtos, satisfies **AC-1**, **AC-2**
2. Quote and PO screens, satisfies **AC-1**, **AC-2**, **AC-6**
3. Landed cost calculation with tests, satisfies **AC-5**
4. Receive and unstock screens (stock posting after D1), satisfies **AC-4**
5. P1: approval limits, vendor price update, satisfies **AC-3**, **AC-7**

## Consequences

**Positive**: atomic PO edits; landed cost is plain math.
**Negative / tradeoffs**: receiving waits on D1; approval enforced in app only.
**Neutral**: dropship POs link to sales orders.
