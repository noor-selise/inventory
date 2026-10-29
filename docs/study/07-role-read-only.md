# Role: Read only

> "Can view, cannot change anything" (`src/features/team/roles.ts`)

## Who this is

An accountant, auditor, investor or new trainee. They need to look, not touch.

## Screens (sidebar)

Almost everything a Manager sees, without edit buttons:

| Section | Items |
|---|---|
| (top) | Dashboard |
| Sales | Sales orders, Customers, Price lists, Payments |
| Purchasing | Purchase orders, Vendors |
| Inventory | Products, Categories, Stock, Adjustments, Transfers, Counts, Lots and serials, Reordering, Locations, Fixed assets, Close month |
| Reports | Reports |
| Settings | Security, Appearance |

Not shown: Company, Currencies, Numbering, Depreciation, Lists and taxes, Team.

## Can and can't

| Area | Read only |
|---|---|
| Open lists and details | ✅ |
| Run reports, export CSV, print to PDF | ✅ |
| Create, edit, cancel, approve, confirm, post anything | ❌ (read only is in none of the edit lists in `roles.ts`) |
| **See cost** | ❌ Not in `COST_VIEWERS`. So an accountant on this role will not see cost of goods, profit or stock value. Give them Manager, or wait for finer permissions. |
| Location limits | Can be set like any non-admin |

## Journeys

### 1. Month-end look

1. **Reports** → Sales by product, Payments received, Vendor payments, Back orders.
2. Filter by date and location; group if needed.
3. Export **CSV file** or **Print or PDF**.

### 2. Audit a document

1. Open any order, adjustment or transfer.
2. Every record shows who changed it last and when; orders keep a full **History**.
3. **Inventory → Lots and serials** to trace a batch.

## Point to raise in the talk

A typical accountant needs cost but no edit rights. That combination does not exist in the seven fixed bundles. Custom roles and per-person overrides are deferred until rights are enforced by permissions on the server (spec 0003, AC-4 and non-goals).
