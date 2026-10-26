# 0028. Asset depreciation per organization

**Date**: 2026-10-27 (revised the same day after the EGM review, `egm/reviews/`)
**Status**: In Progress

## Summary

Today the app has no way to tell stock you sell from things your company owns and uses, so it cannot show how those owned things lose value. This spec adds a product type, fixed asset (trucks, laptops, machines). Each unit you own becomes its own asset record and loses value every month by the written down value method (WDV: each year's charge is a percentage of the value left, not of the original cost). When an admin picks Bangladesh as the company's country, the app copies ten standard classes and rates into that organization only. An admin closes months in order, and each close writes entries that never change afterwards.

## Terms

- **WDV**: the value left. An asset's WDV is its cost (or opening WDV) minus its counted entries.
- **Income year**: the 12 months the rates apply to. Bangladesh runs July to June, labelled `2026-27`.
- **Start period**: the first month this organization charges depreciation. Always the first month of an income year.
- **In service date**: the day an asset starts being used. Its month is its first charge month (or the start period, if later).
- **Next open month**: the start period when no month is closed yet, otherwise the month after the latest closed month.
- **Counted entry**: a depreciation entry whose month is at or before the latest closed month.
- **Cost viewers**: the roles in `COST_VIEWERS` (`src/features/team/roles.ts`). Only they see money values.

## Requirements

**User stories**:
- As an admin, I want to pick my company's country so that the right classes and rates are set up for my organization only.
- As an admin or manager, I want each truck, laptop, or machine to be its own asset record so that I can see its cost, WDV, and monthly charge.
- As an admin, I want to close each month so that depreciation is recorded once and never changes afterwards.
- As a purchasing or warehouse user, I want receiving a fixed asset on a purchase order to create the asset records for me.
- As an admin or manager, I want a yearly depreciation schedule per class and per asset that I can export.

**Acceptance criteria**:
- **AC-1**: On Company settings, an admin picks the country (Bangladesh is the only choice) and a start period (an income year, by default the current one). The organization then gets these classes from preset `bd-standard-v1` as its own records. Other organizations are not changed.

  | Code | Class | Rate |
  |---|---|---|
  | `BLDG` | Buildings (general) | 5% |
  | `BLDG_FACTORY` | Factory buildings | 10% |
  | `PLANT` | Plant, machinery and equipment | 10% |
  | `VEH` | Motor vehicles (owned) | 10% |
  | `VEH_HIRE` | Motor vehicles (used on hire) | 20% |
  | `COMPUTER` | Computer hardware | 25% |
  | `MEDICAL` | Medical equipment | 20% |
  | `AIRCRAFT` | Aircraft and aero engines | 30% |
  | `ROAD` | Bridges, roads and flyovers | 2% |
  | `OTHER` | Other tangible assets | 10% |

- **AC-2**: Until the country is set, the Assets screen shows a prompt that links to Company settings. Without a country, nobody can add assets, receive fixed asset lines, or close months.
- **AC-3**: Setup changes:
  - Running setup again only adds missing class codes. It never changes or removes a class.
  - The start period can change only while no month is closed.
  - Once any month is closed, the country, the start period, and the company time zone are locked.
- **AC-4**: An admin can rename a class, change its rate, deactivate it, or add a custom class.
  - For each asset, an income year always uses the rate (and class) of that asset's first entry in that year. A rate or class change therefore takes effect from the asset's next income year that has no entries yet.
  - A deactivated class can't be picked for new assets or products. Assets already on it keep depreciating.
- **AC-5**: The product type list gains `fixed_asset`. Like every type, it is locked after the first save.
  - A fixed asset product needs a default depreciation class and has no lot, serial, or expiry tracking.
  - It can be bought on purchase orders.
  - It is never offered on sales orders or in price lists, a sales order that contains one is refused, and it never appears in stock, counts, or reordering.
- **AC-6**: Receiving a fixed asset line creates one asset per unit.
  - **Cost**: the line's net vendor unit price (after the line discount) in home currency, rounded to 2 decimals. Freight and other extra costs stay on stocked lines only, so stock average cost is unchanged.
  - **Class**: the product's default class. **Location**: the receive location. **Number**: the next `FA-` number. **Serial**: kept when the row receives exactly one unit.
  - **In service date**: the receipt day in the company time zone. If that month is already closed (possible only near midnight at a month end), the asset starts on the first day of the next open month.
  - **Duplicates**: finishing or resuming a receipt never creates a second asset for the same unit.
  - **Blocked**: when the quantity is not a whole number, when the product has no class, or when no country is set.
  - **Returns**: fixed asset lines can't be returned to the vendor (dispose of the asset instead).
- **AC-7**: An admin or manager can add an asset by hand: product, class, cost, in service date, location, serial.
  - The in service date must fall between the first day of the next open month and today.
  - An asset in service before the start period can be added only while no month is closed. It needs an opening WDV as at the start period, between 0 and its cost.
  - A hand entered asset with no counted entries can be deleted. Received assets can't be deleted; they are disposed of instead.
- **AC-8**: For each month an asset is in use, the charge comes from the calculation rules (see Feature design), so that:
  - the year's total equals `round(base × rate × months used ÷ 1200)`;
  - WDV never goes below 0;
  - an asset at WDV 0 gets no further entries.

  "In use for a month" means two things: that month is at or after the asset's first charge month, and the asset has no disposal date in or before that month.
- **AC-9**: An admin closes months one at a time, in order, starting at the start period, and only months that have fully ended in the company time zone.
  - Before closing, the admin sees a preview: asset count and total charge per class.
  - Closing writes one entry per asset in use.
  - Two admins pressing Close at the same time produce one close.
  - A close that stops halfway shows as "closing" to every admin and can be resumed by any admin. It ends with the same totals.
  - While a month is closing or reopening, adding, editing, disposing, or deleting assets is refused.
- **AC-10**: An admin can reopen only the most recently closed month. Reopening removes that month's entries, so each asset's WDV returns to its value before that month. A reopen that stops halfway can be resumed.
- **AC-11**: An admin or manager can mark an asset as sold or scrapped.
  - The disposal date must be on or after the next open month, on or after the in service date, and no later than today.
  - The amount received is entered for a sale and is 0 for scrap.
  - Charges stop from the disposal month.
  - Gain or loss is `amount received − WDV at disposal`. It is labelled provisional until every month before the disposal month is closed.
  - While the disposal month is still open, the disposal can be edited or undone.
- **AC-12**: The Assets list filters by class, status (in use, disposed), and location, 50 rows per page. People with location limits (spec 0003) see only assets in their locations. Asset detail shows cost, current WDV, the month by month entries, and a yearly summary (opening WDV, charge, closing WDV per income year).
- **AC-13**: The report "Depreciation schedule" (Reports, Inventory group) covers the income year that contains the chosen date, and counts closed months only. Each row is one asset: class code, class, asset number, product, opening WDV, additions, depreciation, disposals (WDV removed and amount received), closing WDV, and a "Closed through" month.
  - Every row satisfies `opening + additions − depreciation − disposal WDV = closing`.
  - Assets put in service during the year have opening 0 and their cost under additions. Assets with an opening WDV show it under opening.
  - Group by class gives the class view. The report exports to CSV.
- **AC-14**: Roles:
  - Only Admin sets the country, edits classes, and closes or reopens months.
  - Admin and Manager add, edit, dispose of, and delete assets.
  - Receivers (spec 0003) create assets only by receiving.
  - Everyone else can view assets but not change them.
  - Cost, WDV, charges, disposal amounts, and all totals are hidden from anyone who is not a cost viewer.

## Goals and Non-goals

**Goals**: AC-1 to AC-14 for Bangladesh, monthly book depreciation on WDV.

**Non-goals** (each can become its own follow up):
- the figure for the tax return (the Bangladesh yearly rule: a full year in the year of use, none in the year of disposal);
- accelerated 60/40 rates, initial allowances, reconditioned vehicle rates by age;
- countries other than Bangladesh;
- recosting an asset when a purchase order's freight changes after receipt (spec 0012 doesn't recost stock either);
- returning fixed assets to the vendor;
- journal entries or accounting sync (spec 0018);
- CSV import of opening assets (spec 0017);
- partial disposal, revaluation, impairment, and location history;
- a server side scheduled close.

## Decision

**Chosen option**: Option 2: one record per physical asset, with a monthly admin close that writes entries that never change. A single control state on each organization's `Company` record, updated with compare and set, guards every close and reopen. Country presets are versioned files in the app.

One pure calculation module, `src/features/depreciation/calc.ts`, computes every charge. Cumulative rounding makes each year total exactly, so no true up entry is needed. WDV is never stored on the asset.

**Implementation skills**: `blocks-data-gateway-configuration` (`.agents/skills/blocks-data-gateway-configuration/`) · `blocks-data-gateway-crud` (`.agents/skills/blocks-data-gateway-crud/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Blocks fit

| Need | Blocks piece | Verdict |
|---|---|---|
| Classes, assets, entries, run log | Schemas + CRUD | ✅ |
| One entry per asset per month; one asset per received unit | Unique indexes on `assetId,period` and `unitKey` (always set, never null) | ✅ |
| One close or reopen at a time | Filtered update on `Company` as compare and set ([spec 0026](../0026-stock-posting-compare-and-set.md), proven) | ✅ |
| Unique keys per organization | The existing indexes carry no `OrganizationId`, the same as `NumberingRule.documentType` | ⚠️ Waits on the isolation check in [spec 0003](../0003-auth-team-roles/index.md) step 4b |
| Entries nobody can edit | Row policies; grammar undocumented (spec 0002 L6), `rules.json` has `policies: []` | ⚠️ App rule only for now; Follow-up to probe |
| Sums | No server sums (spec 0002 L3); the browser reads pages | ⚠️ Fine for small companies; not measured |
| Dates | `DateTime` only (no `Date` type); calendar days stored as `YYYY-MM-DDT00:00:00Z` | ✅ |

## Feature design

### Data model

Every record also carries Blocks `OrganizationId`, `CreatedBy`, `LastUpdatedBy`, and `LastUpdatedDate`. Blocks can't mark a field required, so `actions.ts` checks required fields.

- **`Company`** (existing; add):
  - `countryCode` String (`BD`)
  - `depreciationPresetId` String (`bd-standard-v1`)
  - `incomeYearStartMonth` Int (7)
  - `depreciationStartPeriod` String (`YYYY-MM`)
  - control state: `depreciationStatus` String (`open`, `closing`, `reopening`), `depreciationLatestClosed` String (`YYYY-MM`, or `""` when none), `depreciationActivePeriod` String (`""` when idle), `depreciationRunId` String

  Empty strings stand in for "none", because Blocks ignores `null` in an update.
- **`Product`** (existing; add): `itemType` value `fixed_asset`, and `depreciationClassId` ID.
- **`DepreciationClass`**: `code` String (unique), `name` String, `method` String (`wdv`), `ratePercent` Float (0 to 100), `presetId` String (empty for custom classes), `isActive` Boolean.
- **`FixedAsset`**:
  - identity: `assetNumber` String (unique, `FA-00001`), `unitKey` String (unique; `receipt:<stepId>:<row>:<n>`, where row is the step line's position, or `manual:<uuid>`)
  - links: `productId` ID, `classId` ID, `locationId` ID, `purchaseOrderId` ID (receipts only), `source` String (`receipt`, `manual`)
  - details: `serialNumber` String, `inServiceDate` DateTime, `cost` Float, `openingWdv` Float (only for assets in service before the start period)
  - disposal: `status` String (`active`, `disposed`), `disposalType` String (`sold`, `scrapped`), `disposalDate` DateTime, `disposalAmount` Float
- **`DepreciationEntry`**: `assetId` ID, `period` String (`YYYY-MM`), `incomeYear` String, `classId` ID, `ratePercent` Float, `base` Float, `amount` Float, `closingWdv` Float, `runId` String. The pair `assetId,period` is unique, and `period` is indexed.
- **`DepreciationRun`** (audit log, never edited): `action` String (`close`, `reopen`), `period` String, `runId` String, `by` String, `at` DateTime, `assetCount` Int, `total` Float.

**Presets**: `src/features/depreciation/presets.ts` exports `PRESETS` with `bd-standard-v1` (country `BD`, start month 7, the classes in AC-1, and a note to confirm the rates against the Income Tax Act 2023). A preset is never edited in place; a law change becomes a new id.

### Calculation rules (`calc.ts`, pure, no app imports, checked by `scripts/checks/depreciation.mjs`)

- **Money**:
  - Values are stored as Float with 2 decimals.
  - `calc.ts` converts to integer minor units (`Math.round(value × 100)`), computes, and converts back.
  - `roundMinor` rounds half away from zero. It is separate from `round2` in `order-math.ts`.
  - Only currencies with 2 decimals are supported (`Currency.decimals`).
- **Months**: a stored date's month comes from its date part (`YYYY-MM`). A timestamp (a receipt's `at`, "today") becomes a calendar day in `Company.timeZone` first.
- **Starting value**: `openingWdv` if set, otherwise `cost`. Call it the initial value.
- **First charge month**: the later of the start period and the in service month.
- **WDV before a month**: the `closingWdv` of the asset's latest counted entry before that month, otherwise the initial value.
- **Year base**: the `closingWdv` of the asset's latest counted entry before the income year starts, otherwise the initial value. It stays fixed for the year.
- **Year rate**: the `ratePercent` of the asset's first entry in the income year, otherwise the current rate of its class.
- **Charge for the k-th charged month of the year**: `roundMinor(base × rate × k ÷ 1200) − roundMinor(base × rate × (k − 1) ÷ 1200)`, capped at WDV before. No entry when WDV before is 0.
- **Income year label**: `2026-27`, or `2026` when the year starts in January.

### State transitions

- **`FixedAsset`**: `active` → `disposed` (dispose) → `active` (undo, only while the disposal month is open).
- **Company control state**:
  - `open` → `closing`: compare and set on `status = open` and `latestClosed = X`. The filter sets `activePeriod = X + 1` and a new `runId`.
  - `closing` → `open`: compare and set on `status = closing` and `runId = mine`. It sets `latestClosed = activePeriod` and `activePeriod = ""`.
  - `open` → `reopening`: compare and set on `status = open` and `latestClosed = M`. It sets `activePeriod = M` and a new `runId`.
  - `reopening` → `open`: sets `latestClosed` to the month before M, or `""` when M is the start period.
  - **Resume**: any admin can resume a stuck close or reopen. A compare and set on the old `runId` swaps in a new one, so the earlier browser stops at its next check.

### Close, reopen, and guarded writes (`src/features/depreciation/actions.ts`)

- **`closeMonth`**:
  1. Claim the month. On a fresh claim (not a resume), delete any entries already in that month left over from an older run.
  2. Read every active asset in pages of 1000, plus the counted entries the rules need.
  3. Insert the missing entries; a duplicate means already written. Every 50 inserts, check that `runId` is still mine, and stop if it isn't.
  4. Read the assets again and insert any entries still missing.
  5. Write a `DepreciationRun` row with the count and total, read from the month's entries.
  6. Finish with a compare and set.
- **`reopenMonth`**: claim, delete every entry of the month (one call per record), write a `DepreciationRun` row, then finish.
- **Guarded writes** (add, edit, dispose, undo, delete an asset):
  1. Read the control state and refuse unless it is `open`.
  2. Check the dates against the next open month.
  3. Write.
  4. Read the control state again. If it is no longer `open`, or `latestClosed` has moved, put the change back (delete the new asset, or restore the old values) and say "A month close just started. Try again when it finishes."

### Receiving (`src/features/purchasing/actions.ts`)

- **`checkLines`**: refuses a negative quantity on a `fixed_asset` line.
- **`receiveLines`**:
  - Checks the fixed asset rules in AC-6 before the step starts.
  - Records each fixed asset line's cost in its `StockStepLine.unitCost`, computed as `round2(toHome(discounted(unitPrice, discountType, discount) × qty ÷ stdQty, exchangeRate))`. `landedUnitCosts` stays unchanged.
  - Passes the serial for fixed asset rows that receive exactly one unit.
  - After the step, calls `syncReceiptAssets`.
- **`syncReceiptAssets(order, context)`** (in `src/features/depreciation/receipts.ts`):
  - Skips cancelled orders.
  - For every `posted` receive step and every fixed asset line in it, inserts the assets for units `0..qty−1` that don't exist yet, by `unitKey`.
  - A duplicate on `unitKey` means the unit is already there.
  - It is called after receiving, after `finishPurchaseStep`, and when a purchase order detail opens with received fixed asset lines.
- **`cancelPurchaseOrder`**:
  - Refused while any asset from the order has counted entries or is disposed of.
  - Otherwise, deletes the order's assets after the cancel.

### Screens

- **Company settings** (`/settings/company`): a Depreciation card with the country and start period, and setup status. Once a month is closed, the time zone select is disabled and `save()` refuses a time zone change.
- **Depreciation classes** (`/settings/depreciation`): a class list built with `RecordList`, editable by admins only.
- **Assets** (`/assets`): the filtered, paged list and an Add asset dialog. The asset detail opens as a panel on the same page, because the router matches exact paths only. The detail shows entries, a yearly summary, and the edit, dispose, undo, and delete actions.
- **Close month** (`/assets/close`): the control state, the next month with its preview per class, Close, Resume, and Reopen latest, plus the run history.
- **Navigation**: under Inventory, "Fixed assets" and "Close month". Under Settings, "Depreciation".
- **Product form**: `fixed_asset` in the type list, with a class picker when it's chosen, and no tracking section.
- **Purchase order receive dialog**: fixed asset lines get a Row button and an optional serial for each one unit row.
- **Sales**: `OrderLinesEditor` hides `fixed_asset` in sales mode, `PriceListsPage` hides it from its product lists, and the sales `checkLines` refuses it.

### API surface

| Action | Writes | Who | Key errors |
|---|---|---|---|
| `setupDepreciation(countryCode, startPeriod)` | `DepreciationClass` (missing codes only, first), then `Company` | Admin | a month is closed and the start period changes |
| class save (`RecordList`) | `DepreciationClass` | Admin | duplicate code, rate outside 0 to 100 |
| `createAsset(draft)` | `FixedAsset` via `withNextNumber("fixed_asset")` | Admin, Manager | no country, date rule, opening WDV rule, inactive class, close running |
| `updateAsset(asset, patch)` | `FixedAsset` (class, location, serial; cost and in service date only with no counted entries) | Admin, Manager | has entries, close running |
| `deleteAsset(asset)` | `FixedAsset` | Admin, Manager | received asset, or has entries |
| `disposeAsset` / `undoDisposal` | `FixedAsset` | Admin, Manager | date rule, close running |
| `previewMonth()` | reads only | Admin | nothing to close, month not ended |
| `closeMonth()` / `reopenMonth()` | `Company` control state, `DepreciationEntry`, `DepreciationRun` | Admin | not in order, claimed by someone else (offer resume) |
| `syncReceiptAssets` | `FixedAsset` | Receivers | none (missing units are filled in later) |
| report `depreciation-schedule` | reads only | anyone with report access, values masked | none |

### Value sourcing

| Action | Value | Source |
|---|---|---|
| setup | classes, start month | `PRESETS["bd-standard-v1"]` |
| setup | default start period | first month of the income year that contains today in `Company.timeZone` |
| any write | organization | Blocks session (spec 0003) |
| receive | asset cost | line net unit price in home currency (see Receiving) |
| receive | in service date | step `at` → day in `Company.timeZone`; moved to the next open month when closed |
| receive | location, class, number | `receiveLocationId`, `Product.depreciationClassId`, numbering `fixed_asset` (`FA-`) |
| close | which month | `latestClosed + 1`, or the start period |
| close | "month has ended" | today in `Company.timeZone` (the admin's clock; noted) |
| close | base, rate, charge | calculation rules, from cost, opening WDV, class, and counted entries |
| close | count and total | the month's entries |
| list and detail | current WDV | latest counted entry `closingWdv`, else the initial value |
| dispose | gain or loss | `disposalAmount − WDV before the disposal month`, worked out when shown |
| report | each column | AC-13 identity, from assets and counted entries |
| all reads | masking | `COST_VIEWERS` |
| list | location limits | `locationFilter(useLocationScope(), "locationId")` |

### Key invariants

- One entry per asset per month. One asset per received unit.
- Months close in order with no gaps, never before the start period, and never a month that hasn't ended.
- Only counted entries affect WDV, the report, and the preview.
- No asset change is written while the control state is not `open`.
- Fixed asset products never touch `InventoryMovement`, `InventoryBalance`, `averageCost`, or sales orders.
- Every charge comes from `calc.ts`.

### Security model

- Organization isolation comes from Blocks `OrganizationId` (spec 0003 AC-2, with the live check still to do).
- New role lists in `roles.ts`: `DEPRECIATION_ADMINS` = admin, and `ASSET_EDITORS` = admin, manager. Receiving uses `RECEIVERS`.
- Roles only hide controls in the screens. Blocks doesn't enforce them yet, the same as every other feature here.
- The new schemas get the standard `security` entries (signed in users) from the deploy script.
- Every close and reopen leaves a `DepreciationRun` row recording who and when.

### Critical test scenarios

Automated checks (`node scripts/checks/depreciation.mjs`, pure `calc.ts`):
- **Happy path**: a laptop costing 120,000.00 in class Computer hardware 25%, in service September 2026, start period July 2026. September 2026 to June 2027 charge 2,500.00 each, total 25,000.00, closing WDV 95,000.00. Next year the base is 95,000.00 and the charges are 1,979.17, 1,979.16, 1,979.17, and so on, total 23,750.00. Verifies **AC-8**.
- **Rate edit**: a rate change after one charged month leaves that income year at the first entry's rate. Verifies **AC-4**.
- **Floor**: WDV 1.00 with a charge worked out as 2.50 is charged 1.00, and nothing after. Verifies **AC-8**.
- **Disposal**: disposed in March, March is not charged. In service and disposed in the same month, nothing is charged. Verifies **AC-8**, **AC-11**.
- **Opening WDV**: an asset in service in 2024 with opening WDV 50,000.00 at a July 2026 start uses 50,000.00 as its base. Verifies **AC-7**.
- **Report identity**: every row satisfies opening + additions − depreciation − disposal WDV = closing, and new assets show opening 0. Verifies **AC-13**.
- **Labels and months**: `2026-27` and `2026` labels. A timestamp at 23:30 UTC on 31 October becomes 1 November in Asia/Dhaka. Verifies **AC-6**, **AC-9**.

Manual checks against live Blocks (engineer, via `/check verify`):
- Two tabs press Close at once and only one wins. A tab closed mid close is resumed with the same total. Verifies **AC-9**.
- Reopen the latest month and WDV returns. Reopening an older month is refused. Verifies **AC-10**.
- Receive two laptops with a stocked line and freight on one purchase order. You get two assets at the net price, and the stocked line's average cost matches spec 0012. Refresh during the receive and it still ends with two assets. Verifies **AC-6**.
- A second organization without a country sees the prompt and none of the first organization's records. Verifies **AC-1**, **AC-2**.
- A Warehouse user sees assets without money values and with no actions. Verifies **AC-14**.
- A fixed asset is not offered on a sales order or a price list. Verifies **AC-5**.
- After setup and a reopen, the start period can change only while no month is closed. Verifies **AC-3**.
- The report for 2026-27 matches the entries and exports to CSV. Verifies **AC-13**.
- The list filters, pages, and respects location limits. Verifies **AC-12**.

## Build plan

The project builds Tracer Bullet style: one working path first (a hand entered asset closed for one month), then each step adds to it. Every step ends with `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `node scripts/checks/depreciation.mjs` passing.

1. [ ] **Data, rules, and the first close** (code done and checks pass; the Blocks deploy stopped after the schema push, see below): completes **AC-1**, **AC-2**, **AC-7**, **AC-8**, **AC-9**, **AC-14**; part of **AC-12** (detail).
   - Schemas: add `blocks/data/schemas/DepreciationClass.json`, `FixedAsset.json`, `DepreciationEntry.json`, `DepreciationRun.json`; edit `Company.json` and `Product.json`.
   - Indexes in `blocks/data/indexes.json`: `DepreciationClass` `code` unique; `FixedAsset` `assetNumber` unique, `unitKey` unique, `purchaseOrderId`, `status`; `DepreciationEntry` `assetId,period` unique, `period`; `DepreciationRun` `period`.
   - Deploy and check: `node scripts/blocks-data-deploy.mjs --dry-run`, then without the flag (it pushes, sets security, adds indexes, reloads). 2026-10-27: the schemas were pushed, then the script failed reading the schema list back (over Node's 1 MB buffer; `maxBuffer` is now raised). Security, indexes and reload still need one more run.
   - Code: `src/features/depreciation/presets.ts`, `calc.ts`, `api.ts` (collections), `actions.ts` (setup, guarded asset writes, close and reopen).
   - Checks: `scripts/checks/depreciation.mjs`.
   - Settings and roles: `src/features/settings/api.ts` (Company fields), `numbering.ts` and `seed-data.ts` (`fixed_asset`, `FA-`), `roles.ts` (`DEPRECIATION_ADMINS`, `ASSET_EDITORS`).
   - Products: `src/features/products/api.ts` (`ITEM_TYPES`, `depreciationClassId` in `PRODUCT_FIELDS`) and `ProductDialog.tsx` (class picker).
   - Screens: the Depreciation card in `CompanyPage.tsx` with the time zone lock; `AssetsPage.tsx` with Add asset and the detail panel; `CloseMonthPage.tsx`.
   - Routing: `routes.tsx` and `AppShell.tsx`.
2. [x] **Classes, reopen, and disposal**: completes **AC-3**, **AC-4**, **AC-10**, **AC-11**.
   - Add `ClassesPage.tsx` at `/settings/depreciation`.
   - Add reopen and resume to the close page.
   - Add dispose, undo, edit, and delete to the asset detail.
3. [x] **Receiving and sales exclusion**: completes **AC-5**, **AC-6**.
   - `purchasing/actions.ts`: `checkLines`, `receiveLines`, `finishPurchaseStep`, `cancelPurchaseOrder`.
   - New `depreciation/receipts.ts`.
   - `PurchaseOrderDetail.tsx`: receive rows and the sync when it opens.
   - Sales: `sales/actions.ts` `checkLines`, `sales/OrderLinesEditor.tsx`, `pricing/PriceListsPage.tsx`.
4. [x] **List and report**: completes **AC-12**, **AC-13**.
   - Assets list filters, paging, location limits, and the yearly summary.
   - The `depreciation-schedule` entry in `src/features/reports/definitions.ts`, with money columns marked `cost: true`.

## Consequences

**Positive**:
- A closed month never changes, so the schedule matches the recorded entries even after rate edits.
- WDV comes from entries, so a close or reopen that stops halfway can always be resumed or redone.
- Cumulative rounding and a rate fixed for each income year remove the true up and any rounding left over.
- One organization's classes and edits don't affect any other organization.

**Negative / tradeoffs**:
- The close runs in the admin's browser. Speed for large asset counts is not measured. It reads in pages of 1000, up to 50 pages.
- Asset changes are refused while a month is closing, and a stuck close waits for an admin to resume it.
- The monthly book figure won't match the yearly tax rule.
- Roles are enforced only in the screens until spec 0003's server side checks exist.
- If Blocks unique indexes turn out to be global rather than per organization, the second organization's `FA-` numbers and class codes would clash (the same risk the existing numbering already carries).

**Neutral**:
- Four new schemas, new fields on `Company` and `Product`, a new `itemType` value, and a new numbering type.

## Follow-up

- [ ] Confirm the `bd-standard-v1` rates against the Income Tax Act 2023 before anyone files with them. The Act replaced the 1984 Ordinance. A change becomes `bd-standard-v2`.
- [ ] Probe the Blocks row policy grammar, then deny edit and delete on `DepreciationEntry` and `DepreciationRun` for every role.
- [ ] Run the spec 0003 step 4b isolation check with a second organization, covering unique keys.
- [ ] Decide whether a yearly tax view is needed next to the monthly schedule.
- [ ] Add accelerated, initial allowance, and reconditioned vehicle rates, with new fields and methods designed then (deferred in `docs/scope/scope.md`).
- [ ] Allow returning fixed assets to the vendor, and add CSV import of opening assets (spec 0017).
- [ ] Move the close to a scheduled workflow once a workflow can act as a signed in user (see scope feature 13).
