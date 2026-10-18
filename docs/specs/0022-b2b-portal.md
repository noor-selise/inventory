# 0022. B2B ordering portal

**Date**: 2026-10-18
**Status**: Proposed

## Summary

Private ordering portals where a company's business customers log in, see their catalog and prices, optionally see stock, and place orders that arrive as sales orders. Blocks login, roles, and data rules can give each buyer their own account and limit what they see. Branding and custom domains per company are the weak spot: Blocks hosts one app per project, and adding domains is a portal (not CLI) task.

## Context

PRD §4.8 (B2B-1 to B2B-7), P1; B2B-5, B2B-6 are P2. B2B-7 (our call): real buyer accounts, not shared passwords.

## Requirements

**Acceptance criteria**:
- **AC-1**: A company creates one or more portals, each public or invite only.
- **AC-2**: Each portal has its product selection, visible fields, pricing scheme, colors, and logo.
- **AC-3**: A portal can show live stock or hide it.
- **AC-4**: Each buyer has their own login, sees only their company's portal and their own orders, and can reorder.
- **AC-5**: Checkout creates a sales order with source portal, optionally Unconfirmed for review.
- **AC-6**: Each portal can use a custom domain.
- **AC-7**: Card payments and abandoned cart emails. (P2)

## Options considered

### Option 1: Portal as a section of the same app, buyers as Blocks users with a "Buyer" role
**Pros**: one app, one login system. **Cons**: custom domain per portal needs Blocks domain setup per company.

### Option 2: A separate portal app per company
**Pros**: full branding. **Cons**: one Blocks app per project; many apps is unrealistic.

## Decision

**Chosen option**: Option 1. Custom domains (AC-6) wait until Blocks confirms multiple domains per app can be added per tenant.

**Implementation skills**: `blocks-iam-users`, `blocks-iam-access-control`, `blocks-iam-organizations`, `blocks-data-gateway-crud`, `blocks-mail`.

## Rationale

Buyer accounts with a Buyer role and row policies on `customerId` give real per buyer security (B2B-7) using what Blocks already has.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| B2B-1 | Public or invite only | Public data access for a public portal, invites for private | ⚠️ Public schemas open to anyone; needs a narrow public product view |
| B2B-2 | Selection, fields, scheme, branding | `Portal` schema | ✅ Can do |
| B2B-3 | Live stock | Read balances (spec 0007) | ⚠️ Depends on 0007 |
| B2B-4 | Checkout to sales order | Sales order create (spec 0011) | ✅ Can do |
| B2B-7 | Buyer accounts, own orders only | Blocks users + Buyer role + row policy on `customerId` | ⚠️ Row policy grammar undocumented (L6) |
| B2B-2 | Custom domain | `blocks release domain set` sets one custom domain per deployed repo (checked in CLI help); new environments are portal only. Nothing maps many company domains to one app | ⚠️ One domain per deployment, not per company portal |
| B2B-5 | Card payments (P2) | Workflow → payment provider | ⚠️ Possible, unproven |
| B2B-6 | Abandoned carts (P2) | `Cart` schema + schedule workflow + mail | ✅ Can do |

## Feature design

**Data model sketch**:
- `Portal`: `name`, `visibility` (`public`, `invite`), `productIds` or `categoryIds`, `visibleFields` String array, `pricingSchemeId`, `showStock`, `requireReview`, `primaryColor`, `logoFileId`, `domain`.
- `PortalBuyer`: `userId` (Blocks user), `customerId`, `portalId`.
- `Cart`: `buyerId`, `portalId`, `lines` array, `updatedAt`.

**API surface**: buyer signs in (Blocks login); reads `Portal` products and prices; `checkout(cart)` creates a `SalesOrder` with `source = portal`.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Show price | price | portal's pricing scheme (spec 0010) |
| Checkout | customer | `PortalBuyer.customerId` |

**Key invariants**: a buyer never reads another customer's orders or prices.

**Security model**: Buyer role reads portal products and own orders only; no access to cost or internal fields.

**Critical test scenarios**:
- Happy path: buyer signs in, orders 3 items, sales order appears Unconfirmed, verifies **AC-4**, **AC-5**
- Auth/permission: buyer A tries to open buyer B's order and gets nothing, verifies **AC-4**
- Branding: portal shows its logo and colors, verifies **AC-2**

## Build plan

1. `Portal`, `PortalBuyer`, `Cart`; Buyer role and policies, satisfies **AC-1**, **AC-2**, **AC-4**
2. Portal admin screen, satisfies **AC-2**, **AC-3**
3. Buyer catalog, cart, checkout, satisfies **AC-4**, **AC-5**
4. Custom domains once confirmed, satisfies **AC-6**
5. P2: payments, abandoned carts, satisfies **AC-7**

## Consequences

**Positive**: real buyer accounts with server side limits.
**Negative / tradeoffs**: custom domains are manual; public portals need care to not expose internal data.
**Neutral**: buyers count as Blocks users (check pricing with Blocks).
