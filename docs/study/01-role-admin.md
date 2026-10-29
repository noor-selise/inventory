# Role: Admin (the owner)

> "Full access, manages the team and settings" (`src/features/team/roles.ts`)

## Who this is

The business owner, or the one person they trust to run the system. Usually 1 or 2 people per company. An Admin can open every screen and do every action. The app also stops the company from ever losing its last Admin.

## Day to day

- Morning: look at the **Dashboard** (Sales today, Low stock, Open orders) and the low-stock alerts.
- Approve big purchase orders that are over other people's limits.
- Confirm sales orders held because a customer went over their credit limit.
- Invite new staff, set their role, approval limit and locations.
- Month end: close the depreciation month for fixed assets.
- Look at profit, stock value and money owed in **Reports**.

## Screens (sidebar)

Everything. These are **Admin only**:

| Section | Admin-only items |
|---|---|
| Settings | **Company**, **Currencies**, **Numbering**, **Depreciation**, **Lists and taxes**, **Team** |

Plus all of Sales, Purchasing, Inventory, Reports, and **Security** / **Appearance** (which everyone has).

## Can and can't

| Area | Admin |
|---|---|
| Team, company settings, locations | ✅ Only Admin can edit |
| Products, categories, price lists, customers, vendors | ✅ |
| Sales orders: edit, **Confirm order**, fulfil | ✅ |
| Purchase orders: edit, **Approve**, receive | ✅ |
| Adjustments, transfers, counts, review counts | ✅ |
| Override negative stock | ✅ (asked to confirm) |
| Payments | ✅ |
| See cost and margin (`COST_VIEWERS`) | ✅ |
| Depreciation setup, classes, close and reopen months (`DEPRECIATION_ADMINS`) | ✅ Only Admin |
| Fixed assets: add, edit, dispose | ✅ |
| Location limits | Never limited, even if a list is set |
| PO approval limit | No limit set = no ceiling. If a limit is set, it applies. |
| Low-stock alert emails | ❌ Those go to the Purchasing role only |

The guard: an Admin cannot demote or deactivate the last Admin (`wouldRemoveLastAdmin` in `TeamPage.tsx`). If that is ever bypassed, the Blocks project owner restores an Admin from the CLI.

## Journeys

### 1. Set up the company (first day)

1. **Settings → Company**: name, address, time zone, home currency, date format, country. Choosing Bangladesh copies ten standard depreciation classes.
2. **Settings → Currencies**: add the currencies you trade in and exchange rates.
3. **Settings → Numbering**: prefixes for document numbers (SO-, PO-, ...).
4. **Settings → Lists and taxes**: taxing schemes and tax codes, payment terms, payment methods, carriers, adjustment reasons.
5. **Inventory → Locations**: add warehouses and stores, and bins inside them.
6. **Inventory → Products**: add products (or load starter data from the Dashboard card).

### 2. Invite a team member

1. **Settings → Team** → invite by email, choose one of the seven roles.
2. Open the person's per-person settings to set:
   - **Approval limit** (largest PO total they may approve, in home currency);
   - **Allowed locations** (empty = all);
   - **Own customers only** (for sales reps);
   - dashboard tiles.
3. Later: change role, deactivate (their session stops), or reactivate.

### 3. Turn on two-step login

1. **Settings → Security**: enroll yourself with an authenticator app or email code.
2. Set the company rule (require it for everyone, or not).

### 4. Approve a big PO

1. **Purchasing → Purchase orders**, tab **Open**, look for "Waiting for approval".
2. Open it, check lines and landed cost, click **Approve**.
3. If the total later goes up, the PO goes back to Unapproved.

### 5. Confirm a held sales order

1. **Sales → Sales orders**, open an order marked Unconfirmed.
2. It is held because the customer's open balance plus this order is over their credit limit.
3. Click **Confirm order**. Only then can the warehouse pick it.

### 6. Close the month for fixed assets

1. **Inventory → Fixed assets**: check assets are in service, with cost and class.
2. **Inventory → Close month**: review the month's charge per asset, click **Close month**.
3. Entries for that month never change. **Reopen** works only on the most recently closed month: it removes that month's entries and is logged in `DepreciationRun`.

## Honest limits to know

- Role rights are checked in the browser today, not on the server (spec 0003). The fix waits on Blocks confirming row and field policies.
- Cost hiding is also browser-side for now (`COST_VIEWERS`).
