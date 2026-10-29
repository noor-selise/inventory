# Role: Production

> "Manufacture orders and timesheets" (`src/features/team/roles.ts`)

## Who this is

Workers who assemble or make products from parts (bill of materials). This role exists so the team model is ready, but **manufacturing is not built yet** (spec 0020, planned for v1.1). Say this plainly if asked.

## Screens (sidebar) today

| Section | Items |
|---|---|
| (top) | Dashboard |
| Inventory | Products (view only), Stock |
| Reports | Reports |
| Settings | Security, Appearance |

## Can and can't today

| Area | Production |
|---|---|
| View products and stock levels | ✅ |
| Reports | ✅ (no cost columns) |
| Edit anything | ❌ No edit rights in any list in `roles.ts` |
| See cost | ❌ |
| Location limits | Can be set like any non-admin |

## What is planned (spec 0020)

- Manufacture orders: take parts out of stock, put finished goods in, in one document.
- Bills of materials: a product made of other products, multi-level.
- Reordering method "manufacture" is already saveable on a reorder setting, but drafting manufacture orders waits for this spec (spec 0027).
- Timesheets.

## Day to day today

Look up what is in stock and where, so they know what parts are available. Everything else happens outside the app for now.
