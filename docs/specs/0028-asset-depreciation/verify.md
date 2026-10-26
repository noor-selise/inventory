# Verify: asset depreciation · spec 0028 · updated 2026-10-27
_Steps derived from spec 0028 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## Before you start
- [ ] `node scripts/blocks-data-deploy.mjs` finishes (security, indexes, reload) and its access summary shows public 0 → AC-14
- [ ] `blocks data schema indexes` (or the deploy log) lists `FixedAsset.unitKey` and `DepreciationEntry.assetId,period` as unique → AC-6, AC-9

## Commands
- [ ] `node scripts/checks/depreciation.mjs` → 11 lines of `ok` → AC-4, AC-6, AC-7, AC-8, AC-11, AC-13
- [ ] `pnpm typecheck`, `pnpm exec oxlint`, `pnpm build` pass

## UI / manual
- [ ] Fixed assets with no country set → prompt linking to Company settings; Close month shows the same; receiving a fixed asset line is refused → AC-2
- [ ] Company settings → Depreciation → Bangladesh, 2026-27 → Settings, Depreciation lists the 10 classes and rates from AC-1; a second organization sees none of them → AC-1
- [ ] Save setup again → no duplicate classes. Change the start period while no month is closed → allowed. Close a month → country, start period and time zone are disabled, and saving a new time zone is refused → AC-3
- [ ] Create a product of type Fixed asset with class Computer hardware → no tracking section; it is missing from sales order lines and price lists, and a sales order saved with it is refused → AC-5
- [ ] Add asset by hand: 120,000.00, in service 15 Sep 2026 → number `FA-00001`; a date in a closed month or in the future is refused; a 2024 date asks for the opening WDV (only before any close) → AC-7
- [ ] Close Jul 2026 to Sep 2026 → the September preview shows Computer hardware 1 asset 2,500.00; after the close, asset detail shows 2,500.00 and WDV 117,500.00 → AC-8, AC-9, AC-12
- [ ] Try to close the current month → refused ("has not ended yet") → AC-9
- [ ] Two tabs press Close at once → one succeeds, the other says another admin started it; History shows one row → AC-9
- [ ] Close the tab mid close (many assets) → banner "stopped before it finished", Resume finishes with the same total as the preview → AC-9
- [ ] Reopen the latest month → its entries are gone, WDV returns; the Reopen button only offers the latest month → AC-10
- [ ] Edit a class rate mid year → this year's charges keep the old rate; July of the next income year uses the new one → AC-4
- [ ] Sell an asset in an open month → status Sold, gain or loss shown as provisional; undo while the month is open → AC-11
- [ ] Receive 2 units of a fixed asset product plus a stocked line with freight on one purchase order → 2 assets at the net unit price in home currency, the stocked line's average cost matches spec 0012 (freight stays on stock); a 1 unit row keeps its serial → AC-6
- [ ] Refresh the browser during that receive, then open the order again → still exactly 2 assets (the sync fills in, never doubles) → AC-6
- [ ] Return line for a fixed asset on a purchase order → refused; cancel an order whose assets have entries → refused → AC-6
- [ ] Assets list: filters by class, status, location; pages at 50; a location limited user sees only their locations → AC-12
- [ ] Reports → Depreciation schedule, as of a date in 2026-27 → each row: opening + additions − depreciation − disposals = closing; a new asset shows opening 0 and its cost under additions; "Closed through" shows the latest closed month; CSV exports → AC-13
- [ ] Sign in as Warehouse → money shows Hidden, no Add, Close, Reopen, dispose or class controls → AC-14

## Value sourcing checks
- [ ] Company time zone Asia/Dhaka, receive at 23:30 UTC on 31 Oct → in service 1 Nov → receipt day uses `Company.timeZone`
- [ ] Purchase order in USD with exchange rate 0.0083 → asset cost is the BDT amount → cost uses the order's `exchangeRate`
- [ ] Line discount 10% → asset cost is after the discount → cost uses `discounted(unitPrice)`
- [ ] Asset in its second income year → base equals last June's WDV after → year base from the previous year's last counted entry

## Acceptance-criteria coverage
- AC-1 setup · AC-2 prompt · AC-3 locks · AC-4 rate edit + check · AC-5 product type · AC-6 receive, refresh, return, value sourcing · AC-7 add asset + check · AC-8 close + check · AC-9 close, race, resume · AC-10 reopen · AC-11 sell + check · AC-12 list · AC-13 report + check · AC-14 roles + deploy
