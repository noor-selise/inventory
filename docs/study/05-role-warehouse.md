# Role: Warehouse

> "Picking, receiving, counts and transfers" (`src/features/team/roles.ts`)

## Who this is

Storekeepers and pickers. They touch the physical stock: receive deliveries, put them in bins, pick and ship orders, move stock between locations, and count shelves. They never see cost.

## Day to day

- Work the **Fulfillment queue**: ship what can ship now.
- Receive POs as trucks arrive.
- Send and receive transfers between stores.
- Record breakage and losses as adjustments.
- Count their sheets during a stock take.

## Screens (sidebar)

| Section | Items |
|---|---|
| (top) | Dashboard |
| Sales | Sales orders |
| Purchasing | Purchase orders |
| Inventory | Products (view only), Stock, Adjustments, Transfers, Counts, Lots and serials, Locations (view only) |
| Reports | Reports |
| Settings | Security, Appearance |

Not shown: Customers, Price lists, Payments, Vendors, Categories, Reordering, Fixed assets, Close month, admin settings.

## Can and can't

| Area | Warehouse |
|---|---|
| Pick, pack, ship (`FULFILLERS`) | ✅ |
| Receive POs (`RECEIVERS`) | ✅ |
| Adjustments, transfers, counts (`STOCK_EDITORS`) | ✅ |
| Edit sales orders or POs | ❌ Can open them only to fulfil or receive |
| Confirm orders, approve POs | ❌ |
| Review counts / complete a count | ❌ Admin or Manager reviews |
| Override negative stock | ❌ Posting is refused if stock would go below zero |
| See cost | ❌ |
| Payments | ❌ |
| Location limits | Often used here: a store worker sees only their store's stock and documents. Transfers show if either end is allowed, so a store sees what is coming. |

## Journeys

### 1. Pick, pack and ship

1. **Sales → Sales orders** → **Fulfillment queue** tab. It is sorted by priority and shows "can ship now" vs "needs stock".
2. Open an order → **Start picking**. This reserves stock and locks the order for 30 minutes so no one else picks it. **Stop picking** releases it.
3. **Pick**: the app suggests lots by earliest expiry and skips expired lots. Each line reports its own problem if it fails.
4. **Pack** into packages, then **Ship** with carrier and tracking number.
5. Partial is fine; the rest stays as a back order. An Unconfirmed order cannot be picked until a manager confirms it.

### 2. Receive a delivery

1. **Purchasing → Purchase orders** → **Open** tab ("Being received" shows partly received ones).
2. Open the PO → **Receive** → location and bin, quantities, lots with expiry or serials.
3. A PO waiting for approval cannot be received yet.

### 3. Move stock between locations

1. **Inventory → Transfers** → **New transfer**: from, to, products, quantities, bins.
2. **Send**: stock leaves the source and shows *in transit*.
3. At the other end: **Receive**: stock arrives. Open → In transit → Completed.

### 4. Record damage or loss

**Inventory → Adjustments** → new adjustment: location, reason (damaged, lost, found...), lines with a signed quantity. Saving posts it to the ledger. Cancelling writes reversing movements; nothing is deleted.

### 5. Count a sheet

1. **Inventory → Counts** → open the count, find your sheet.
2. **Start sheet** (captures what the system expects), count, enter quantities, **Save**, then **Submit sheet**.
3. A manager reviews and completes the count.

### 6. Trace a lot or serial

**Inventory → Lots and serials**: find which customers got lot X, or which PO brought serial Y in.
