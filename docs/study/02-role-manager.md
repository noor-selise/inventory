# Role: Manager

> "Everything except team and plan settings" (`src/features/team/roles.ts`)

## Who this is

The operations or store manager. Runs the business day to day with almost every right the owner has, but cannot change the team, company settings, locations or depreciation setup.

## Day to day

- Watch open orders, the fulfillment queue and low stock.
- **Confirm** sales orders held for credit limit.
- **Approve** POs within their approval limit.
- Review stock counts and post the differences.
- Allow negative stock in exceptional cases.
- Edit prices and price lists.
- Add and dispose of fixed assets.
- Read profit and stock value reports.

## Screens (sidebar)

| Section | Items |
|---|---|
| (top) | Dashboard |
| Sales | Sales orders, Customers, Price lists, Payments |
| Purchasing | Purchase orders, Vendors |
| Inventory | Products, Categories, Stock, Adjustments, Transfers, Counts, Lots and serials, Reordering, Locations (view only), Fixed assets, Close month (view only) |
| Reports | Reports |
| Settings | Security, Appearance |

Not shown: Company, Currencies, Numbering, Depreciation, Lists and taxes, Team.

## Can and can't

| Area | Manager |
|---|---|
| Products, categories | ✅ Edit |
| Price lists | ✅ Edit (only Admin and Manager) |
| Customers, vendors | ✅ Edit |
| Sales orders: edit, fulfil | ✅ |
| **Confirm order** (`CONFIRMERS`) | ✅ (only Admin and Manager) |
| Purchase orders: edit, receive, reorder | ✅ |
| **Approve** a PO | ✅ up to their personal approval limit. With no limit set, a non-admin can approve **nothing**. |
| Adjustments, transfers, counts | ✅ |
| Review counts, override negative stock (`STOCK_REVIEWERS`) | ✅ |
| Payments | ✅ |
| See cost and margin | ✅ |
| Fixed assets: add, edit, dispose (`ASSET_EDITORS`) | ✅ |
| Close or reopen a depreciation month | ❌ Admin only (can view the page) |
| Locations: add or edit | ❌ Admin only (can view) |
| Team, settings | ❌ |
| Location limits | Can be limited by the Admin |

## Journeys

### 1. Review and post a stock count

1. **Inventory → Counts** → new count for a location; split it into sheets, each assigned to a person.
2. Staff open their sheet, **Start sheet** (this captures the expected quantity), type counted quantities, **Submit sheet**.
3. When all sheets are in, the count is *In review*. The manager sees the variance per line.
4. **Complete count**: the app posts one adjustment for the differences.

### 2. Handle a held order

1. **Sales → Sales orders** → open the Unconfirmed order.
2. Check the customer's balance on **Payments** or the customer record.
3. **Confirm order**, or call the customer first. A total that grows after confirmation needs confirming again.

### 3. Approve a PO

1. **Purchasing → Purchase orders** → open the order waiting for approval.
2. **Approve**. If the total (in home currency) is over your limit, the app refuses and an Admin or higher-limit person must approve.

### 4. Allow negative stock (rare)

When a posting would take stock below zero, an Admin or Manager is asked to confirm the override. Other roles are refused (`insufficient_stock`).

### 5. Change prices

1. **Sales → Price lists** → pick a list (for example Wholesale).
2. Set a fixed price or a markup per product, add volume price breaks.
