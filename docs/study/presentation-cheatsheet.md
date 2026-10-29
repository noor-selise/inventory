# Presentation cheat sheet

One page. Keep it open during the talk.

## The pitch (30 seconds)

"A Zoho Inventory-style app for small businesses. Buy from vendors, receive into warehouses, know exactly what is where, sell, pick, pack and ship, get paid, and see profit. Seven ready-made roles so each person sees only their job. Built in React on SELISE Blocks, so sign-in, roles, data and email come from the platform, with no custom backend."

## Three ideas to land

1. **One ledger.** Every stock change writes a movement. On hand is the sum of movements, so stock on any past date can be rebuilt, and lots and serials can be traced.
2. **Safe without transactions.** Blocks has none, so each balance row has a `version` and only updates if nobody changed it first (compare and set). Live test: 12 people grab from 10 units at once → 10 succeed, 2 refused, stock ends at exactly 0.
3. **Two statuses per order.** "Shipped?" and "Paid?" move separately, like real small businesses.

## 5-minute demo path (sign in as Admin)

| Time | Where | Do | Say |
|---|---|---|---|
| 0:00 | **Dashboard** | Point at tiles and low-stock alerts | "Each person picks their own tiles." |
| 0:30 | **Inventory → Stock** | Pick one product | "On hand is what's here. Reserved is promised. Available = on hand − reserved. Anticipated adds on order and drives reordering." |
| 1:00 | **Sales → Sales orders** | New quote → **Convert to order** | "Customer defaults fill in: price list, terms, rep." |
| 1:30 | Order detail | **Start picking** → Quick actions **Pick all**, **Pack all**, **Ship all** | "Picking locks the order for 30 minutes so two people can't pick it. Lots are suggested by earliest expiry." |
| 2:15 | Order detail | **Invoice today** → **Pay in full**; show **Profit** and **History** | "Statuses are worked out, never typed. Every change is in the history." |
| 2:45 | **Inventory → Reordering** | Create drafts | "Below reorder point → one click makes POs grouped by vendor." |
| 3:15 | **Purchasing → Purchase orders** | Open the draft → **Approve** → **Receive** with a lot | "Approval is by personal limit. Freight is spread into the landed cost, which updates average cost." |
| 4:00 | **Reports** | Sales profit → **Export → CSV file** | "21 reports. People without cost access never see cost columns, on screen or in the CSV." |
| 4:30 | **Settings → Team** | Open a person's settings | "Seven roles, plus approval limit, allowed locations, own customers only." |

Backup if something fails: open **Inventory → Adjustments**, make a "Damaged" adjustment, then show it in Reports → **Movement history**.

## Likely questions

| Question | Answer |
|---|---|
| Why Blocks and not our own backend? | Sign-in, MFA, roles, organizations, storage and mail come ready. The trade-off is fewer database features (no transactions, no server sums), which we designed around. |
| How do you stop two people selling the last unit? | Compare and set on the balance row's `version` (spec 0026), plus a unique `postingKey` so retries never double count. Proven with a live race test. |
| What if the browser closes halfway through a posting? | The movement stays `pending`. After 2 minutes a repair step checks the balance's `appliedKeys` and marks it posted or failed. Multi-line documents undo their posted lines if one fails. |
| How is cost calculated? | Moving average. Each receipt: (old qty × old avg + received qty × landed unit cost) ÷ total qty. Cost of goods is fixed at pick time. |
| What is landed cost? | Vendor price plus a share of freight, duty and other PO costs, spread by value (default), weight or volume. |
| Who can see cost? | Admin, Manager, Purchasing (`COST_VIEWERS`). Sales, Warehouse, Production and Read-only don't. |
| Can a store only see its own stock? | Yes. The Admin sets allowed locations per person. Transfers show if either end is allowed. |
| How are big purchases controlled? | Each person has a PO approval limit in home currency. Above it, the PO waits for someone higher. |
| What about customers who owe too much? | An order that pushes a customer over their credit limit is held until an Admin or Manager confirms it. |
| Lots, expiry, serials? | Supported. Expired lots are never auto-picked, and you can trace a lot forward to customers or backward to its PO. |
| Multi-company? | Each company is a Blocks organization; every record carries `OrganizationId`. |
| Can I add a custom role? | Not yet. The seven bundles are fixed until rights move to server permissions. |
| Fixed assets? | Yes, for things you own and use: monthly written-down-value depreciation, closed by an Admin, with Bangladesh rates as a preset. |
| How big can a report be? | It exports what the page loaded, at once, as CSV or PDF. |

## Known limits (say them before they're asked)

| Limit | Why | Spec |
|---|---|---|
| Role rights, cost hiding, location limits and approval limits are checked **in the browser**, not by the server. | Blocks hasn't confirmed how to restrict rows or hide a column for some roles. All schemas are open to any signed-in user for now. | 0003 |
| Company isolation is assumed but not yet proven by a live test. | The check is written and waits for a second test organization. | 0003 step 4b |
| **Background reports are deferred.** "Run in the background" was removed on 2026-10-29. | Blocks workflows can't sign in, so the job ran in the same browser tab, which gained nothing. CSV and Print are the exports. | 0015 AC-5, 0027, `docs/designs/instant-report-export.md` |
| The daily reorder check runs when the first person signs in each day, not on a server schedule. | Same reason: workflows can't sign in. A unique `WorkflowRun.runKey` makes it run once. | 0027 |
| Low-stock alerts: in app and by email only, no push. | Blocks publishes no channel values for push notifications. | 0027 |
| Reports cap silently at about 49,000 rows; ratio columns get added up in grouped rows. | Known follow-ups. | design doc, follow-ups 1 and 2 |
| No manufacturing yet (the Production role has nothing to do). | Planned for v1.1. | 0020 |
| Planned, not built: invoice PDFs and email, CSV import, accounting and ecommerce links, public API, stockroom scanning, B2B portal, plans, mobile and offline. | Roadmap. | 0016 to 0024 |
