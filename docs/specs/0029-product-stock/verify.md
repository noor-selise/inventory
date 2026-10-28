# Verify: Stock on the product · spec 0029 · updated 2026-10-29

_Steps derived from spec 0029 goals (G1 to G6) and user journeys (CUJ 1 to 6). `/check verify` runs these; `/test` locks the durable ones._

Before you start: you need starter settings run (so the system "Opening stock" reason exists), at least two active locations ("Main warehouse" and "Shop" below; use any two you have), and three users: an admin or manager, a purchasing user, and a warehouse user. Run the app with `pnpm dev` and sign in at the project domain.

## UI / manual

### Opening stock on create (CUJ 1, G1, G4)
- [ ] As admin, open **Products → New product**. Type Stocked, standard unit `each`, purchasing unit `case` with `1 case = 12`, tick **Track lots** and **Track expiry dates**. → An **Opening stock** section appears after Tracking, with an **Add stock** button. → G1
- [ ] Add two rows. Row 1: Main warehouse, quantity `2`, unit `case`, cost `42` (per case), lot `L-0425`, expiry 2027-04-30. Row 2: Shop, quantity `6`, unit `each`, cost `3.50`, lot `L-0425`. Save. → The toast reads "Product saved with stock at 2 locations" and the dialog closes. → G1
- [ ] Open **Stock → Adjustments**. → Two new posted adjustments with the reason "Opening stock", one per location: +24 each at Main warehouse, +6 each at Shop. Opening one shows a **Unit cost** column of `3.50 / each` (42 per case ÷ 12). → G1, G4
- [ ] Reopen the product and choose the **Stock** tab. → On hand is 24 at Main warehouse and 6 at Shop. **Where it is** lists lot `L-0425` at both. → G2
- [ ] Check the product's average cost (a report, or the Price lists cost column). → 3.50. If row 2 had used cost 4.10, the average would be (24 × 3.50 + 6 × 4.10) ÷ 30 = 3.62. → G4
- [ ] Open **Stock → Lots**. → Lot `L-0425` exists once for this product, expiring 2027-04-30. → G1

### Purchasing user on create (CUJ 2)
- [ ] Sign in as a purchasing user and open **New product** with type Stocked. → Instead of rows, the Opening stock section reads "A warehouse or manager user can add stock after you save." Saving creates the product only. → G1

### Opening stock from the Stock tab (CUJ 3, G3)
- [ ] As admin, open a stocked product that has never had stock, then its **Stock** tab. → "No stock yet", an **Opening stock** block with **Add stock**, and no **Adjust stock** button. → G3
- [ ] Add one row (any location, quantity 10, cost 2) and press **Post opening stock**. → The toast reads "Opening stock posted at 1 location". The table shows 10, the opening block disappears, and **Adjust stock** appears. → G3

### Adjust to a new total (CUJ 4, G3, G6)
- [ ] On a product with 40 on hand at Main warehouse, press **Adjust stock**, choose Main warehouse, and type new total `37`. → "On hand now" shows 40, and the helper under New total reads "Change: −3 each". The reason defaults to "Count correction", and "Opening stock" is not in the list. → G3
- [ ] Save. → The toast reads "Stock adjusted (ADJ-…)" and on hand shows 37. On the Adjustments page that document shows −3 at the current average cost, with no Unit cost column. The product's average cost is unchanged. → G3, G4, G6
- [ ] Try new total `37` again. → "Nothing to change: stock is already at that total." Nothing posts. → G3
- [ ] As a warehouse user (stock editor, not product editor), open the same product. → The Details tab is read only, while the Stock tab still offers **Adjust stock** and **Adjust** on each row. → G3
- [ ] As a sales user (neither role), open it. → The Stock tab shows quantities, with no Adjust or opening controls. → G2
- [ ] As a user limited to one location, open it. → Only that location's rows appear, and the location pickers offer only it. → G2
- [ ] Serial tracked product: on its Stock tab press **Adjust** on a serial row and type `2`. → "A serial number is either here (1) or not (0)." → G3

### Product saved, stock not posted (CUJ 5, G6)
- [ ] Create a product with opening stock at two locations. In DevTools → Network, block request URLs matching `InventoryMovement` after the first location posts (or go offline right after pressing Save). → The product is saved and the dialog stays open on its **Stock** tab. A banner names the location that wasn't posted, and the failed adjustment shows **Try again**. → G6
- [ ] Unblock and press **Try again** twice quickly. → It posts once: on hand counts that location's quantity once, and the average cost is applied once. → G4, G6

### Cost step guard (G4)
- [ ] For an opening stock adjustment whose cost step failed (it shows **Update cost** on the Adjustments page or the product's Stock tab), press **Update cost** twice. → The average cost moves once. On the second press nothing changes, and the button is gone after the refresh. → G4
- [ ] Run **Settings → demo data → opening stock** twice. → The second run reports the documents as existing, and every product's average cost is the same as after the first run. → G4

### Unit lock (CUJ 6, G5)
- [ ] Open a product with posted stock. → **Standard unit** is disabled with "Locked because this product has stock history." A purchasing or sales unit ratio that was already set is disabled with the same note, and its unit can't be set to None. → G5
- [ ] On that product, rename the purchasing unit (for example case to carton) and save. → It saves, and the ratio stays as it was. → G5
- [ ] Open a stocked product with no stock yet. → The standard unit and ratios can still be changed. → G5

### Adjustments page with the Opening stock reason (G4)
- [ ] **Stock → Adjustments → New adjustment**, reason "Opening stock". → Each line shows a **Cost per …** field, along with the note "Opening stock sets each product's average cost from the cost you enter." Saving with an empty cost marks the line "Enter a unit cost of 0 or more." A line set to **Remove stock** shows "Opening stock only adds stock." → G4

### View history link (G2)
- [ ] On a product's Stock tab press **View history**. → The Stock page opens on the **By product** tab with that product already chosen. → G2

## Commands
- [ ] `pnpm typecheck` → no errors → G6
- [ ] `pnpm lint` → no findings → G6
- [ ] `pnpm build` → builds (the existing chunk size warning is expected) → G6
- [ ] `blocks data schema get-by-name StockAdjustment --json` → lists `costStatus`, and `unitCost` on its lines → G4

## Acceptance-criteria coverage
- G1 opening stock on create: CUJ 1 steps, CUJ 2
- G2 stock visible on the product: CUJ 1 Stock tab, sales user, location limited user, View history
- G3 change stock from the product: CUJ 3, CUJ 4
- G4 opening stock carries cost: CUJ 1 cost checks, cost step guard, Adjustments page, CUJ 5 retry
- G5 unit lock: CUJ 6
- G6 one way to write stock: CUJ 4 document check, CUJ 5, commands
