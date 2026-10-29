# Role: Sales

> "Customers, quotes and sales orders" (`src/features/team/roles.ts`)

## Who this is

A sales rep or counter salesperson. Talks to customers, makes quotes, turns them into orders, records payments, and can also pick, pack and ship small orders.

## Day to day

- Answer "do you have it?" from the **Stock** screen (look at *Available*, not on hand).
- Make quotes and convert them to orders.
- Keep customer records current.
- Record payments that come in.
- Chase unpaid orders.

## Screens (sidebar)

| Section | Items |
|---|---|
| (top) | Dashboard |
| Sales | Sales orders, Customers, Price lists (view only), Payments |
| Inventory | Products (view only), Stock |
| Reports | Reports |
| Settings | Security, Appearance |

Not shown: Purchasing, Categories, Adjustments, Transfers, Counts, Lots and serials, Reordering, Locations, Fixed assets, all admin settings.

## Can and can't

| Area | Sales |
|---|---|
| Customers | ✅ Edit |
| Sales orders: create, edit, convert quote ↔ order | ✅ |
| Pick, pack, ship (`FULFILLERS`) | ✅ |
| Payments: record, refund, store credit | ✅ |
| **Confirm order** (over credit limit) | ❌ Needs Admin or Manager |
| Price lists | View only |
| Products | View only |
| **Cost, cost of goods, profit, margin** | ❌ Hidden (Sales is not in `COST_VIEWERS`). Reports drop cost columns, also in CSV exports. |
| Purchase orders, vendors | ❌ No access |
| Stock adjustments, transfers, counts | ❌ |
| Own customers only | If the Admin turns it on, the rep sees only customers and orders where they are the sales rep. Others show "Not your order". |
| Location limits | If set, only orders and stock at allowed locations. Others show "No access to this location". |

## Journeys

### 1. Quote to order

1. **Sales → Sales orders** → new quote. Pick the customer: address, price list, currency, payment terms and rep fill in from the customer.
2. Add lines: product, quantity and unit, price (from the price list, with volume breaks), discount (percent or fixed), tax code.
3. Save. It shows under the **Quotes** tab.
4. When the customer agrees: **Convert to order**. It moves to **Open**.
5. If the customer is now over their credit limit, the order is *Unconfirmed*: ask a Manager to confirm.

### 2. Ship a small order yourself

1. Open the order → **Start picking** (locks it for you for up to 30 minutes).
2. **Pick** (the app suggests lots that expire first), **Pack** into a package, **Ship** with carrier and tracking number.
3. Or use **Quick actions**: Pick all, Pack all, Ship all, Fulfill.
4. Anything you could not ship stays open as a back order.

### 3. Invoice and get paid

1. On the order: **Invoice today** (or **Mark invoiced** with a date).
2. **Record payment** for part, or **Pay in full**.
3. For one payment that covers several orders: **Sales → Payments** → **Record a payment**, then split the amount across orders. The split never exceeds the payment.
4. The order's payment status updates by itself: Invoiced → Partial → Paid.

### 4. A customer returns something

1. Open the original order, add a line with a **negative quantity**, mark it restock or discard.
2. **Restock returns** puts restock items back on hand.
3. Refund, or convert to store credit, from Payments.

## Quantities a rep should know

- **On hand**: in the building.
- **Reserved**: already promised to other open orders.
- **Available** = on hand − reserved. Promise from this number.
