# 0013. Payments, credits and balances

**Date**: 2026-10-18
**Status**: Proposed

## Summary

Customer and vendor payments, refunds, store credit, batch payments that cover several orders, balances per currency, and aging. A payment and its split across orders save as one document, which Blocks handles atomically. Balances are worked out by reading payments and orders, because Blocks cannot sum on the server; for a company with many orders that needs a precomputed balance kept up to date by a workflow.

## Context

PRD SO-8, PO-7, §5.1 payment track, DB design PAYMENT and PAYMENT_ALLOCATION ("one payment can settle several orders").

## Requirements

**User stories**:
- As a sales rep, I want to record a customer payment, possibly covering several orders.
- As an owner, I want to see what each customer owes me and what I owe each vendor, by age.

**Acceptance criteria**:
- **AC-1**: A payment has party (customer or vendor), type (payment, refund, apply credit, convert to credit, batch), method, reference, amount, currency, date, and allocations to one or more orders.
- **AC-2**: Allocations never exceed the payment amount, and the payment and its allocations save together.
- **AC-3**: Each order's amount paid and payment status update after a payment.
- **AC-4**: Customer and vendor balances and store credit show per currency.
- **AC-5**: Vendor aging shows current, 1 to 30, 31 to 60, 61+ days.
- **AC-6**: Cancelling an order voids its allocations.

## Options considered

### Option 1: Payment document with embedded allocations; balances precomputed by a data trigger workflow
**Pros**: payment saves atomically; balances fast to read. **Cons**: precomputed balance can lag a few seconds and needs a nightly rebuild.

### Option 2: Separate allocation schema; balances summed in the browser
**Pros**: always current. **Cons**: no transaction between payment and allocations; slow at scale (L3).

## Decision

**Chosen option**: Option 1.

**Implementation skills**: `blocks-data-gateway-crud`, `blocks-workflow` (data trigger + schedule).

## Rationale

Money writes must never be half saved, so allocations live inside the payment document. Balances are derived values (the expert rule says compute at read time), but Blocks has no sums (L3), so a precomputed balance plus a nightly rebuild is the honest compromise.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| SO-8 | Payment types, method, reference | Schema | ✅ Can do |
| DB | One payment across many orders | Embedded allocations | ✅ Can do (atomic, single document) |
| SO-8 | Order paid amount and status | Update each order after payment | ⚠️ Separate writes (L1); a data trigger workflow recomputes order totals |
| SO-8, PO-7 | Balances, store credit per currency | `PartyBalance` maintained by data trigger workflow + nightly rebuild | ⚠️ Can lag; race on concurrent payments (L2) fixed by nightly rebuild |
| PO-7 | Aging buckets | Browser over open orders, or nightly workflow | ✅ Can do |

## Feature design

**Data model sketch**:
- `Payment`: `party` (`customer`, `vendor`), `partyId` req, `type` req, `methodId`, `reference`, `amount` Float req, `currencyCode` req, `paidOn` req, `isVoided`, `allocations` array {`salesOrderId` or `purchaseOrderId`, `amount`}, `postingKey` (unique, idempotency).
- `PartyBalance`: `party`, `partyId`, `currencyCode` (unique triple), `openBalance` Float, `storeCredit` Float, `rebuiltAt`.

**API surface**: create payment (single write); data trigger workflow on `Payment` Inserted/Updated recomputes affected orders' `amountPaid`, `paymentStatus`, and the party balance; schedule workflow rebuilds all balances nightly.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Order paid | amount paid | sum of non voided allocations to that order |
| Balance | open balance | invoiced order totals − allocations, per currency |
| Aging | bucket | due date (spec 0011/0012) vs today |

**Key invariants**: sum of allocations ≤ amount; `postingKey` unique so a retried save never double pays.

**Security model**: payment entry needs Sales Order Edit (customer) or PO Edit (vendor); balances need Customer/Vendor View.

**Critical test scenarios**:
- Happy path: one 300 payment split 100/200 across two orders; both update, verifies **AC-1**, **AC-3**
- Failure case: allocations of 350 on a 300 payment are rejected, verifies **AC-2**
- Retry: the same payment saved twice creates one payment, verifies **AC-2**

## Build plan

1. Push `Payment` and `PartyBalance`, satisfies **AC-1**, **AC-2**
2. Payment entry screen, satisfies **AC-1**, **AC-2**
3. Data trigger workflow for order and balance updates, satisfies **AC-3**, **AC-4**, **AC-6**
4. Nightly rebuild workflow and aging view, satisfies **AC-4**, **AC-5**

## Consequences

**Positive**: payments are atomic and idempotent.
**Negative / tradeoffs**: balances may lag seconds; a nightly rebuild is required.
**Neutral**: accounting sync (spec 0018) reads payments.
