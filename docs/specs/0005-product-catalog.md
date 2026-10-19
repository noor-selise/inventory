# 0005. Product catalog

**Date**: 2026-10-18
**Status**: In Progress

## Summary

Products, categories, barcodes, units of measure, vendor items, variants, custom fields, images, and attachments. This is plain record work and fits Blocks well: unique product names and SKUs are enforced with unique indexes, images go to Blocks storage, and barcode lookup is an indexed query. The only rule Blocks cannot enforce on the server is "tracking flags never change once set"; the app enforces it.

## Context

PRD §4.1 (PRD-P1 to P12), §3 glossary, DB design Catalog group (CATEGORY, PRODUCT, PRODUCT_BARCODE, VENDOR_ITEM). Pricing (PRODUCT_PRICE) is in spec 0010, BOM in spec 0020, reorder settings in spec 0014.

## Requirements

**User stories**:
- As an owner, I want to add products with name, SKU, type, unit, category, images, size and weight, so I can buy, sell, and track them.
- As a warehouse worker, I want to scan a barcode and find the product.
- As a purchaser, I want to record each vendor's code, cost, and lead time for a product.

**Acceptance criteria**:
- **AC-1**: A product has a unique name, an optional unique SKU, a type (stocked, non stocked, service), a standard unit, category, description, dimensions, weight, remarks.
- **AC-2**: The type cannot change after the product is saved.
- **AC-3**: A product has many barcodes; each barcode is unique in the company; scanning one finds the product in under a second.
- **AC-4**: A product can have a purchasing unit and a sales unit, each with a conversion to the standard unit (for example 1 case = 12 each).
- **AC-5**: Lots, serials, expiry flags exist on stocked products only, expiry needs lots, and none can change once set.
- **AC-6**: Products are deactivated, never deleted, once any document uses them.
- **AC-7**: Categories form a tree with one company default.
- **AC-8**: Each vendor item stores vendor code, cost in vendor currency per purchasing unit, lead time, and a preference order.
- **AC-9**: A product has many images with one default, and file attachments. (attachments P1)
- **AC-10**: Product groups with options (size, color) create one product per combination in bulk. (P1)
- **AC-11**: Up to 10 custom fields (text, dropdown, date, checkbox, number), optionally per category. (P1)
- **AC-12**: HS tariff code and country of origin per product. (P1)
- **AC-13**: Product search returns results fast at 100k products (PRD target 300 ms p95).

## Options considered

### Option 1: Separate schemas per DB design table

`Category`, `Product`, `ProductBarcode`, `VendorItem`, `ProductGroup`, `CustomFieldDefinition`.

**Pros**: unique index on barcode across the company; matches the DB design.

**Cons**: product screens need joins (GraphQL handles them).

### Option 2: Barcodes and vendor items embedded in the product document

**Pros**: one read per product.

**Cons**: a unique index cannot cover array items across products, so barcode uniqueness would be app only.

## Decision

**Chosen option**: Option 1: separate schemas, with images and attachments in Blocks storage referenced by file id.

**Implementation skills**: `blocks-data-gateway-configuration`, `blocks-data-gateway-crud`, `blocks-data-storage`.

## Rationale

Barcode and SKU uniqueness are hard rules (PRD §5.6), and unique indexes are the only server side uniqueness Blocks offers (L9). That needs barcodes as their own records.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| PRD-P1 | Product fields, unique name | Schema + unique index | ✅ Can do |
| PRD-P1 | SKU optional but unique if set | `blocks data schema indexes create --unique` has no sparse or partial option (checked in CLI help), so many products with no SKU would collide | ⚠️ Workaround: generate a SKU when the user leaves it empty, or check uniqueness in app only |
| PRD-P2 | Barcodes, generate, scan lookup | `ProductBarcode` + unique index; generation and scanning in the browser | ✅ Can do |
| PRD-P3 | Alternate units | Fields on product | ✅ Can do |
| PRD-P4 | Tracking flags immutable | App rule; no "immutable field" validation | ⚠️ App only (L4) |
| PRD-P5 | Shelf life, expiry alert days | Fields + schedule workflow for alerts (spec 0009) | ✅ Can do |
| PRD-P6 | Deactivate, never delete | `isActive` flag; deny Delete via row policy for all roles | ✅ Can do (deny delete), referenced check is app side (L7) |
| PRD-P7 | Variants bulk create | `insertManyProduct` | ✅ Can do |
| PRD-P8 | Vendor items | Schema + CRUD | ✅ Can do |
| PRD-P9 | Customs data | Fields | ✅ Can do |
| PRD-P10 | Custom fields | `CustomFieldDefinition` + a JSON string field on product | ⚠️ No JSON field type; store as String and validate in app |
| PRD-P11 | CSV import/export | Spec 0017 | see 0017 |
| PRD-P12 | Attachments | `blocks-data-storage` | ✅ Can do |
| NFR | Search < 300 ms at 100k SKUs | Indexes on name, SKU; prefix search | ⚠️ Unverified; no full text search documented |

## Feature design

**Data model sketch**:
- `Category`: `name` req, `parentId` ID (nullable, self ref), `isDefault` Boolean.
- `Product`: `name` req (unique), `sku` (unique if set), `itemType` String req (`stocked`, `non_stocked`, `service`), `standardUom` req, `purchaseUom`, `purchaseUomRatio` Float, `salesUom`, `salesUomRatio` Float, `categoryId` ID, `description`, `length`, `width`, `height`, `weight` Float, `remarks`, `trackLots`, `trackSerials`, `trackExpiry` Boolean, `shelfLifeDays`, `sellBeforeExpiryDays`, `expiryNoticeDays` Int, `hsCode`, `countryOfOrigin`, `imageFileIds` String array, `defaultImageFileId`, `attachmentFileIds` String array, `customFields` String (JSON), `productGroupId` ID, `averageCost` Float (written only by spec 0007), `isActive` Boolean.
- `ProductBarcode`: `barcode` req (unique), `productId` ID req.
- `VendorItem`: `vendorId` ID req, `productId` ID req (unique pair), `vendorItemCode`, `unitCost` Float, `currencyCode`, `leadTimeDays` Int, `preference` Int.
- `ProductGroup`: `name` req, `options` String (JSON: option names and values).
- `CustomFieldDefinition`: `label` req, `fieldType` req, `choices` String array, `categoryId` ID.

**API surface**: `data.collection("Product")` CRUD; GraphQL `getProducts` with `where` on name or SKU and a join to barcodes; `insertManyProduct` for variants; `data.files` upload for images.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Scan | product | `ProductBarcode.barcode` index → `productId` |
| Show cost | average cost | `Product.averageCost`, masked by DataProtection (spec 0003) |
| Default lot expiry | date | receive date + `shelfLifeDays` (spec 0009) |

**Key invariants**: unique name, SKU, barcode per company; `itemType` and tracking flags never change after first save; expiry needs lots; tracking only on stocked.

**Security model**: Product View for all staff; Product Edit for Admin, Manager, Purchasing; cost fields masked without Cost View.

**Critical test scenarios**:
- Happy path: create a product with two barcodes, scan one, product opens, verifies **AC-1**, **AC-3**
- Failure case: second product with the same SKU is rejected by the unique index, verifies **AC-1**
- Auth/permission: Warehouse user sees the product without cost, verifies **AC-1** with spec 0003 AC-5

## Build plan

- [x] 1. Push `Category`, `Product`, `ProductBarcode`, `VendorItem` with unique indexes, satisfies **AC-1**, **AC-3**, **AC-7**, **AC-8** (all live; VendorItem and its screen arrived with spec 0010)
- [x] 2. Product list with paged search, product form with type lock and tracking rules, satisfies **AC-1**, **AC-2**, **AC-5**, **AC-13**
- [x] 3. Barcode add, generate, scan to find, satisfies **AC-3**
- [x] 4. Units and conversions, satisfies **AC-4**
- [ ] 5. Images via Blocks storage, satisfies **AC-9** (not built)
- [x] 6. Deactivate instead of delete, satisfies **AC-6**
- [ ] 7. P1: variants, custom fields, customs data, attachments, satisfies **AC-9** to **AC-12** (P1, not built)

## Consequences

**Positive**: all on documented Blocks features; uniqueness enforced on the server.

**Negative / tradeoffs**: immutability rules are app only; search speed at 100k products is unproven.

**Neutral**: `averageCost` lives on the product but is owned by spec 0007.

## Follow-up

- [ ] Decide the empty SKU rule: generate one automatically (recommended, keeps the server unique index) or allow empty and check in app.
- [ ] SET-4 (custom fields on orders, customers, vendors, counts, transfers, adjustments, lots, with "print on document") reuses `CustomFieldDefinition` with an `appliesTo` field; same JSON string storage and the same ⚠️ (P1).
- [ ] Load test product search at 100k records.
