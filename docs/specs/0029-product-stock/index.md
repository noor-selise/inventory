# 0029. Stock on the product

**Date**: 2026-10-28
**Status**: In Progress
**Author**: noor-selise
**Drafted with**: EGM (brief and draft in `egm/drafts/`)

--------------------------------------------------------------------------------

## Overview

The product dialog (`src/features/products/ProductDialog.tsx`) becomes the place where a user sees a product's stock and changes it. When a stocked product is created, the user can enter its opening stock in the same dialog. When it is edited, a Stock tab shows how much there is at each location and lets a stock editor adjust it.

The product record gets no stock field. Every quantity entered from the product is saved as an ordinary stock adjustment and posted through the existing posting engine (`src/features/stock/posting.ts`, spec 0026). Stock levels, movement history, reports and reorder alerts therefore stay one ledger.

Two bugs found while scanning ship first, on their own:

*   Opening stock entered through the app never sets the product's average cost.
*   The standard unit can be changed after stock exists.

## The Problem

**Who is affected:** owners setting up a catalogue, and warehouse staff receiving a new line.

**What they do today** to give a new product its stock, the user:

1.  Opens **Products → New product**, fills in the dialog and saves.
2.  Goes to **Adjustments → New adjustment**.
3.  Picks the location and the reason "Opening stock".
4.  Searches for the product they just created and types the quantity, plus lot or serial numbers if tracked.
5.  Posts the adjustment.

Changing stock later is the same detour. The product dialog doesn't show how much stock exists anywhere, so the user also has to open **Stock** to check before adjusting.

**Why this matters:**

*   **The product doesn't feel like the centre of inventory.** Every question about a product ("how many do we have, where, which lots?") sends the user to another page and back.
*   **Setting up a catalogue takes twice the steps.** For a catalogue of a few hundred products, the detour happens hundreds of times.
*   **Products get saved with no stock.** Users forget step 2, and a product with no stock looks out of stock to sales and reordering.

**What is already wrong underneath**, and makes the detour more costly than it looks:

*   **Opening stock gets no cost.** An adjustment created from the screen values its lines at the product's current average cost (`src/features/stock/actions.ts`, `toPostingLines`) and never calls `posting.applyReceiptCost`.
    *   A new product's average cost is empty, so its opening stock is valued at 0.
    *   Every later sale then reports the wrong cost of goods and margin.
    *   Only the demo seeder sets the cost correctly (`src/features/settings/seed-runner.ts`, opening stock step).
*   **The standard unit isn't protected.**
    *   Balances and movements are stored in the standard unit, but `toPayload` writes `standardUom` on every edit (`ProductDialog.tsx`).
    *   Changing "each" to "box" after stock exists changes the meaning of every stored quantity without changing a single number.

**Proposed solution in one line:** connect the existing adjustment and posting functions to the product dialog, and fix cost and unit locking so both the product path and the Adjustments page give correct results.

**Strongest counter-argument, and why it doesn't hold:** "Opening stock happens once per product, so a detour is acceptable."

*   It happens once per product, but for every product, and mostly during setup, when the user enters hundreds in a row.
*   The cost bug exists whichever screen is used, so the Adjustments page has to be touched anyway.
*   The added code is small, because the engine, the adjustment document, lot and serial handling, and unit conversion already exist.

## Goals

*   **G1: Opening stock on create.** A stock editor can save a new stocked product and its opening stock in one dialog:
    *   one row per location: quantity in any unit the product has, unit cost, optional bin, lot number and expiry or serial numbers when tracked;
    *   the result is one posted "Opening stock" adjustment per location.
*   **G2: Stock visible on the product.** Anyone who can open a product sees its on-hand quantity per location (and per lot or serial when tracked) in a Stock tab, limited to the locations they are allowed to see.
*   **G3: Stock changed from the product.** A stock editor can adjust a product's stock from the Stock tab:
    *   they enter the new total and a reason, and the system posts the difference as an adjustment;
    *   a product with no movements yet can be given opening stock from the same tab.
*   **G4: Opening stock carries cost.** Any adjustment with the "Opening stock" reason, from the product dialog or the Adjustments page, records the entered unit cost and updates the product's moving average cost.
*   **G5: The standard unit is locked once stock has moved.** The standard unit, and the purchase and sales unit ratios, cannot change once the product has any posted movement.
*   **G6: No new way to write stock.** Every quantity change goes through `createAdjustment` and `posting.postDocument`. Retry, double-post protection and the movement history work exactly as they do for adjustments made on the Adjustments page.

## Non-Goals

*   **A stock quantity field on `Product`.** Stock stays in `InventoryMovement` and `InventoryBalance` only.
*   **A full-page product detail screen.** The dialog gets a Stock tab. A separate page is a later step if the dialog becomes too heavy.
*   **Transfers, counts and reorder settings edited from the product.** Their own pages handle them; the Stock tab does not repeat them.
*   **Accounting journals.** This repo has no ledger; the accounting integration is spec 0018.
*   **CSV import of opening stock** (spec 0017 AC-4). It should reuse the opening-stock function built here, but ships as its own change.
*   **Changing type or tracking after creation.** These are already locked (spec 0005 AC-2, AC-5) and stay locked.

## Open Questions

None left open. The three questions raised in the first draft are settled here:

*   **Two people add opening stock to the same new product at once.**
    *   `postOpening` checks `hasStockHistory` just before it posts each location. If stock appeared in the meantime, it refuses that location with "Stock was added to this product meanwhile. Use Adjust stock."
    *   The check and the post are separate reads, so two saves landing within the same second can both get through. Both are then real, visible adjustments that can be cancelled.
    *   Locking this fully would need a lock record per product, which isn't worth it for a step that happens once.
*   **Warehouse users and the product dialog.**
    *   Every row in the products list opens the dialog, and `canEdit` already makes the details read-only (`ProductDialog.tsx`, the fieldsets with `disabled={!canEdit}`).
    *   Warehouse users therefore open the product read-only. The Stock tab's actions follow `STOCK_EDITORS` on their own, not `canEdit`.
*   **Cost on increases other than opening stock.** These keep the current average cost, the behaviour today.
    *   Real costed increases are receipts (spec 0012).
    *   Letting "Found" carry any cost would let users shift average cost without a purchase behind it.

## Critical User Journeys (CUJs)

### CUJ 1: Create a stocked product with its opening stock

*   **Given**: A manager (both a product editor and a stock editor) who may use the locations "Main warehouse" and "Shop". The product tracks lots.
*   **When**: They open **New product**, fill in the details, and in **Opening stock** enter two rows:
    *   Main warehouse: 2 cases (1 case = 12 each), lot `L-0425` expiring 2027-04-30, cost 3.50 per each.
    *   Shop: 6 each, same lot, same cost.

    Then they press **Save**.
*   **Then**:
    *   The product is created.
    *   Two adjustments with the reason "Opening stock" are posted, one per location: +24 each at Main warehouse, +6 each at Shop.
    *   Lot `L-0425` exists once, with its expiry.
    *   The product's average cost is 3.50.
    *   The Stock tab shows 24 and 6.
    *   Both adjustments appear on the Adjustments page and in the product's movement history.

### CUJ 2: Create a product as a purchasing user

*   **Given**: A user with the purchasing role (a product editor, not a stock editor).
*   **When**: They open **New product** and choose type Stocked.
*   **Then**:
    *   No Opening stock section is shown.
    *   A line reads "A warehouse or manager user can add stock after you save."
    *   Saving creates the product only.

### CUJ 3: Give stock to a product that has none yet

*   **Given**: A stocked product saved earlier with no stock and no posted movements.
*   **When**: A stock editor opens it, goes to the **Stock** tab, enters an opening row and presses **Post opening stock**.
*   **Then**:
    *   The same thing happens as in CUJ 1, for that row.
    *   The tab now shows on hand per location.
    *   The tab replaces the opening rows with **Adjust stock**.

### CUJ 4: Correct stock after a count

*   **Given**: A product with 40 on hand at Main warehouse.
*   **When**: A warehouse user opens the product's **Stock** tab, presses **Adjust stock**, picks Main warehouse, types the new total 37, keeps the reason "Count correction" and saves.
*   **Then**:
    *   An adjustment of −3 at Main warehouse is posted at the current average cost.
    *   On hand shows 37.
    *   The average cost does not change.

### CUJ 5: Stock fails to post after the product saved

*   **Given**: Opening stock for two locations is entered on create, and the second posting fails (for example, a network error).
*   **When**: The user presses **Save**.
*   **Then**:
    *   The product is saved.
    *   The first location's adjustment is posted.
    *   The dialog stays open on the Stock tab: "Opening stock for Shop wasn't posted. [Try again]".
    *   Pressing **Try again** posts it once. Pressing it twice doesn't post it twice.

### CUJ 6: Try to change the unit of a product with stock

*   **Given**: A product with posted movements, standard unit "each".
*   **When**: A product editor opens it.
*   **Then**: The standard unit and the purchase and sales unit ratios are shown locked, with the note "Locked because this product has stock history."

## Technical Plan (Architecture)

### Principle

The product dialog becomes a new front end for the adjustment document that already exists. Nothing writes `InventoryBalance` or `InventoryMovement` except `posting.postDocument`. The product dialog doesn't call it directly; it calls a small **product stock service**, which calls the existing `createAdjustment` and `retryAdjustment`.

```text
ProductDialog
 ├─ Details tab (today's form: Basics, Units, Tracking, Barcodes)
 │    └─ Opening stock section (create only, stocked, stock editors)
 └─ Stock tab (edit only)
      ├─ on hand per location / lot / serial  ← quantitiesFor(productId)
      ├─ no posted movements → Opening stock rows
      └─ has movements       → [Adjust stock] → AdjustStockDialog
                 │                                   │
                 ▼                                   ▼
        productStock.postOpening(product, rows)   productStock.adjustTo(product, target)
                 │  (one call per location)          │
                 ▼                                   ▼
        actions.createAdjustment(reason = Opening stock | chosen reason)
                 │
                 ▼
        posting.postDocument  ──►  InventoryMovement (pending → posted)
                 │                 InventoryBalance  (compare and set on version)
                 ▼
        posting.applyReceiptCost  (Opening stock lines only, per product)
```

### Components

Exact fields, signatures and save steps are listed once, in the Detailed Implementation Plan. This section says only what each part is for.

1.  **Opening stock reason lookup** (`src/features/stock/reasons.ts`).
    *   Starter settings already seed "Opening stock" as a system reason, so the code needs no new record.
    *   One helper finds that reason, and everything else uses it. Nothing else in the code mentions the reason's name.
2.  **Cost on opening stock** (`actions.ts`, `posting.ts`, `LineEditor.tsx`, `AdjustmentsPage.tsx`).
    *   Opening stock lines carry the cost the user entered.
    *   After the document posts in full, the cost feeds the moving average once. A compare-and-set claim on the adjustment guards this, so retries, double clicks and seeder re-runs can't apply it twice.
    *   Lines with any other reason keep using the current average cost.
3.  **Product stock service** (`src/features/products/productStock.ts`). It holds three functions, and all of them write through `createAdjustment`:
    *   `hasStockHistory` checks whether the product has any posted movement.
    *   `postOpening` creates one Opening stock adjustment per location.
    *   `adjustTo` turns a new total into an in or out adjustment.
4.  **Product dialog** (`ProductDialog.tsx`, plus the new `OpeningStockRows`, `ProductStockTab` and `AdjustStockDialog`).
    *   **On create:** an Opening stock section after Tracking.
    *   **On edit:** a Stock tab. It shows on hand, then either opening rows (no stock history yet) or **Adjust stock**. It also shows a banner for failed opening stock and a **View history** link.
    *   **Unit lock:** the standard unit and the unit ratios lock once the product has stock history.
5.  **Stock page deep link** (`StockPage.tsx`). The page reads `tab` and `product` from the address once, when it opens, so **View history** lands on the product.

### Access

| Who | Details tab | Opening stock section / rows | Adjust stock |
| :-- | :-- | :-- | :-- |
| Product editor and stock editor (admin, manager) | edit | yes | yes, plus allow-negative |
| Product editor only (purchasing) | edit | no, with a note | no |
| Stock editor only (warehouse) | read-only | yes, on the Stock tab | yes |
| Others with product view | read-only | no | no |

Location scope applies everywhere: rows, pickers and the on-hand table show only allowed locations.

### Failure handling

*   **No new consistency rules.** These all come from the existing engine:
    *   each line is written as a pending movement, then a version-checked balance update;
    *   a document that fails partway is undone;
    *   a retry posts under fresh keys, and `appliedKeys` stops double counting.
*   **The one new partial state is "product saved, opening stock not."** It is visible in two places:
    *   the dialog keeps the rows;
    *   the Stock tab shows the failed adjustment until it is retried or cancelled.
*   **Cost is applied after posting, per product.**
    *   Possible failure: if `applyReceiptCost` gives up after its retries, the stock is posted but the cost is not.
    *   What the user sees: a warning, "Stock posted, but the cost wasn't updated. [Update cost]". It re-runs the cost step for that document only.
    *   What stops double counting: the `costStatus` claim described in component 2.

Alternatives that were weighed and rejected are in [rationale.md](rationale.md). Verify steps are in [verify.md](verify.md).

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security & access:**
    *   Roles are checked in the browser only, as for every stock screen today: `STOCK_EDITORS` for posting and `STOCK_REVIEWERS` for allowing negative stock.
    *   Location scope filters rows and pickers (spec 0003 AC-8, a browser filter until L6 is resolved).
    *   The data access rules in `blocks/data/rules.json` already cover `StockAdjustment` and `InventoryMovement`, and no new collection is added.
*   **Performance:**
    *   The Stock tab makes one `quantitiesFor(productId)` call and one `hasStockHistory` query with a page size of 1.
    *   The dialog already loads lookups for barcodes. It loads stock lookups (`useStockLookups`) only when the Stock tab or the Opening stock section is shown.
*   **Rollout & rollback:** three changes, each one revertable on its own.
    1.  The cost fix and the unit lock.
    2.  The Stock tab with Adjust stock.
    3.  Opening stock on create.

    *   Every stock change is an ordinary adjustment, so a wrong one is undone with the existing **Cancel** on the Adjustments page.
    *   The new schema fields (`AdjustmentLine.unitCost`, `StockAdjustment.costStatus`) are optional, so older code ignores them.

--------------------------------------------------------------------------------

### Future Improvements

*   **A full product detail page** (Alternative C). `ProductStockTab` would move onto it unchanged.
*   **CSV import of opening stock** (spec 0017 AC-4), reusing `postOpening`.
*   **Lot and expiry summary on the Stock tab,** with a link to the Lots page filtered to the product.
*   **A server-side check of stock roles** once Blocks access rules can test roles per action (spec 0003, L6).

--------------------------------------------------------------------------------

## Detailed Implementation Plan

There are three changes, in the order they ship. No test runner is set up in this repo (`package.json` has `typecheck`, `lint` and `build` only), so each change is checked by those three commands and by walking through its CUJs in the running app. See the Verification Plan.

### Change 1: Cost on opening stock and the unit lock (G4, G5)

#### 1. `blocks/data/schemas/AdjustmentLine.json` (Modify)

*   **Type / Scope**: Blocks schema (embedded type).
*   **Proposed Changes**: Add the field `{ "name": "unitCost", "type": "Float", "isArray": false }`. It holds the cost per standard unit that the user entered on an Opening stock line, and is null on every other line.

#### 2. `blocks/data/schemas/StockAdjustment.json` (Modify)

*   **Type / Scope**: Blocks schema.
*   **Proposed Changes**: Add the field `{ "name": "costStatus", "type": "String", "isArray": false }`. It can be null, `applying` or `applied`. It is claimed with a compare and set so that an adjustment's cost reaches the moving average only once.

#### 3. `src/features/stock/api.ts` (Modify)

*   **Type / Scope**: TypeScript data access.
*   **Proposed Changes**:
    *   `AdjustmentLine` gets `unitCost?: number | null`.
    *   `StockAdjustment` gets `costStatus?: "applying" | "applied" | null`.
    *   `costStatus` is added to the field list of the `stockAdjustments` collection.

#### 4. `src/features/stock/reasons.ts` (Create)

*   **Type / Scope**: TypeScript helper.
*   **Proposed Changes**:
    *   Export `OPENING_STOCK_REASON = "Opening stock"`.
    *   Export `openingStockReason(reasons: SimpleLookup[]): SimpleLookup | undefined`. It returns the row where `isSystem === true`, `isActive !== false` and the name matches case-insensitively.
    *   Export `isOpeningStock(reasonId, reasons): boolean`.
    *   This is the only place in the app that knows the reason's name.

#### 5. `src/features/stock/actions.ts` (Modify)

*   **Type / Scope**: TypeScript stock actions.
*   **Proposed Changes**:
    *   **Line input:** `LineDraft` (from `LineEditor.tsx`) gains `unitCost: string`.
    *   **Building lines:** in `createAdjustment`, when `isOpeningStock(input.reasonId, input.lookups.reasons)`:
        *   each line must have a cost ≥ 0, or it throws "Enter a unit cost for every opening stock line.";
        *   each line stores `unitCost` per standard unit. The entered cost per entered unit is divided by the unit ratio, using the same conversion as `toStandardQty`.
    *   **Posting cost:** `toPostingLines` uses `line.unitCost` when it is set, and falls back to the average cost as today.
    *   **New `applyOpeningCost(doc)`:** it runs after `postAdjustment` succeeds, only for opening stock documents.
        1.  Claim `costStatus` with `updateWhere({ ItemId, costStatus: null }, { costStatus: "applying" })`. A claim count of 0 means it already ran or is running elsewhere, so it returns.
        2.  For each product in the document, call `posting.applyReceiptCost(productId, totalQty, weightedCost)`.
        3.  On success, set `costStatus` to `applied`. On error, set it back to null and rethrow as `CostNotAppliedError`.
    *   **Retry:** `retryAdjustment` calls `applyOpeningCost` after a successful repost.
    *   **New `applyCostAgain(doc)`:** it runs `applyOpeningCost` alone, for the **Update cost** action.
    *   **Cancel:** `cancelAdjustment` is unchanged. Undoing the cost of a cancelled opening document isn't attempted, the same as the seeder; a cancelled receipt doesn't undo its cost either.

#### 6. `src/features/stock/LineEditor.tsx` (Modify)

*   **Type / Scope**: React component.
*   **Proposed Changes**:
    *   `emptyLine()` sets `unitCost: ""`.
    *   `LineEditor` takes a `showCost` prop. When it is true, each line shows a Unit cost number field labelled with the line's unit (for example "Cost per case").
    *   `lineProblem` takes a `requireCost` option and returns "Enter a unit cost." when the cost is empty or below 0.

#### 7. `src/features/stock/AdjustmentsPage.tsx` (Modify)

*   **Type / Scope**: React page.
*   **Proposed Changes**:
    *   Pass `showCost` and `requireCost` when the chosen reason is Opening stock, using `isOpeningStock`.
    *   On a `CostNotAppliedError`, show a warning toast and an **Update cost** action on that adjustment's row. The action calls `applyCostAgain`.
    *   In the adjustment detail view, show the Unit cost column for opening stock documents.

#### 8. `src/features/settings/seed-runner.ts` (Modify)

*   **Type / Scope**: Seeder.
*   **Proposed Changes**:
    *   Use `openingStockReason` instead of matching on the lower-cased name.
    *   Store `unitCost` on the lines it creates.
    *   Replace its inline `applyReceiptCost` loop with the same `costStatus` claim, so a re-run of the seeder doesn't apply the cost twice.
    *   `seed-runner.ts` must stay free of app imports (`posting.ts` says it runs in Node). So the claim-and-apply step is written as a function in `posting.ts`, taking the client, and `actions.ts` calls that same function. See item 9.

#### 9. `src/features/stock/posting.ts` (Modify)

*   **Type / Scope**: Stock engine (no app imports).
*   **Proposed Changes**:
    *   Add `applyDocumentCost(adjustmentId, perProduct: { productId, qty, unitCost }[])` to the object `createPosting` returns.
    *   It does the `costStatus` claim on `StockAdjustment`, the `applyReceiptCost` calls and the release on failure. `actions.ts` and `seed-runner.ts` both call it.
    *   `postDocument` and `postLine` are unchanged.

#### 10. `src/features/products/ProductDialog.tsx` (Modify, unit lock part)

*   **Type / Scope**: React component.
*   **Proposed Changes**:
    *   On edit, load `hasStockHistory(product.ItemId)` (item 12).
    *   While it is true, `standardUom`, `purchaseUomRatio` and `salesUomRatio` are disabled. They show the lock icon and the note "Locked because this product has stock history." `toPayload` leaves those three fields out.
    *   Changing the purchase or sales unit *name* while keeping its ratio stays allowed.
    *   Until the check returns, the three fields stay disabled, so a slow network can't let a change through.

#### 11. `src/features/stock/README.md` and `src/features/products/README.md` (Modify)

*   **Type / Scope**: Folder docs.
*   **Proposed Changes**:
    *   **Stock:** record that Opening stock lines carry `unitCost` and update the moving average once, through `applyDocumentCost`, guarded by `costStatus`.
    *   **Products:** record that the standard unit and the ratios lock once there is stock history.

### Change 2: Stock tab and Adjust stock (G2, G3, G6)

#### 12. `src/features/products/productStock.ts` (Create)

*   **Type / Scope**: TypeScript service.
*   **Proposed Changes**:
    *   **`hasStockHistory(productId): Promise<boolean>`:** calls `posting.movements({ productId, status: "posted" }, { pageSize: 1 })` and returns whether any row came back.
    *   **`adjustTo(input, lookups, allowNegative)`:**
        *   `input` is `{ product, locationId, sublocationId?, lotId?, serial?, newTotal, reasonId, adjustedAt, remarks }`.
        *   It reads `quantitiesFor(product.ItemId)` and finds the row for that location, bin, lot and serial. For serials, `newTotal` can only be 0 or 1.
        *   `delta = newTotal − onHand`. A delta of 0 throws "Nothing to change."
        *   It builds one `LineDraft` (direction `in` or `out`, qty `|delta|`, the standard unit, lot number and serial) and calls `createAdjustment`.
    *   **`openingFailures(productId)`:** lists this product's adjustments in status `failed` whose reason is Opening stock, for the Stock tab banner. It filters `stockAdjustments.list({ status: "failed" })` in the browser by line `productId`, the same pattern as existing lists.

#### 13. `src/features/products/ProductStockTab.tsx` (Create)

*   **Type / Scope**: React component.
*   **Proposed Changes**:
    *   **Props:** `{ product, lookups, canPost, canOverride, onChanged }`.
    *   **Table:** location / bin / lot / serial, On hand, Available, On order. Rows come from `quantitiesFor`, filtered with `useLocationScope().seesLocation`. It uses `Table`, `EmptyState` and `LoadingRows` from the existing components.
    *   **Failed opening stock banner:** "Opening stock for <location> wasn't posted." with **Try again** (`retryAdjustment`).
    *   **No stock history:** the `OpeningStockRows` editor and a **Post opening stock** button (item 18). This is Change 3; until that ships, the tab shows "No stock yet" and a link to the Adjustments page.
    *   **Has stock history:** an **Adjust stock** button that opens `AdjustStockDialog`, shown when `canPost`.
    *   **Link:** **View history** (`/stock?tab=product&product=<id>`).

#### 14. `src/features/products/AdjustStockDialog.tsx` (Create)

*   **Type / Scope**: React component.
*   **Proposed Changes**: a dialog using `components/ui/dialog` and the form fields in `components/app/form.tsx`.
    *   **Location:** allowed locations only.
    *   **Bin:** only when the location has bins.
    *   **Lot:** existing lots of the product at that location, when the product tracks lots.
    *   **Serial:** when the product tracks serials.
    *   **Current on hand:** read-only text in the standard unit.
    *   **New total:** a number field in the standard unit.
    *   **Change:** worked out live and shown as "+5" or "−3".
    *   **Reason:** active reasons other than Opening stock; defaults to "Count correction".
    *   **Date:** defaults to today. **Remarks:** optional.
    *   **Allow negative:** a checkbox shown only to `STOCK_REVIEWERS` when the new total would make stock negative.
    *   **Submit:** calls `adjustTo`, then `onChanged`, and shows the toast "Stock adjusted (ADJ-00042)".

#### 15. `src/features/products/ProductDialog.tsx` (Modify, tabs part)

*   **Type / Scope**: React component.
*   **Proposed Changes**:
    *   On edit, wrap the existing form in `Tabs` with **Details** (today's content) and **Stock** (`ProductStockTab`).
    *   The Stock tab shows only for `itemType === "stocked"`.
    *   Stock lookups load with `useStockLookups` only while the Stock tab is open.
    *   `canPost` is `hasRole(...STOCK_EDITORS)` and `canOverride` is `hasRole(...STOCK_REVIEWERS)`. Both are independent of `canEdit`, so a warehouse user sees read-only Details and a usable Stock tab.
    *   A new prop `initialTab?: "details" | "stock"` is used by Change 3.

#### 16. `src/features/products/ProductsPage.tsx` (Modify)

*   **Type / Scope**: React page.
*   **Proposed Changes**:
    *   Pass `initialTab` through to `ProductDialog`.
    *   After the dialog reports a stock change (`onSaved`), refresh the list. The list shows no quantity column today, and none is added.

#### 17. `src/features/stock/StockPage.tsx` (Modify)

*   **Type / Scope**: React page.
*   **Proposed Changes**:
    *   On mount, read `tab` and `product` from `window.location.search` and use them as the starting values of `tab` and `productId`. Nothing is written back to the address.

### Change 3: Opening stock on create and on products with no history (G1)

#### 18. `src/features/products/OpeningStockRows.tsx` (Create)

*   **Type / Scope**: React component.
*   **Proposed Changes**: an editor for one product's opening stock.
    *   **Props:** `{ product: Pick<Product, "standardUom" | "purchaseUom" | "purchaseUomRatio" | "salesUom" | "salesUomRatio" | "trackLots" | "trackSerials" | "trackExpiry">, rows, onChange, lookups, errors }`.
    *   **Row:** `{ rowId, locationId, binCode, qty, uom, unitCost, lotNumber, lotExpiresOn, serials: string[] }`.
    *   **Columns:**
        *   location, with the default location preselected; hidden when only one location is allowed;
        *   bin, with free text and existing codes suggested;
        *   quantity, plus a unit select from the product's standard, purchase and sales units;
        *   cost per the chosen unit;
        *   lot number and expiry when lots are on (expiry only when expiry is on);
        *   for serials, a list input where you paste or scan one serial per line, and quantity shown as the count.
    *   **Buttons:** "Add location" and "Remove".
    *   **Validation:** reuses `lineProblem` with `requireCost`, and also rejects two rows with the same location, bin and lot, and duplicate serials.
    *   It takes the product's settings from the form being filled, so it works before the product exists.

#### 19. `src/features/products/productStock.ts` (Modify, adds `postOpening`)

*   **Type / Scope**: TypeScript service.
*   **Proposed Changes**:
    *   **Signature:** `postOpening(product, rows, lookups): Promise<OpeningResult[]>`, with `OpeningResult = { locationId, status: "posted" | "failed" | "refused", adjustment?, error? }`.
    *   **Steps, per location group:**
        1.  Check `hasStockHistory` again. If stock exists, the location is `refused` with "Stock was added to this product meanwhile. Use Adjust stock."
        2.  Turn the rows into `LineDraft`s, one per serial for serial rows.
        3.  Call `createAdjustment` with the Opening stock reason, today's date and the remark "Opening stock from product".
    *   **Results:** a `PostingError`, or any error after the document was created, gives `failed` with the document. An error before the document existed gives `failed` with none.
    *   **Cost:** a `CostNotAppliedError` counts as `posted` with a cost warning.

#### 20. `src/features/products/ProductDialog.tsx` (Modify, opening stock part)

*   **Type / Scope**: React component.
*   **Proposed Changes**:
    *   **Where the section shows:** on create, an **Opening stock** fieldset (`OpeningStockRows`) after Tracking and before Barcodes, shown when `stocked && hasRole(...STOCK_EDITORS)`.
        *   For a stocked product and a user who is not a stock editor, show the line "A warehouse or manager user can add stock after you save."
        *   Changing the tracking checkboxes rebuilds the lot and serial columns and clears values that no longer apply.
    *   **Save:**
        1.  Create the product.
        2.  Create its barcodes (as today).
        3.  If rows were entered, call `postOpening`.
        4.  If every location is `posted`, close as today. The toast reads "Product saved with stock at N locations".
        5.  Otherwise keep the dialog open in edit mode for the new product, set `initialTab = "stock"`, and keep the rows that didn't post with their errors.
    *   **Empty rows:** saving with no rows works as today.
    *   **Leaving with unsaved changes:** a dirty Opening stock section counts as unsaved and gets the same close guard as the rest of the form.

#### 21. `src/features/products/ProductStockTab.tsx` (Modify)

*   **Type / Scope**: React component.
*   **Proposed Changes**: Replace the Change 2 "No stock yet" placeholder with `OpeningStockRows` and a **Post opening stock** button calling `postOpening` (stock editors only). Show the results per location in the same way as on create.

### Specs and changelog (all three changes)

#### 22. `docs/specs/0005-product-catalog.md` (Modify)

*   **Type / Scope**: Spec.
*   **Proposed Changes**: Add acceptance criteria for the following, and add the standard unit and ratios to the locked fields list next to type and tracking (AC-2, AC-5):
    *   opening stock on create (G1);
    *   the Stock tab (G2);
    *   Adjust stock from the product (G3);
    *   the unit lock (G5).

#### 23. `docs/specs/0008-stock-adjustments-transfers-counts.md` (Modify)

*   **Type / Scope**: Spec.
*   **Proposed Changes**: State that adjustments with the Opening stock reason carry a unit cost per line and update the moving average once (`costStatus`). Note that the product dialog creates adjustments through the same `createAdjustment`.

#### 24. `docs/specs/0007-stock-ledger-quantities.md` (Modify)

*   **Type / Scope**: Spec.
*   **Proposed Changes**: In task 3, replace "used by opening stock" (which was true only of the seeder) with a pointer to `applyDocumentCost`.

#### 25. `docs/specs/0017-csv-import-export.md` (Modify)

*   **Type / Scope**: Spec.
*   **Proposed Changes**: AC-4 is no longer blocked by D1. It should call `postOpening` per product, or `createAdjustment` with the Opening stock reason and `unitCost`.

#### 26. `docs/02-database-design.md` (Modify)

*   **Type / Scope**: Data model doc.
*   **Proposed Changes**: Add `AdjustmentLine.unitCost` and `StockAdjustment.costStatus`, with their meaning.

#### 27. `change.md` (Modify)

*   **Type / Scope**: Changelog.
*   **Proposed Changes**: One line per change under Unreleased, in the existing "(by noor-selise, YYYY-MM-DD)" format.

### Deploy step (Change 1 only)

*   **Schema push:** push the two schema changes with `node scripts/blocks-data-deploy.mjs --dry-run`, then run it without `--dry-run` after review (README, "Push schemas, access rules and indexes").
*   **No data migration:** both fields are optional.
*   **Existing tenants:** they already have the system Opening stock reason from starter settings. Products whose opening stock was entered through the Adjustments page before this fix keep an average cost of 0 until their next receipt. The changelog says so, and the user can correct it with a new costed Opening stock adjustment if needed.

### Verification Plan

*   **Compilation/Build**: `pnpm typecheck` and `pnpm build`.
*   **Static Analysis & Linting**: `pnpm lint` (oxlint).
*   **Unit Tests**: no test runner is set up in this repo. Adding one is out of scope. The pure logic is kept in plain functions so a later runner can cover it without changes: the change worked out by `adjustTo`, the unit cost conversion, the cost weighting per product, and the row validation in `OpeningStockRows`.
*   **E2E/Integration**: walk each CUJ in the running app against the dev Blocks project, as admin, purchasing and warehouse users:
    *   **CUJ 1:** check the two adjustments on the Adjustments page, lot `L-0425`, on hand 24 and 6, and average cost 3.50 shown on the product.
    *   **CUJ 2:** a purchasing user sees no Opening stock section.
    *   **CUJ 3:** opening stock from the Stock tab.
    *   **CUJ 4:** new total 37 from 40 posts −3, and the average cost doesn't change.
    *   **CUJ 5:** in the browser's network panel, block the second `InventoryMovement` insert, check the banner, unblock, press **Try again** twice, and check on hand counts once.
    *   **CUJ 6:** the unit is locked after any adjustment.
    *   **Cost claim:** run the cost step twice through **Update cost** and check that the average doesn't move the second time.
    *   **Seeder:** run starter settings plus demo opening stock twice and check that average costs match the first run.

--------------------------------------------------------------------------------

*Drafted with EGM*
