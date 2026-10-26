# 0028. Asset depreciation per organization: rationale

## Context

> **Premise note:** the rates you gave cite the Income-tax Ordinance 1984, which the Income Tax Act 2023 replaced from the 2023 to 2024 income year. If a rate changed, an app that files with the old one gives wrong tax figures. The rates are seeded as given, marked as a preset (`bd-standard-v1`) with a note to confirm, and every organization can edit its copy. Also, you chose monthly charges. Bangladesh tax practice usually charges a full year in the year an asset is first used and nothing in the year of disposal, so the monthly schedule may not equal the figure on the tax return. The preset keeps the year rule separate so a yearly tax view can be added later.

The app tracks stock for sale at moving average cost (spec 0007). Companies also own things they use and do not sell: vehicles, machines, computers, buildings. Those lose value over time, and in Bangladesh tax law that loss is the written down value method at a fixed rate per class of asset. Today the app has no way to tell a sale item from an owned asset, and no record of an asset's value over time.

Multi organization mode is on (spec 0027). Each company is one Blocks organization, and every record carries its `OrganizationId`, so data is already separated per company. Companies can be in different countries, with different rules and rates, and one company's choices must never change another's.

The forces: numbers that feed tax filings must not change after they are reported. Rates change with the law and with a company's own policy. There is no custom server, only Blocks Data with unique indexes, a proven compare and set on one record by filtered update, no transactions across records (spec 0026), and no signed in workflows yet (scope feature 13). Asset counts per company are small (tens to a few thousand), and later rules (accelerated rates, reconditioned vehicle age rates) need per unit facts like age and first year of use.

Without a decision, either assets get mixed into stock, which corrupts average cost and stock reports, or depreciation gets computed differently on every screen and cannot be audited.

## Options considered

### Option 1: Live computed schedule, nothing stored

Each screen computes the schedule on the fly from cost, in service date, class rate, and today.

**Pros**:
- Fewest records and screens; no close step for anyone to forget.
- Always up to date with the latest asset data.

**Cons**:
- A rate edit silently rewrites every past month, so last year's reported figure changes.
- Nothing to audit, nothing to reconcile a filing against.

### Option 2: Per unit assets, admin month close writes locked entries (chosen)

Each physical unit is a `FixedAsset`. An admin closes each month, which writes one `DepreciationEntry` per asset with its rate snapshot. Unique indexes on (asset, month) and (month) make the close safe to repeat.

**Pros**:
- History is frozen and auditable; rate edits only affect open months.
- Works on Blocks without transactions: a compare and set on the `Company` control state stops double closes, and unique indexes make every insert safe to retry.
- Per unit records can carry what later rules need (age, reconditioned flag) once those rules are designed.

**Cons**:
- Someone has to close each month; forgotten months pile up (they can be closed in a row).
- The close runs in the browser, so very large asset counts are slow.

### Option 3: Pooled WDV per class (tax block)

One WDV balance per class per organization; additions add to the pool, disposals subtract.

**Pros**:
- Matches some tax filings that work by block.
- Very few records.

**Cons**:
- Loses per asset value, so one unit's sale or scrap gain or loss cannot be shown.
- Age based rates for reconditioned vehicles cannot work on a pool.

### Option 4: Scheduled Blocks workflow runs the close

A server workflow closes each month automatically.

**Pros**:
- No one has to remember; no browser limit.

**Cons**:
- Blocked today: workflows have no signed in identity to write data (scope feature 13 note).
- Harder to preview and debug than the in app close.

## Rationale

The forces that decide this are frozen history and Blocks' limits. Filed figures must not move, which rules out Option 1. Per unit facts are needed for disposals now and age rates later, which rules out Option 3. Option 4 would be best operationally, but the platform cannot run it yet. Option 2 is the one that works today on Blocks alone: unique indexes give the same safety a transaction would for this pattern (claim the month, write entries that cannot duplicate, finish), and an interrupted close just resumes.

Presets live as versioned files in app code rather than a shared Blocks table, because Blocks records belong to one organization each, and a global table would need a policy workaround. Copying the preset into each organization's own `DepreciationClass` records gives each company an editable copy and keeps edits isolated. A law change becomes a new preset id, so an organization's history always names the preset it started from.

The monthly charge uses the year's opening WDV as its base and trues up in the last month of the income year. That way the yearly total equals the yearly rate exactly, whatever the rounding, and the WDV still steps down once per income year as the method expects. The runner up was pro rata on a monthly WDV (compounding each month), which gives a different and less familiar yearly figure.

Recommendations made during writing:
- WDV is derived from entries, not stored on the asset. Close only inserts entries and reopen only deletes them, so there is no window where an asset and its entries disagree (runner up: a cached `currentWdv` updated by close, which needs repair after a crash).
- One control state per organization, on `Company`, changed only by compare and set (spec 0026 proved a filtered update is atomic on one record). It serializes close and reopen across all months. An earlier draft said Blocks had no conditional update; that was wrong (runner up: an insert claim per month and attempt, which could not stop a close and a reopen of neighbouring months from racing).
- Asset writes do not take a lock. They check the control state before and after writing, and put the change back if a close started in between. Receipts never race a close, because a receipt is dated today and only ended months close.
- An income year always uses the rate of an asset's first entry in that year, and charges use cumulative rounding. The year total is exact, so there is no true up, no negative charge, and nothing left over on disposed assets (runner up: a true up in the last month, which needed a rate snapshot per close and a block on class edits).
- Money math runs in integer minor units inside `calc.ts` only, so floating point drift cannot build up.
- The disposal month is not charged and the in service month is charged in full (runner up: half month rules, which add complexity with no matching legal basis).
- Gain or loss is worked out when shown, not stored, so it cannot go stale while months are still being closed.
- Asset cost is the net vendor price in home currency. Spreading freight onto asset lines would change stocked lines' landed cost and average cost on mixed orders.
- A cost change after receipt is not recosted, the same as stock (spec 0012). A manual cost edit stays possible while the asset has no entries.
- Fields for the deferred Bangladesh rules (accelerated, reconditioned vehicles) are left out until those rules are designed. Adding a field on Blocks is one schema push.
- The checks follow the project's own pattern (`scripts/checks/*.mjs` run by Node, which strips TypeScript types), so no test library is added.
- The EGM review (`egm/reviews/`) found the gaps behind these choices. Its Stage 8 report picked this smaller remediation set.
