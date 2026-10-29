# Schema relationships

All 60 data schemas in `blocks/data/schemas/`, grouped by business area, with diagrams. Field names are copied from the JSON files. Unique keys come from `blocks/data/indexes.json`.

## Read this first

- **Two kinds of schema.** `schemaType 1` is a real collection (a table you can query). `schemaType 2` is a **value type**: it has no table of its own and is stored *inside* its parent record. For example, a `SalesOrder` holds its `SalesLine` list. One order and all its lines save in one write, which matters because Blocks has no multi-record transactions. There are 44 collections and 16 value types.
- **System fields** are added by Blocks to every collection and are not in the JSON: `ItemId` (the primary key), `OrganizationId` (which company), `CreatedBy`, `CreatedDate`, `LastUpdatedBy`, `LastUpdatedDate`. Every `...Id` field of type `ID` points at another record's `ItemId`.
- **No foreign keys on the server.** Blocks does not enforce links. The app keeps them correct. Records that are in use are deactivated (`isActive = false`), not deleted.
- **Original design.** `docs/02-database-design.md` is the first relational design (with tables like `SALES_ORDER_LINE`). On Blocks, line tables became embedded value types, and `ROLE` / `TEAM_MEMBER` became Blocks IAM roles and users plus `TeamMemberProfile`.

In the diagrams: `PK` = primary key, `FK` = points at another record, `UK` = part of a unique key. Value types are marked `(embedded)` in the purpose tables.

## Overview: how the areas link

```mermaid
flowchart TB
    SET[Company and settings<br/>Company, Currency, TaxingScheme, NumberingRule...]
    PPL[People<br/>TeamMemberProfile]
    CAT[Catalog and pricing<br/>Product, Category, PricingScheme, VendorItem]
    PAR[Customers and vendors<br/>Customer, Vendor]
    LED[Locations and stock ledger<br/>Location, Sublocation, Lot,<br/>InventoryMovement, InventoryBalance]
    DOC[Stock documents<br/>StockAdjustment, StockTransfer, StockCount]
    SAL[Sales<br/>SalesOrder]
    PUR[Purchasing<br/>PurchaseOrder]
    PAY[Payments<br/>Payment, PartyBalance]
    REO[Reordering<br/>ReorderSetting, ReorderSuggestion]
    REP[Reports and jobs<br/>DailySalesSummary, DailyStockSummary,<br/>SavedReport, ReportJob, WorkflowRun]
    AST[Fixed assets<br/>FixedAsset, DepreciationClass,<br/>DepreciationEntry, DepreciationRun]

    SET --> CAT
    SET --> PAR
    SET --> SAL
    SET --> PUR
    PPL -->|allowed locations| LED
    CAT --> SAL
    CAT --> PUR
    CAT --> LED
    PAR --> SAL
    PAR --> PUR
    SAL -->|pick, restock| LED
    PUR -->|receive, return| LED
    DOC -->|adjust, transfer, count| LED
    SAL --> PAY
    PUR --> PAY
    LED --> REO
    REO -->|drafts| PUR
    REO -->|drafts| DOC
    LED --> REP
    SAL --> REP
    PUR -->|asset lines| AST
    CAT --> AST
```

The heart is the **stock ledger**. Sales, purchasing and stock documents never change quantities directly; they all post movements to it.

---

## 1. Company and settings

| Schema | Purpose |
|---|---|
| `Company` | The company profile, one per organization: name, home currency, time zone, country, plus the depreciation control state (`depreciationStatus`, `depreciationLatestClosed`...). |
| `Currency` | A currency the company trades in (`code` unique, symbol, decimals). |
| `ExchangeRate` | A rate for a currency from an effective date. |
| `NumberingRule` | Running document numbers per document type (`prefix`, `padding`, `nextNumber`). |
| `TaxingScheme` | A set of up to two taxes (rates, on shipping, compounding, tax inclusive). |
| `TaxCode` | A per-product tax rate inside a taxing scheme. |
| `PaymentTerm` | Payment terms, such as Net 30 (`daysDue`). |
| `PaymentMethod` | Cash, bank transfer, card... |
| `Carrier` | Shipping carriers. |
| `AdjustmentReason` | Reasons for stock adjustments (system ones such as "Opening stock" have `isSystem`). |
| `Address` | (embedded) A postal address inside customers, vendors and orders. |
| `Contact` | (embedded) A contact person inside customers, vendors and orders. |

```mermaid
erDiagram
    Company {
        ID ItemId PK
        String name
        String homeCurrency
        String countryCode
        String timeZone
        String depreciationStatus
        String depreciationLatestClosed
    }
    Currency {
        ID ItemId PK
        String code UK
        String symbol
        Int decimals
    }
    ExchangeRate {
        ID ItemId PK
        String currencyCode FK
        Float rate
        DateTime effectiveOn
    }
    NumberingRule {
        ID ItemId PK
        String documentType UK
        String prefix
        Int nextNumber
    }
    TaxingScheme {
        ID ItemId PK
        String name
        Float tax1Rate
        Float tax2Rate
        Boolean isTaxInclusive
    }
    TaxCode {
        ID ItemId PK
        ID taxingSchemeId FK
        Float tax1Rate
        Float tax2Rate
    }
    PaymentTerm {
        ID ItemId PK
        String name
        Int daysDue
    }
    PaymentMethod {
        ID ItemId PK
        String name
        Boolean isSystem
    }
    Carrier {
        ID ItemId PK
        String name
        Boolean isSystem
    }
    AdjustmentReason {
        ID ItemId PK
        String name
        Boolean isSystem
    }
    Currency ||--o{ ExchangeRate : "has rates"
    Company }o--|| Currency : "home currency"
    TaxingScheme ||--o{ TaxCode : "contains"
```

`Company.homeCurrency` and `ExchangeRate.currencyCode` hold the currency code (a String), not an `ItemId`.

## 2. People and access

| Schema | Purpose |
|---|---|
| `TeamMemberProfile` | Per-person settings Blocks users don't hold: PO approval limit, allowed locations, own customers only, stockroom user flag, dashboard tiles. One per user (`userId` unique). |

Users, roles and organizations themselves live in **Blocks IAM**, not in data schemas.

```mermaid
erDiagram
    BlocksUser {
        ID userId PK "Blocks IAM user, not a schema"
        String roles "admin, manager, sales..."
    }
    TeamMemberProfile {
        ID ItemId PK
        ID userId FK,UK
        Float poApprovalLimit "-1 means no limit"
        ID allowedLocationIds "array, empty means all"
        Boolean ownCustomersOnly
        Boolean isStockroomUser
        String dashboardWidgets "array"
    }
    Location {
        ID ItemId PK
        String name UK
    }
    BlocksUser ||--o| TeamMemberProfile : "has settings"
    TeamMemberProfile }o--o{ Location : "allowed at"
```

## 3. Catalog and pricing

| Schema | Purpose |
|---|---|
| `Category` | A product category; `parentId` makes it a tree. |
| `Product` | A product or service: SKU, units and ratios, size and weight, tracking flags (lots, serials, expiry), `averageCost` guarded by `costVersion`, last vendor, depreciation class for asset products. |
| `ProductBarcode` | A barcode for a product, unique across the company. |
| `VendorItem` | What one vendor calls and charges for one product: code, unit cost, lead time, preference. |
| `PricingScheme` | A price list (Retail, Wholesale) in one currency. |
| `ProductPrice` | A product's price in one price list (fixed price or markup). |
| `PriceBreak` | A volume price: from `minQty` units, this unit price. |

```mermaid
erDiagram
    Category {
        ID ItemId PK
        String name UK
        ID parentId FK,UK
        Boolean isDefault
    }
    Product {
        ID ItemId PK
        String name UK
        String sku UK
        String itemType
        ID categoryId FK
        String standardUom
        Float purchaseUomRatio
        Float salesUomRatio
        Boolean trackLots
        Boolean trackSerials
        Float averageCost "cost viewers only"
        Int costVersion
        ID lastVendorId FK
        ID depreciationClassId FK
    }
    ProductBarcode {
        ID ItemId PK
        String barcode UK
        ID productId FK
    }
    Vendor {
        ID ItemId PK
        String name UK
    }
    VendorItem {
        ID ItemId PK
        ID vendorId FK,UK
        ID productId FK,UK
        String vendorItemCode
        Float unitCost
        Int leadTimeDays
        Int preference
    }
    PricingScheme {
        ID ItemId PK
        String name UK
        String currencyCode
        Boolean isDefault
    }
    ProductPrice {
        ID ItemId PK
        ID productId FK,UK
        ID pricingSchemeId FK,UK
        String priceType
        Float unitPrice
        Float markupPct
    }
    PriceBreak {
        ID ItemId PK
        ID productPriceId FK,UK
        Float minQty UK
        Float unitPrice
    }
    Category ||--o{ Category : "parent of"
    Category ||--o{ Product : "groups"
    Product ||--o{ ProductBarcode : "has"
    Product ||--o{ VendorItem : "bought as"
    Vendor ||--o{ VendorItem : "sells"
    Vendor |o--o{ Product : "last vendor"
    Product ||--o{ ProductPrice : "priced in"
    PricingScheme ||--o{ ProductPrice : "contains"
    ProductPrice ||--o{ PriceBreak : "volume breaks"
```

## 4. Customers and vendors

| Schema | Purpose |
|---|---|
| `Customer` | A customer with defaults copied onto new orders: price list, taxing scheme, terms, currency, discount, sales rep, credit limit, addresses, contacts. |
| `Vendor` | A vendor with currency, terms, lead time, address, contacts. |

```mermaid
erDiagram
    Customer {
        ID ItemId PK
        String name UK
        ID pricingSchemeId FK
        ID taxingSchemeId FK
        ID paymentTermId FK
        String currencyCode
        ID salesRepUserId FK "Blocks user"
        Float creditLimit "0 means none"
        Address billingAddress "embedded"
        Address shippingAddress "embedded"
        Contact contacts "embedded array"
    }
    Vendor {
        ID ItemId PK
        String name UK
        ID paymentTermId FK
        String currencyCode
        Int leadTimeDays
        Address address "embedded"
        Contact contacts "embedded array"
    }
    PricingScheme {
        ID ItemId PK
    }
    TaxingScheme {
        ID ItemId PK
    }
    PaymentTerm {
        ID ItemId PK
    }
    Address {
        String line1
        String city
        String country
    }
    Contact {
        String name
        String email
        String phone
    }
    PricingScheme |o--o{ Customer : "default prices"
    TaxingScheme |o--o{ Customer : "default tax"
    PaymentTerm |o--o{ Customer : "default terms"
    PaymentTerm |o--o{ Vendor : "default terms"
    Customer ||--|{ Address : "embeds"
    Customer ||--o{ Contact : "embeds"
    Vendor ||--o| Address : "embeds"
    Vendor ||--o{ Contact : "embeds"
```

## 5. Locations and the stock ledger

| Schema | Purpose |
|---|---|
| `Location` | A warehouse, store, truck or site (`kind`). |
| `Sublocation` | A bin inside a location (`code` unique per location). |
| `Lot` | A batch of one product with made on, expires on, sell by dates (`lotNumber` unique per product). |
| `InventoryMovement` | **The ledger.** One row per quantity change: product, location, bin, lot, serial, signed `qtyDelta`, `unitCost`, which document caused it (`sourceType`, `sourceId`), `status` (pending, posted, failed, reversed), unique `postingKey`. Never edited after posting. |
| `InventoryBalance` | Running on hand per (product, location, bin, lot, serial), with `picked`, a `version` for compare and set, and `appliedKeys` (last 50 posting keys) for repair. |

```mermaid
erDiagram
    Location {
        ID ItemId PK
        String name UK
        String kind
        Boolean isDefault
        Boolean isActive
    }
    Sublocation {
        ID ItemId PK
        ID locationId FK,UK
        String code UK
    }
    Product {
        ID ItemId PK
        Float averageCost
        Int costVersion
    }
    Lot {
        ID ItemId PK
        ID productId FK,UK
        String lotNumber UK
        DateTime madeOn
        DateTime expiresOn
        DateTime sellBy
    }
    InventoryMovement {
        ID ItemId PK
        ID productId FK
        ID locationId FK
        ID sublocationId FK
        ID lotId FK
        String serial
        Float qtyDelta "signed, standard unit"
        Float unitCost
        String sourceType "sales_pick, purchase_receive..."
        ID sourceId FK "the document"
        String sourceLineId
        DateTime effectiveAt
        String status "pending, posted, failed, reversed"
        String postingKey UK
    }
    InventoryBalance {
        ID ItemId PK
        ID productId FK,UK
        ID locationId FK,UK
        ID sublocationId FK,UK
        ID lotId FK,UK
        String serial UK
        Float onHand
        Float picked
        Int version "compare and set guard"
        String appliedKeys "array, last 50"
    }
    Location ||--o{ Sublocation : "has bins"
    Product ||--o{ Lot : "batches"
    Product ||--o{ InventoryMovement : "moves"
    Location ||--o{ InventoryMovement : "at"
    Sublocation |o--o{ InventoryMovement : "in bin"
    Lot |o--o{ InventoryMovement : "of lot"
    Product ||--o{ InventoryBalance : "stocked as"
    Location ||--o{ InventoryBalance : "holds"
    Sublocation |o--o{ InventoryBalance : "in bin"
    Lot |o--o{ InventoryBalance : "of lot"
    InventoryMovement }o--|| InventoryBalance : "sums to"
```

`sourceType` values in code (`src/features/stock/posting.ts`): `adjustment`, `adjustment_reversal`, `transfer_send`, `transfer_receive`, `transfer_reversal`, `purchase_receive`, `po_unstock`, `purchase_reversal`, `sales_pick`, `sales_restock`, `sales_reversal`, `mo_pick`, `mo_put`, `rollback`.

## 6. Stock documents (adjust, transfer, count)

| Schema | Purpose |
|---|---|
| `StockAdjustment` | A stock change with a reason at one location; `costStatus` guards the one-time cost update for "Opening stock" (spec 0029). |
| `AdjustmentLine` | (embedded) One adjusted line: product, bin, lot or serial, signed `qtyDelta`, `unitCost`. |
| `StockTransfer` | Moving stock from one location to another; `status` Open → In transit → Completed. |
| `TransferLine` | (embedded) One transferred line, with from and to bins. |
| `StockCount` | A stock take at one location, split into sheets; links to the `adjustmentId` it posted. |
| `CountSheet` | (embedded) One person's part of a count (`assigneeId`, `status`). |
| `CountLine` | (embedded) Expected vs counted quantity for one product, bin, lot or serial. |

```mermaid
erDiagram
    StockAdjustment {
        ID ItemId PK
        String number UK
        ID locationId FK
        ID reasonId FK
        DateTime adjustedAt
        String status
        String costStatus "null, applying, applied"
    }
    AdjustmentLine {
        String lineId
        ID productId FK
        ID sublocationId FK
        ID lotId FK
        String serial
        Float qtyDelta
        Float unitCost
    }
    AdjustmentReason {
        ID ItemId PK
        String name
    }
    StockTransfer {
        ID ItemId PK
        String number UK
        ID fromLocationId FK
        ID toLocationId FK
        String status "open, in_transit, completed"
        DateTime sentAt
        DateTime receivedAt
    }
    TransferLine {
        String lineId
        ID productId FK
        ID fromSublocationId FK
        ID toSublocationId FK
        ID lotId FK
        Float qty
    }
    StockCount {
        ID ItemId PK
        String number UK
        ID locationId FK
        String status
        ID adjustmentId FK
        Int revision
    }
    CountSheet {
        String sheetId
        String name
        ID assigneeId FK "Blocks user"
        String status
    }
    CountLine {
        String lineId
        ID productId FK
        ID sublocationId FK
        ID lotId FK
        Float expectedQty
        Float countedQty
    }
    Location {
        ID ItemId PK
    }
    AdjustmentReason ||--o{ StockAdjustment : "explains"
    Location ||--o{ StockAdjustment : "at"
    StockAdjustment ||--|{ AdjustmentLine : "embeds"
    Location ||--o{ StockTransfer : "from"
    Location ||--o{ StockTransfer : "to"
    StockTransfer ||--|{ TransferLine : "embeds"
    Location ||--o{ StockCount : "counted"
    StockCount ||--|{ CountSheet : "embeds"
    CountSheet ||--|{ CountLine : "embeds"
    StockCount |o--o| StockAdjustment : "posts variances as"
```

## 7. Sales

| Schema | Purpose |
|---|---|
| `SalesOrder` | A sales quote or order with everything inside it: snapshot of customer details, lines, packages, shipments, stock steps, history, derived `inventoryStatus` and `paymentStatus`, `cogs`, credit hold (`needsConfirmation`, `confirmedBy`), picking lock. |
| `SalesLine` | (embedded) One order line, with progress counters `pickedQty`, `packedQty`, `shippedQty`, `restockedQty`. A negative `qty` is a return (`returnAction`). |
| `SalesPackage` | (embedded) A box packed for the order. |
| `PackageLine` | (embedded) Which line and how many units are in a package. |
| `SalesShipment` | (embedded) A shipment: carrier, tracking number, the packages in it. |
| `StockStep` | (embedded, shared with POs) One stock action on an order (pick, restock, receive, unstock) with its own status, so a half-finished step can be settled from the ledger. |
| `StockStepLine` | (embedded) A line of a stock step: quantity, bin, lot, serial, unit cost. |
| `OrderEvent` | (embedded, shared with POs) One history entry: when, who, what. |

```mermaid
erDiagram
    Customer {
        ID ItemId PK
        Float creditLimit
    }
    SalesOrder {
        ID ItemId PK
        String number UK
        Boolean isQuote
        ID customerId FK
        ID locationId FK
        ID pricingSchemeId FK
        ID taxingSchemeId FK
        ID paymentTermId FK
        ID salesRepUserId FK "Blocks user"
        String currencyCode
        Float total
        Float amountPaid
        String inventoryStatus "derived"
        String paymentStatus "derived"
        Boolean needsConfirmation
        String confirmedBy
        Float cogs
        String pickingLockedBy
        Int revision "compare and set guard"
    }
    SalesLine {
        String lineId
        ID productId FK
        Float qty "negative means return"
        Float stdQty
        Float unitPrice
        ID taxCodeId FK
        Float pickedQty
        Float packedQty
        Float shippedQty
        Float restockedQty
    }
    SalesPackage {
        String number
        DateTime packedAt
        String shipmentId
    }
    PackageLine {
        String lineId
        Float qty
    }
    SalesShipment {
        String shipmentId
        ID carrierId FK
        String trackingNumber
        DateTime shippedAt
    }
    StockStep {
        String stepId
        String kind "pick, restock, receive, unstock"
        String status "posting, posted, failed"
        String by
    }
    StockStepLine {
        String lineId
        Float qty
        ID sublocationId FK
        ID lotId FK
        String serial
        Float unitCost
    }
    OrderEvent {
        DateTime at
        String by
        String action
        String details
    }
    Location {
        ID ItemId PK
    }
    Carrier {
        ID ItemId PK
    }
    Customer ||--o{ SalesOrder : "places"
    Location ||--o{ SalesOrder : "ships from"
    SalesOrder ||--|{ SalesLine : "embeds"
    SalesOrder ||--o{ SalesPackage : "embeds"
    SalesPackage ||--|{ PackageLine : "embeds"
    SalesOrder ||--o{ SalesShipment : "embeds"
    Carrier |o--o{ SalesShipment : "carries"
    SalesOrder ||--o{ StockStep : "embeds"
    StockStep ||--|{ StockStepLine : "embeds"
    SalesOrder ||--o{ OrderEvent : "history"
```

`PackageLine.lineId` and `StockStepLine.lineId` point at a `SalesLine.lineId` in the same order. `SalesShipment.packageNumbers` lists `SalesPackage.number` values.

## 8. Purchasing

| Schema | Purpose |
|---|---|
| `PurchaseOrder` | A purchase quote or PO with everything inside: vendor snapshot, receive location, currency and rate, freight, non-vendor costs, landed cost method (`allocationMethod`), approval (`approvedBy`, `approvedAt`), lines, stock steps, history, derived statuses. Can be a dropship for a sales order. |
| `PurchaseLine` | (embedded) One PO line, with `receivedQty`. A negative `qty` is a return to vendor. |
| `ExtraCost` | (embedded) A non-vendor cost such as duty or insurance (percent or fixed), spread into landed cost. |

```mermaid
erDiagram
    Vendor {
        ID ItemId PK
    }
    PurchaseOrder {
        ID ItemId PK
        String number UK
        Boolean isQuote
        ID vendorId FK
        ID receiveLocationId FK
        ID taxingSchemeId FK
        ID paymentTermId FK
        ID carrierId FK
        ID dropshipSalesOrderId FK
        String currencyCode
        Float exchangeRate
        Float freight
        Float total
        Float amountPaid
        String allocationMethod "value, weight, volume"
        String approvedBy
        DateTime approvedAt
        String inventoryStatus "derived"
        String paymentStatus "derived"
        Int revision
    }
    PurchaseLine {
        String lineId
        ID productId FK
        String vendorItemCode
        Float qty "negative means return"
        Float stdQty
        Float unitPrice "cost viewers only"
        ID taxCodeId FK
        Float receivedQty
    }
    ExtraCost {
        String name
        String type "percent or fixed"
        Float amount
    }
    StockStep {
        String stepId
        String kind
        String status
    }
    OrderEvent {
        DateTime at
        String action
    }
    Location {
        ID ItemId PK
    }
    SalesOrder {
        ID ItemId PK
    }
    Vendor ||--o{ PurchaseOrder : "supplies"
    Location ||--o{ PurchaseOrder : "received at"
    SalesOrder |o--o{ PurchaseOrder : "dropship for"
    PurchaseOrder ||--|{ PurchaseLine : "embeds"
    PurchaseOrder ||--o{ ExtraCost : "embeds"
    PurchaseOrder ||--o{ StockStep : "embeds"
    PurchaseOrder ||--o{ OrderEvent : "history"
```

## 9. Payments and balances

| Schema | Purpose |
|---|---|
| `Payment` | A customer or vendor payment (or refund, store credit, batch), with its split across orders inside. `party` says customer or vendor; `partyId` is that record. |
| `PaymentAllocation` | (embedded) How much of the payment goes to one order (`orderType` sales or purchase, `orderId`). |
| `PartyBalance` | Open balance and store credit per customer or vendor and currency, a precomputed total (unique on party, partyId, currencyCode). |

```mermaid
erDiagram
    Payment {
        ID ItemId PK
        String number UK
        String party "customer or vendor"
        ID partyId FK
        String type
        ID methodId FK
        Float amount
        String currencyCode
        DateTime paidOn
        Boolean isVoided
        String postingKey UK
        Int revision
    }
    PaymentAllocation {
        String orderType "sales or purchase"
        ID orderId FK
        String orderNumber
        Float amount
    }
    PartyBalance {
        ID ItemId PK
        String party UK
        ID partyId FK,UK
        String currencyCode UK
        Float invoiced
        Float paid
        Float openBalance
        Float storeCredit
    }
    PaymentMethod {
        ID ItemId PK
    }
    Customer {
        ID ItemId PK
    }
    Vendor {
        ID ItemId PK
    }
    SalesOrder {
        ID ItemId PK
        Float amountPaid
    }
    PurchaseOrder {
        ID ItemId PK
        Float amountPaid
    }
    PaymentMethod ||--o{ Payment : "paid by"
    Customer |o--o{ Payment : "party = customer"
    Vendor |o--o{ Payment : "party = vendor"
    Payment ||--|{ PaymentAllocation : "embeds"
    SalesOrder |o--o{ PaymentAllocation : "orderType = sales"
    PurchaseOrder |o--o{ PaymentAllocation : "orderType = purchase"
    Customer |o--o{ PartyBalance : "balance per currency"
    Vendor |o--o{ PartyBalance : "balance per currency"
```

## 10. Reordering

| Schema | Purpose |
|---|---|
| `ReorderSetting` | Reorder point, quantity, safety stock and method (PO, transfer, manufacture) per product and location, with the preferred vendor or source location and alert state. |
| `ReorderSuggestion` | The rebuilt list of products below their reorder point, with the quantities used (on hand, reserved, on order, anticipated) and a suggested quantity. |

```mermaid
erDiagram
    ReorderSetting {
        ID ItemId PK
        ID productId FK,UK
        ID locationId FK,UK
        Float reorderPoint
        Float reorderQty
        Float safetyStock
        String method "po, transfer, manufacture"
        ID vendorId FK
        ID sourceLocationId FK
        ID sublocationId FK
        Boolean isAlerting
    }
    ReorderSuggestion {
        ID ItemId PK
        ID productId FK,UK
        ID locationId FK,UK
        Float onHand
        Float reserved
        Float onOrder
        Float anticipated
        Float reorderPoint
        Float suggestedQty
        ID vendorId FK
        ID sourceLocationId FK
    }
    Product {
        ID ItemId PK
    }
    Location {
        ID ItemId PK
    }
    Vendor {
        ID ItemId PK
    }
    Product ||--o{ ReorderSetting : "reorder rule"
    Location ||--o{ ReorderSetting : "at"
    Vendor |o--o{ ReorderSetting : "buy from"
    Location |o--o{ ReorderSetting : "move from"
    Product ||--o{ ReorderSuggestion : "needs"
    Location ||--o{ ReorderSuggestion : "at"
```

## 11. Reports and background jobs

| Schema | Purpose |
|---|---|
| `DailySalesSummary` | Sales per day, product, location, customer and rep in home currency (qty, revenue, cogs, tax). Pre-added because Blocks cannot sum on the server. |
| `DailyStockSummary` | Stock on hand and value per day, product and location. |
| `SavedReport` | A person's saved report filters and columns, optionally shared. |
| `ReportJob` | **Dormant.** Was used by "Run in the background" (removed 2026-10-29). Kept, not deleted (see `docs/designs/instant-report-export.md`). |
| `WorkflowRun` | One row per scheduled-job run; the unique `runKey` makes the daily reorder check run once a day. |

```mermaid
erDiagram
    DailySalesSummary {
        ID ItemId PK
        String summaryKey UK
        String day
        ID productId FK
        ID locationId FK
        ID customerId FK
        ID salesRepUserId FK
        Float qty
        Float revenue
        Float cogs
    }
    DailyStockSummary {
        ID ItemId PK
        String summaryKey UK
        String day
        ID productId FK
        ID locationId FK
        Float onHand
        Float value
    }
    SavedReport {
        ID ItemId PK
        String name
        String reportKey
        String filters
        Boolean isShared
        ID ownerId FK "Blocks user"
    }
    ReportJob {
        ID ItemId PK
        String reportKey
        String status
        String fileId
        String ownerId
    }
    WorkflowRun {
        ID ItemId PK
        String workflow
        String status
        String runKey UK
        DateTime ranAt
    }
    Product {
        ID ItemId PK
    }
    Location {
        ID ItemId PK
    }
    Customer {
        ID ItemId PK
    }
    Product ||--o{ DailySalesSummary : "sold"
    Location ||--o{ DailySalesSummary : "at"
    Customer ||--o{ DailySalesSummary : "to"
    Product ||--o{ DailyStockSummary : "stocked"
    Location ||--o{ DailyStockSummary : "at"
```

## 12. Fixed assets and depreciation

| Schema | Purpose |
|---|---|
| `DepreciationClass` | A depreciation class and yearly rate (WDV method), per organization, maybe copied from a country preset. |
| `FixedAsset` | One owned unit that loses value: product, class, location, the PO it came from, serial, in-service date, cost, opening WDV, status, disposal. |
| `DepreciationEntry` | One month's depreciation for one asset, never edited (unique on asset and period). |
| `DepreciationRun` | The audit log of month closes and reopens. |

```mermaid
erDiagram
    Company {
        ID ItemId PK
        String depreciationStatus "open, closing, reopening"
        String depreciationLatestClosed "YYYY-MM"
        String depreciationRunId
    }
    DepreciationClass {
        ID ItemId PK
        String code UK
        String name
        String method
        Float ratePercent
    }
    FixedAsset {
        ID ItemId PK
        String assetNumber UK
        String unitKey UK
        ID productId FK
        ID classId FK
        ID locationId FK
        ID purchaseOrderId FK
        String serialNumber
        DateTime inServiceDate
        Float cost
        Float openingWdv
        String status
        DateTime disposalDate
    }
    DepreciationEntry {
        ID ItemId PK
        ID assetId FK,UK
        String period UK "YYYY-MM"
        ID classId FK
        Float base
        Float amount
        Float closingWdv
        String runId
    }
    DepreciationRun {
        ID ItemId PK
        String action "close or reopen"
        String period
        String runId
        Int assetCount
        Float total
    }
    Product {
        ID ItemId PK
        ID depreciationClassId FK
    }
    PurchaseOrder {
        ID ItemId PK
    }
    DepreciationClass ||--o{ Product : "default class"
    DepreciationClass ||--o{ FixedAsset : "rate"
    Product ||--o{ FixedAsset : "unit of"
    PurchaseOrder |o--o{ FixedAsset : "bought on"
    FixedAsset ||--o{ DepreciationEntry : "charged"
    DepreciationRun ||--o{ DepreciationEntry : "runId wrote"
    Company ||--o{ DepreciationRun : "closes months"
```

## 13. Temporary

| Schema | Purpose |
|---|---|
| `CostProbe` | A scratch schema (`name`, `cost`) used to test whether Blocks can hide a column for some roles (spec 0003 AC-5). To be deleted after that decision (build step 5d). |

---

## How stock quantities are derived (specs 0007 and 0026)

### The one rule

**Nobody edits on hand.** Every stock change (receive, pick, restock, adjust, transfer, count) goes through one posting engine (`src/features/stock/posting.ts`), which writes a movement and updates the balance. So:

- `InventoryBalance.onHand` = the sum of its posted `InventoryMovement.qtyDelta` rows (spec 0007 AC-2).
- Stock on any past date can be rebuilt by summing movements up to that date (the "Stock as of a date" report).
- Cancelling a document writes *reversing* movements; history is never rewritten.

```mermaid
flowchart LR
    PO[PO Receive] -->|"+qty purchase_receive"| M[(InventoryMovement<br/>ledger)]
    RTV[Return to vendor] -->|"-qty po_unstock"| M
    SO[Sales order Pick] -->|"-qty sales_pick"| M
    RS[Restock returns] -->|"+qty sales_restock"| M
    ADJ[Adjustment] -->|"+/- qty adjustment"| M
    TS[Transfer Send] -->|"-qty transfer_send"| M
    TR[Transfer Receive] -->|"+qty transfer_receive"| M
    CNT[Count completed] -->|posts an adjustment| ADJ
    M --> B[(InventoryBalance<br/>on hand)]
    PO -. landed cost .-> C[Product.averageCost]
```

### Posting one line safely (compare and set, spec 0026)

Blocks has no transactions, but a filtered update is atomic on one record. A probe proved it: 10 identical updates fired at once, exactly 1 changed the record.

```mermaid
sequenceDiagram
    participant App as Posting engine
    participant Mv as InventoryMovement
    participant Bal as InventoryBalance
    App->>Mv: insert status pending, unique postingKey
    App->>Bal: read row (create with onHand 0 if missing)
    App->>App: check onHand covers the line
    App->>Bal: update where ItemId and version match<br/>set onHand + delta, version + 1, add postingKey
    alt 0 rows changed (someone else won)
        App->>Bal: wait, read again, retry (up to 10 times)
    else 1 row changed
        App->>Mv: mark posted
    end
```

- The `postingKey` (`sourceType:sourceId:sourceLineId`) is unique, so a retry never counts twice.
- If the browser closes midway, the movement stays `pending`. After 2 minutes a repair step checks the balance's `appliedKeys`: key present → mark `posted`; absent → mark `failed`.
- A document posts line by line; if a line fails, the posted lines are reversed, so in effect it is all or nothing.
- Serial balances stay 0 or 1. On hand cannot go below zero unless an Admin or Manager confirms an override.
- The same compare and set guards `Product.averageCost` with `Product.costVersion` when receipts land.

### The quantities on the Stock screen

Computed in one pure function, `computeQuantities` in `src/features/stock/quantities.ts`. Only **on hand** is stored. Everything else is worked out from open documents, so it can't drift.

| Quantity | Formula | Comes from |
|---|---|---|
| **On hand** | sum of balances | `InventoryBalance.onHand` |
| **Picked** | `pickedQty − shippedQty` on open sales lines | `SalesOrder.lines` |
| **Reserved** (committed) | `stdQty − pickedQty` on open sales lines, plus open transfers going out | `SalesOrder.lines`, `StockTransfer` (status open, at the from location) |
| **On order** | `stdQty − receivedQty` on open PO lines, plus transfers coming in (open or in transit) | `PurchaseOrder.lines`, `StockTransfer` (at the to location) |
| **In transit** | quantity on transfers sent but not received | `StockTransfer` (status in_transit, at the to location) |
| **Available** | on hand − reserved | computed |
| **Anticipated** | on hand − reserved + on order | computed; drives `ReorderSuggestion` |

The same function's source is copied into the reorder check, so the Stock screen and the reorder list always agree.

**Worked example.** Location Dhaka, product Charger: balance on hand 50. Open sales orders want 20, 5 already picked → reserved 15. A PO for 40 not yet received → on order 40. Then available = 50 − 15 = 35, anticipated = 50 − 15 + 40 = 75. With a reorder point of 80, the charger shows on the Reordering list.
