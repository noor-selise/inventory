# Scope: Cloud Inventory & Order Management (bootstrap)

A cloud inventory and order management web app for small businesses (see `docs/01-business-prd.md`). The backend is SELISE Blocks only (spec 0002). Features 1 and 2 are the bootstrap; features 3 to 24 split the PRD and DB design into buildable pieces, each with a drafted spec and a **Blocks fit** line (✅ can do, ⚠️ can do with a workaround or unverified, ❌ cannot on Blocks alone).

**Build approach:** Tracer Bullet (each feature built end to end and working before the next).
**Workflow:** Alpha (after `/develop`, run `/check verify` on the real app). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· GA`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & scaffold | Foundation | in-progress |
| 2 | Design system integration | Foundation | in-progress |
| 3 | Sign in, team and roles | Foundation | in-progress |
| 4 | Company settings and lookups | Foundation | in-progress |
| 5 | Product catalog | MVP | in-progress |
| 6 | Locations and bins | MVP | in-progress |
| 7 | Stock ledger and quantities | MVP | in-progress |
| 8 | Stock adjustments, transfers and counts | MVP | in-progress |
| 9 | Lots, serials and traceability | v1.1 | in-progress |
| 10 | Customers, vendors and pricing | MVP | in-progress |
| 11 | Sales orders and fulfillment | MVP | in-progress |
| 12 | Purchasing and receiving | MVP | in-progress |
| 13 | Payments and balances | MVP | in-progress |
| 14 | Reordering and alerts | MVP | in-progress |
| 15 | Reports and dashboards | MVP | in-progress |
| 16 | Documents and email | MVP | planned |
| 17 | CSV import and export | MVP | planned |
| 18 | Accounting, ecommerce and shipping | MVP | planned |
| 19 | Public API and webhooks | Later | planned |
| 20 | Manufacturing | v1.1 | planned |
| 21 | Stockroom scanning | v1.1 | planned |
| 22 | B2B portal | v1.1 | planned |
| 23 | Plans and entitlements | v1.1 | planned |
| 24 | Mobile and offline | MVP | planned |
| 25 | Asset depreciation (per organization) | v1.1 | in-progress |

## Foundations

### 1. Stack & scaffold · in-progress
A runnable React + TypeScript project with Tailwind CSS and shadcn/ui set up, every package on its latest stable version. Nothing beyond the runnable skeleton.
**Done when:** the dev server boots, the production build and typecheck pass, and shadcn's CLI can add a component into the project.
- [x] Decide the stack (spec): `/architect stack & scaffold`
- [x] Scaffold from the decision: `/develop stack & scaffold`
- [x] Verify it: `/check verify stack & scaffold` (2026-10-20: dev server answers, typecheck and build pass, shadcn add works)
Spec [0001](../specs/0001-stack-scaffold.md) · code in `./` (`src/`, `package.json`, `vite.config.ts`)

### 2. Design system integration · in-progress · assumed decision (spec 0025)
Wire `docs/DESIGN.md` into the scaffold: color tokens (dark default plus light), radius scale, DM Sans and JetBrains Mono, dark / light / system theme switching that persists, the reduced motion rule, and the custom Button variants. Other components are added later, when a feature needs them.
**Done when:** the app opens in dark by default and can switch to light or system, every token from DESIGN.md §2 and §4 is usable as a utility class (for example `bg-primary`, `text-destructive-text`), fonts load, and the Button renders all its variants and sizes with near black text on green.
- [ ] Design it (spec): `/architect design system integration` (built on an assumed spec, ratify it)
- [x] Build it: `/develop design system integration`
  - [x] Tokens, fonts and dark default theme with light and system
  - [x] Button and Badge variants from DESIGN.md
- [ ] Verify it: `/check verify design system integration`
Spec [0025](../specs/0025-design-system-integration.md) (Assumed) · code in `src/index.css`, `src/components/ui/`, `src/components/theme-provider.tsx`

### 3. Sign in, team and roles · in-progress
Blocks hosted login, MFA, one company per organization, seven role bundles, cost hidden from people without cost access.
**Done when:** a user signs in over HTTPS, belongs to one company, and sees only what their role allows (spec 0003 AC-1 to AC-7).
**Blocks fit:** ✅ mostly; location limits and approval limit partly app side.
- [x] Design it (spec): [0003](../specs/0003-auth-team-roles/index.md)
- [ ] Build it: `/develop sign in, team and roles`
  - [x] App side: SDK client, hosted login, callback, guards, local HTTPS, team screen, last changed by
  - [x] Blocks side: OIDC client, OIDC on, seven roles, admin user
  - [x] Multi organization mode on; your company stays in Blocks' "default" organization, organization card and switcher on Company settings (assumed decision spec 0027)
  - [x] Two step login: tenant MFA on (authenticator app, email code, backup codes), Security screen to enroll, company rule for admins
  - [ ] Cost masking on the server: a column policy masks a field for everyone whatever its rules say (allow or deny, always true or false; sources 0 to 2, operators 0 to 14 accepted). Waits on Blocks for how a rule or DataProtection permission unmasks a field for some roles
- [ ] Verify it: `/check verify sign in, team and roles`
Spec [0003](../specs/0003-auth-team-roles/index.md) · [0027](../specs/0027-orders-reports-p1-choices.md) (Assumed) · code in `src/lib/blocks/`, `src/app/`, `src/features/auth/`, `src/features/team/`, `scripts/blocks-setup.sh`

### 4. Company settings and lookups · in-progress
Company profile, currencies and rates, document numbering, payment terms, taxing schemes, reasons, carriers, payment methods.
**Done when:** every lookup list is editable and new documents get unique running numbers (spec 0004).
**Blocks fit:** ✅; numbering needs a retry loop.
- [x] Design it (spec): [0004](../specs/0004-company-settings-lookups.md)
- [x] Build it: `/develop company settings and lookups`
  - [x] Schemas live in Blocks
  - [x] Company, currencies and rates, numbering (compare and set), lists and taxes screens
- [ ] Verify it: `/check verify company settings and lookups`
Spec [0004](../specs/0004-company-settings-lookups.md) · code in `src/features/settings/`, `blocks/data/schemas/`

## MVP
The first sellable release (PRD §8 P0). Items marked ❌ or ⚠️ in Blocks fit wait on decision D1 in spec 0002.

### 5. Product catalog · in-progress
Products, categories, barcodes, units, tracking flags, vendor items, images; variants and custom fields later.
**Done when:** products save with unique name, SKU, and barcodes, and a scan finds the product (spec 0005).
**Blocks fit:** ✅.
- [x] Design it (spec): [0005](../specs/0005-product-catalog.md)
- [ ] Build it: `/develop product catalog`
  - [x] Schemas and unique indexes live in Blocks
  - [x] Product list, search, form with type and tracking locks, units, barcodes and scan lookup, deactivate, vendor items
  - [ ] Images and P1 items
- [ ] Verify it: `/check verify product catalog`
Spec [0005](../specs/0005-product-catalog.md) · code in `src/features/products/`, `blocks/data/schemas/`

### 6. Locations and bins · in-progress
Warehouses, stores, trucks and their bins, with a default location.
**Done when:** locations and bins exist with unique codes and are deactivated, never deleted (spec 0006).
**Blocks fit:** ✅.
- [x] Design it (spec): [0006](../specs/0006-locations-bins.md)
- [ ] Build it: `/develop locations and bins`
  - [x] Schemas, unique indexes, locations and bins screen, bins created on the fly
  - [ ] Plan limit (spec 0023) and bin suggestions (P1)
- [ ] Verify it: `/check verify locations and bins`
Spec [0006](../specs/0006-locations-bins.md) · code in `src/features/locations/`

### 7. Stock ledger and quantities · in-progress · assumed decision (spec 0026)
The posting step every stock change uses: movement ledger, balances, quantities, moving average cost.
**Done when:** balances always equal the ledger and two people can never take the same last unit (spec 0007).
**Blocks fit:** ✅ with compare and set (D1 closed by assumed spec 0026, proven live).
- [ ] Design it (spec): [0007](../specs/0007-stock-ledger-quantities.md), D1 recorded in [0026](../specs/0026-stock-posting-compare-and-set.md) (Assumed), ratify it: `/architect stock ledger and quantities`
- [ ] Build it: `/develop stock ledger and quantities`
  - [x] Posting step with compare and set, retries, rollback, repair; ledger and balances live
  - [x] Stock screen: on hand, quantities per location, history with as of date
  - [ ] Monthly snapshot workflow, scheduled repair, deny edit and delete policies
- [ ] Verify it: `/check verify stock ledger and quantities`
Spec [0007](../specs/0007-stock-ledger-quantities.md) · [0026](../specs/0026-stock-posting-compare-and-set.md) · code in `src/features/stock/posting.ts`, `src/features/stock/StockPage.tsx`, `scripts/checks/posting-live.mjs`

### 8. Stock adjustments, transfers and counts · in-progress
Adjust with reasons, transfer between locations with in transit, run counts with sheets and review.
**Done when:** each document saves atomically and posts its stock through spec 0007 (spec 0008).
**Blocks fit:** ✅ documents and stock (through spec 0026 posting).
- [x] Design it (spec): [0008](../specs/0008-stock-adjustments-transfers-counts.md)
- [ ] Build it: `/develop stock adjustments, transfers and counts`
  - [x] Adjustments with cancel and retry, transfers with in transit, counts with sheets and review
  - [ ] Transfer approval (optional) and cost adjustments (P1)
- [ ] Verify it: `/check verify stock adjustments, transfers and counts`
Spec [0008](../specs/0008-stock-adjustments-transfers-counts.md) · code in `src/features/stock/`, `scripts/checks/stock-docs-live.mjs`

### 10. Customers, vendors and pricing · in-progress
Customers and vendors with defaults, pricing schemes, price breaks, one shared price and tax calculation.
**Done when:** an order line gets the right price and tax for its customer and quantity (spec 0010).
**Blocks fit:** ✅; prices checked in app only.
- [x] Design it (spec): [0010](../specs/0010-customers-vendors-pricing.md)
- [x] Build it: `/develop customers, vendors and pricing`
  - [x] Customers and vendors with contacts, addresses and defaults
  - [x] Price lists with fixed or markup prices and quantity breaks; shared price and tax module with checks
- [ ] Verify it: `/check verify customers, vendors and pricing`
Spec [0010](../specs/0010-customers-vendors-pricing.md) · code in `src/features/partners/`, `src/features/pricing/`, `scripts/checks/pricing.mjs`

### 11. Sales orders and fulfillment · in-progress
Quote to order, pick, pack, ship, returns, back orders, quick actions, derived statuses, profit.
**Done when:** an order goes quote to fulfilled with partial shipments and correct statuses (spec 0011).
**Blocks fit:** ✅ documents; ⚠️ fulfillment waits on D1.
- [ ] Design it (spec): [0011](../specs/0011-sales-orders-fulfillment.md), built to the draft; confirm it: `/architect sales orders and fulfillment`
- [x] Build it: `/develop sales orders and fulfillment`
  - [x] Quote to order, pick, pack, ship, returns and restock, back orders, quick actions, derived statuses, profit, cancel
  - [x] Credit limit gate with confirm, sales rep restriction, fulfillment queue by priority, picking sessions (P1, assumed decision spec 0027)
- [ ] Verify it: `/check verify sales orders and fulfillment`
Spec [0011](../specs/0011-sales-orders-fulfillment.md) · code in `src/features/sales/`, `scripts/checks/orders-live.mjs`

### 12. Purchasing and receiving · in-progress
Quote to PO, approval limits, partial receiving with lots and serials, returns, landed cost.
**Done when:** a PO is received in parts and landed cost feeds product cost (spec 0012).
**Blocks fit:** ✅ documents; ⚠️ receiving waits on D1.
- [ ] Design it (spec): [0012](../specs/0012-purchasing-receiving.md), built to the draft; confirm it: `/architect purchasing and receiving`
- [x] Build it: `/develop purchasing and receiving`
  - [x] Quote to PO, partial receiving with bins, lots and serials, returns, landed cost into average cost
  - [x] Approval limits, last vendor and vendor price list update (P1, assumed decision spec 0027)
- [ ] Verify it: `/check verify purchasing and receiving`
Spec [0012](../specs/0012-purchasing-receiving.md) · code in `src/features/purchasing/`

### 13. Payments and balances · in-progress
Customer and vendor payments split across orders, credits, balances per currency, aging.
**Done when:** a payment saves with its splits at once and balances update (spec 0013).
**Blocks fit:** ✅; balances can lag seconds.
- [ ] Design it (spec): [0013](../specs/0013-payments-balances.md), built to the draft; confirm it: `/architect payments and balances`
- [x] Build it: `/develop payments and balances`
  - [x] Payments split over orders in one save, saved twice records once, voids, store credit, balances per currency, aging
  - [x] Order paid amounts and balances updated in the app after each payment, with Recompute (you chose the app over a workflow; a server workflow can come once Blocks confirms workflow sign in)
- [ ] Verify it: `/check verify payments and balances`
Spec [0013](../specs/0013-payments-balances.md) · code in `src/features/payments/`, `blocks/workflows/`

### 14. Reordering and alerts · in-progress
Reorder settings, nightly reorder list, one click drafts, low stock alerts.
**Done when:** products below their reorder point are listed, alerted once, and drafted in one click (spec 0014).
**Blocks fit:** ✅; list as good as spec 0007.
- [ ] Design it (spec): [0014](../specs/0014-reordering-alerts.md), built to the draft; confirm it: `/architect reordering and alerts`
- [x] Build it: `/develop reordering and alerts`
  - [x] Reorder settings, reorder list with Check now, alert once per drop, one click POs and transfers, low stock card
  - [x] Once a day reorder check in the app, alert email (template `low-stock-alert`), suggested reorder point (P1, assumed decision spec 0027)
- [ ] Verify it: `/check verify reordering and alerts`
Spec [0014](../specs/0014-reordering-alerts.md) · code in `src/features/reorder/`, `blocks/workflows/`

### 15. Reports and dashboards · in-progress
Core 20 reports, filters, exports, saved reports; background reports and dashboard later.
**Done when:** the core 20 reports match the data and hide cost from users without access (spec 0015).
**Blocks fit:** ⚠️ no server sums; nightly summaries.
- [ ] Design it (spec): [0015](../specs/0015-reports-dashboards.md), built to the draft; confirm it: `/architect reports and dashboards`
- [x] Build it: `/develop reports and dashboards`
  - [x] Core 20 reports with filters, group by, columns, CSV, print to PDF, saved reports, cost hidden by role
  - [x] Dashboard widgets per person (P1, assumed decision spec 0027)
  - [ ] Background reports: deferred until a server runner exists (`docs/designs/instant-report-export.md`)
- [ ] Verify it: `/check verify reports and dashboards`
Spec [0015](../specs/0015-reports-dashboards.md) · code in `src/features/reports/`

### 16. Documents and email · needs a decision
Invoice, quote, PO, pick list, packing slip PDFs and emailing them from templates.
**Done when:** an invoice PDF is made, stored, and emailed to the customer (spec 0016).
**Blocks fit:** ✅ email; ⚠️ PDFs made in browser.
- [ ] Design it (spec): drafted as [0016](../specs/0016-documents-email-templates.md) (Proposed), confirm it: `/architect documents and email`

### 17. CSV import and export · needs a decision
Guided CSV import with dry run and safe re runs; CSV export.
**Done when:** a CSV imports with a dry run, re runs never duplicate, lists export (spec 0017).
**Blocks fit:** ✅; opening stock waits on D1.
- [ ] Design it (spec): drafted as [0017](../specs/0017-csv-import-export.md) (Proposed), confirm it: `/architect csv import and export`

### 18. Accounting, ecommerce and shipping · needs a decision
QuickBooks sync with retries and error inbox, Shopify orders in and stock out, shipping labels later.
**Done when:** a company connects QuickBooks and Shopify and syncs reliably (spec 0018).
**Blocks fit:** ⚠️ per company OAuth on workflows unproven.
- [ ] Design it (spec): drafted as [0018](../specs/0018-accounting-ecommerce-shipping.md) (Proposed), confirm it: `/architect accounting, ecommerce and shipping`

### 24. Mobile and offline · needs a decision
Installable web app for warehouse phones, scanning, offline queue with safe replay.
**Done when:** offline scans replay once each and conflicts are shown (spec 0024).
**Blocks fit:** ✅ device side; ⚠️ conflicts wait on D1.
- [ ] Design it (spec): drafted as [0024](../specs/0024-mobile-offline.md) (Proposed), confirm it: `/architect mobile and offline`

## v1.1
PRD §8 P1.

### 9. Lots, serials and traceability · in-progress
Lots with expiry, serials, first expiry first out, expiry alerts, forward and backward trace.
**Done when:** tracked products need lots or serials and any lot traces to its customers and PO (spec 0009).
**Blocks fit:** ✅; serial 0 or 1 enforced by posting (spec 0026).
- [x] Design it (spec): [0009](../specs/0009-lots-serials-traceability.md)
- [ ] Build it: `/develop lots, serials and traceability`
  - [x] Lots with expiry, lot and serial capture on stock documents, earliest expiry first, trace screen
  - [x] Lot and serial capture on receiving and picking (built with features 11 and 12)
  - [ ] Expiry alert (no workflow yet)
- [ ] Verify it: `/check verify lots, serials and traceability`
Spec [0009](../specs/0009-lots-serials-traceability.md) · code in `src/features/stock/LotsPage.tsx`, `src/features/stock/api.ts`

### 20. Manufacturing · needs a decision
Multi level BOMs, manufacture orders, operations, timesheets, buildable quantity.
**Done when:** an MO picks parts, logs time, completes with the right finished cost (spec 0020).
**Blocks fit:** ✅ documents; ⚠️ stock waits on D1.
- [ ] Design it (spec): drafted as [0020](../specs/0020-manufacturing.md) (Proposed), confirm it: `/architect manufacturing`

### 21. Stockroom scanning · needs a decision
PIN based scan only users on shared devices, admin defined scan workflows.
**Done when:** each scan saves as an adjustment or transfer attributed to the person (spec 0021).
**Blocks fit:** ⚠️ identity per scan app level; stock waits on D1.
- [ ] Design it (spec): drafted as [0021](../specs/0021-stockroom-scanning.md) (Proposed), confirm it: `/architect stockroom scanning`

### 22. B2B portal · needs a decision
Buyer logins, per portal catalog and prices, checkout to sales order.
**Done when:** a buyer orders in their portal and sees only their own orders (spec 0022).
**Blocks fit:** ⚠️ row policies unverified; custom domains manual.
- [ ] Design it (spec): drafted as [0022](../specs/0022-b2b-portal.md) (Proposed), confirm it: `/architect b2b portal`

### 23. Plans and entitlements · needs a decision
Plans with limits and feature flags, trial, billing provider events.
**Done when:** limits and features follow each company plan (spec 0023).
**Blocks fit:** ⚠️ no billing on Blocks; checks app side.
- [ ] Design it (spec): drafted as [0023](../specs/0023-plans-entitlements.md) (Proposed), confirm it: `/architect plans and entitlements`

### 25. Asset depreciation (per organization) · in-progress · Beta
A fixed asset product type. Each owned unit is its own asset and depreciates monthly on written down value (WDV). Each organization picks its country; Bangladesh seeds standard classes and rates (Third Schedule basis, to confirm against the Income Tax Act 2023) as that organization's own copy.
**Done when:** an organization set to Bangladesh gets the ten standard classes, each received or hand entered asset shows a correct WDV schedule per income year, closed months never change, one organization's edits never change another's, and sale stock keeps its average cost untouched.
**Blocks fit:** ✅ schemas, unique indexes, compare and set on the company record for close and reopen; ⚠️ row policies and per organization unique keys unverified, close runs in the browser.
- [x] Design it (spec): [0028](../specs/0028-asset-depreciation/index.md) (revised after the EGM review)
- [ ] Build it: `/develop asset depreciation`
  - [ ] Data, rules and the first close: schemas, Bangladesh setup, hand entered assets, close a month, asset detail (AC-1, AC-2, AC-7, AC-8, AC-9, AC-14, part of AC-12). Code done; the Blocks deploy needs one more run (security, indexes, reload)
  - [x] Classes, reopen and disposal (AC-3, AC-4, AC-10, AC-11)
  - [x] Receiving and sales exclusion (AC-5, AC-6)
  - [x] Assets list and depreciation schedule report (AC-12, AC-13)
- [ ] Verify it: `/check verify asset depreciation`
- [ ] Test it: `/test asset depreciation`
Spec [0028](../specs/0028-asset-depreciation/index.md) · code in `src/features/depreciation/`, `src/features/purchasing/actions.ts`, `blocks/data/schemas/`, `scripts/checks/depreciation.mjs`

## Later

### 19. Public API and webhooks · needs a decision
Outgoing signed webhooks now; public REST API, MCP, Zapier moved later.
**Done when:** subscribers get signed event webhooks (spec 0019).
**Blocks fit:** ❌ public API not possible as specified; webhooks ✅.
- [ ] Design it (spec): drafted as [0019](../specs/0019-public-api-webhooks-mcp.md) (Proposed), confirm it: `/architect public api and webhooks`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Backend, database and auth**: decided, SELISE Blocks only, see [0002](../specs/0002-blocks-backend-platform.md) (Proposed). Open inside it: **D1 stock posting strategy**, waiting on the Blocks team's answer about transactions.
- **Depreciation extras** (follow up to feature 25): accelerated 60/40 for plant in manufacturing, tourism or sports outside Dhaka and Chittagong, higher initial allowances for new buildings and machinery, reconditioned imported vehicle rates by age (10/20/30/35%) · needs a decision
- **Depreciation later items** (from spec 0028): a yearly tax view (full year in, none out) beside the monthly schedule, returning fixed assets to the vendor, CSV import of opening assets (with feature 17), month close as a server workflow once workflows can sign in
- **Routing**: decide when the second screen arrives · needs a decision · from spec 0001

## Legend

**The decision box.** Every feature carries exactly one, the sub-task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & scaffold), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow-up enrolled |
| `in-progress` (building) | `/develop` | milestone sub-boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier's last stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop`. The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre-workflow) and `dropped` (de-scoped, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag = inherits it.
- **Workflow tier tag** beside a heading (e.g. `· GA`, `· Prototype`) sets that one feature's rigor above or below the project default; no tag inherits the default.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing (trust develop's own build time self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
