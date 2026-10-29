# Role: Purchasing

> "Vendors and purchase orders" (`src/features/team/roles.ts`)

## Who this is

The buyer. Decides what to order, from whom, and at what cost. Keeps the product catalog tidy. The only role that receives low-stock alert emails, and one of three roles that can see cost.

## Day to day

- Check **Reordering** each morning: what is below its reorder point.
- Draft and send POs, get them approved, follow up with vendors.
- Receive deliveries (or let the warehouse do it).
- Pay vendor bills.
- Maintain products, categories and vendor prices.

## Screens (sidebar)

| Section | Items |
|---|---|
| (top) | Dashboard |
| Sales | Payments |
| Purchasing | Purchase orders, Vendors |
| Inventory | Products, Categories, Stock, Lots and serials, Reordering, Fixed assets (view only) |
| Reports | Reports |
| Settings | Security, Appearance |

Not shown: Sales orders, Customers, Price lists, Adjustments, Transfers, Counts, Locations, Close month, admin settings.

## Can and can't

| Area | Purchasing |
|---|---|
| Products, categories (`PRODUCT_EDITORS`) | ✅ Edit |
| Vendors | ✅ Edit |
| Purchase orders: create, edit, reorder drafts | ✅ |
| Receive POs (`RECEIVERS`) | ✅ |
| **Approve** a PO | ✅ only up to their own approval limit (`TeamMemberProfile.poApprovalLimit`). No limit set = can approve nothing. A PO saved by someone whose limit covers it is approved on save. |
| Payments (vendor and customer) | ✅ |
| **See cost** (`COST_VIEWERS`) | ✅ Average cost, landed cost, stock value, PO unit cost |
| Low-stock alert emails (`ALERT_ROLES`) | ✅ Only this role |
| Sales orders, customers | ❌ |
| Adjustments, transfers, counts | ❌ |
| Fixed assets | View only (editing is Admin and Manager) |
| Location limits | If set, only POs whose receive location is allowed |

## Journeys

### 1. From low stock to a PO

1. **Inventory → Reordering**. The list shows every product and location whose *anticipated* quantity (on hand − reserved + on order) is below its reorder point, with a suggested quantity.
2. Tick the rows and create drafts: one PO per vendor (and one transfer per source location for rows set to "transfer").
3. The app can suggest a reorder point: units sold in the last 90 days ÷ 90 × the vendor's lead time + safety stock. Click **Use** to apply it.

### 2. Raise and approve a PO

1. **Purchasing → Purchase orders** → new (or start from a quote / request for quote and **Convert to order**).
2. Vendor, receive location, currency and rate, terms, carrier, freight, and other non-vendor costs (duty, insurance).
3. Lines: product, vendor item code, quantity and unit, unit price, discount, tax code.
4. Save. If the total is within your limit, it is approved on save. Otherwise it waits for someone with a higher limit to **Approve**. Receiving waits until it is approved.

### 3. Receive goods

1. Open the PO → **Receive**. Choose location ("Receive at") and bin.
2. Enter quantities; for tracked products, a lot number and expiry, or one serial per row.
3. Partial is fine: receive again when the rest arrives.
4. The app spreads freight and extra costs over the received lines (**landed unit cost**) and updates the product's moving average cost.
5. If the vendor price changed, the app offers **Update price list** for that vendor item.

### 4. Return to vendor

Open the PO → **Return to vendor**: the items leave stock.

### 5. Pay the vendor

Open the PO → **Pay vendor**, or **Sales → Payments** for one payment across several POs. The PO's payment status moves Unpaid → Partial → Paid. The vendor payments and aging views show what you owe and how old it is.
