# 0010. Customers, vendors, pricing schemes and price resolution

**Date**: 2026-10-18
**Status**: In Progress

## Summary

Customers and vendors with their defaults (terms, pricing, tax, currency, addresses), named price lists (pricing schemes) with fixed or markup prices, volume price breaks, and the rule that picks the right price on an order line. All of this is plain records and browser side calculation, which fits Blocks. Prices are calculated in the browser, so the server does not stop someone from saving a wrong price; the "Sales Price Edit" permission and a review of totals are the guard.

## Context

PRD §3 (pricing scheme, taxing scheme), §5.5 (price resolution, tax), §5.6 (defaults pre fill orders), SO-10 credit limit field, PRD §9 item 1 (volume price breaks). DB design CUSTOMER, VENDOR, PRICING_SCHEME, PRODUCT_PRICE.

## Requirements

**User stories**:
- As a sales rep, I want to pick a customer and have their price list, terms, tax, and address filled in.
- As an owner, I want price lists in different currencies, with fixed prices or a markup over cost, plus quantity breaks.

**Acceptance criteria**:
- **AC-1**: A customer has name, contacts, billing and shipping addresses, pricing scheme, taxing scheme, payment terms, currency, default discount, sales rep, credit limit, and is deactivated rather than deleted once used.
- **AC-2**: A vendor has name, contacts, address, currency, payment terms, lead time, and is deactivated rather than deleted once used.
- **AC-3**: A pricing scheme has a name, currency, tax inclusive flag, and one default per company.
- **AC-4**: A product price in a scheme is either fixed or markup percent over current average cost.
- **AC-5**: Price on a sales line = customer's scheme price (else default scheme) → customer default discount → line discount → volume break for the quantity.
- **AC-6**: Line tax uses the order's taxing scheme and the line's tax code; tax 2 may compound on tax 1; tax inclusive schemes back calculate.
- **AC-7**: Changing a price on a line needs "Sales Price Edit".

## Options considered

### Option 1: Schemas per DB design plus `PriceBreak`
**Pros**: unique (product, scheme) pair index; easy price list export. **Cons**: price lookup needs a join.

### Option 2: Prices embedded on the product
**Pros**: one read. **Cons**: product document grows with every scheme; no uniqueness check.

## Decision

**Chosen option**: Option 1. Price resolution and tax run in one shared browser module used by sales orders, the portal, and imports.

**Implementation skills**: `blocks-data-gateway-configuration`, `blocks-data-gateway-crud`.

## Rationale

One shared calculation keeps every screen consistent. Unique indexes stop duplicate price rows on the server.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| §5.6 | Customers and vendors with defaults | Schemas + CRUD | ✅ Can do |
| §3 | Pricing schemes, fixed or markup | Schemas + unique index | ✅ Can do |
| §5.5 | Price resolution and tax | Browser module | ✅ Can do; ⚠️ not enforced on server (L4) |
| §9.1 | Volume price breaks | `PriceBreak` schema | ✅ Can do |
| AC-7 | Price edit permission | FrontendAction permission | ⚠️ UI only; server accepts any price (L4) |
| §5.6 | Deactivate once referenced | `isActive` + deny delete policy | ✅ Can do |

## Feature design

**Data model sketch**:
- `Customer`: `name` req, `email`, `phone`, `contacts` array (Dto: name, email, phone), `billingAddress`, `shippingAddress` (Dto), `pricingSchemeId`, `taxingSchemeId`, `paymentTermId`, `currencyCode`, `defaultDiscountPct` Float, `salesRepUserId` ID, `creditLimit` Float, `isActive`.
- `Vendor`: `name` req, `contacts`, `address`, `currencyCode`, `paymentTermId`, `leadTimeDays` Int, `isActive`.
- `PricingScheme`: `name` req (unique), `currencyCode` req, `isTaxInclusive`, `isDefault`.
- `ProductPrice`: `productId` req, `pricingSchemeId` req (unique pair), `priceType` (`fixed`, `markup`), `unitPrice` Float, `markupPct` Float.
- `PriceBreak`: `productPriceId` req, `minQty` Float req, `unitPrice` Float req.

**API surface**: CRUD per schema; `resolvePrice(customer, product, qty, date)` and `computeTax(lines, scheme, freight)` in the browser.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Resolve price | base price | `ProductPrice` (customer scheme, else default) |
| Markup price | cost | `Product.averageCost` (spec 0007) |
| Tax | rates | `TaxingScheme` + `TaxCode` (spec 0004) |

**Key invariants**: one price row per product and scheme; one default scheme; break quantities increase with lower or equal prices.

**Security model**: Customer View/Edit, Vendor View/Edit, Sales Price Edit; sales reps limited to their customers (spec 0011, SO-17).

**Critical test scenarios**:
- Happy path: customer on "Wholesale" scheme, qty 50 hits a break, price and tax correct, verifies **AC-5**, **AC-6**
- Failure case: product with no price in the customer's scheme falls back to default, verifies **AC-5**
- Auth/permission: a rep without Sales Price Edit cannot change the line price, verifies **AC-7**

## Build plan

- [x] 1. Push the five schemas with unique indexes, satisfies **AC-1** to **AC-4**
- [x] 2. Customer and vendor screens, satisfies **AC-1**, **AC-2**
- [x] 3. Pricing scheme and price list screens with breaks, satisfies **AC-3**, **AC-4**
- [x] 4. Shared price and tax module with tests, satisfies **AC-5**, **AC-6**, **AC-7** (shared module plus scripts/checks/pricing.mjs; the price edit right, AC-7, applies on order lines in spec 0011)

## Consequences

**Positive**: one shared price and tax calculation.
**Negative / tradeoffs**: prices are not checked by the server.
**Neutral**: markup prices change when average cost changes.
