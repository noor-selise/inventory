# 0026 · Stock posting with compare and set (closes D1)

**Status**: Assumed
**Date**: 2026-10-19
**Authorized by**: the engineer, during /develop ("6 to 10 properly"), choosing Option 1 for D1 after the probe below

## Owed decision
D1 in spec 0002: how stock changes are written safely on Blocks, which has no multi record transactions (L1) and no documented atomic increment (L2). It blocks specs 0007, 0008 and 0009.

## Evidence (probe run on project Dfe830076882d4e28a313347efed8fbbe, 2026-10-19)
A scratch `NumberingRule` record, updated through `blocksClient.data.graphql` `update<Schema>(filter, input)`:
- Filter that no longer matches: 0 records changed, value untouched.
- Filter that matches: 1 record changed.
- 10 identical updates fired at the same moment, each expecting the same old value: exactly 1 changed the record, 9 changed nothing.
- A filter condition (`{"nextNumber": {"$gte": 3}}`) applies only when true; `$regex` works in list filters.
So L10 holds: a filtered update is an atomic compare and set on one record, and conditions like "on hand stays at or above zero" can sit inside the filter.

Later the same day, during the build:
- A filtered update changes only the **first** matching record, never all of them. Bulk edits need one call per record. This is also what keeps compare and set safe.
- A unique index clash comes back as "A record with the same value for 'x' already exists." (not a Mongo E11000 message).
- `scripts/checks/posting-live.mjs` against the real posting step: 10 in stock, 12 takes of 1 fired at once, 10 posted, 2 refused for stock, 0 other errors, on hand ended at exactly 0. Retrying a posted line changed nothing; a serial could not be taken in twice.

## Assumption built on (Option 1)
- `InventoryBalance` has one row per (product, location, bin, lot, serial), a unique index on that key, and a `version` Int.
- Posting one line:
  1. Insert an `InventoryMovement` with `status: pending` and a unique `postingKey` (`sourceType:sourceId:sourceLineId`), so a retry never counts twice.
  2. Read the balance (create it with on hand 0 if missing; a duplicate on create means someone else made it, read again).
  3. Check the read on hand covers the line (unless negatives are allowed), then update the balance with filter `{ItemId, version}`, setting `onHand + delta`, `version + 1`, and adding the posting key to `appliedKeys` (last 50 kept). The version filter makes the check and the write one atomic step.
  4. 0 records changed means someone else got there first: wait a short random time that grows each try, read again and retry, up to 10 times, then fail with `conflict_retry_exhausted`. If the fresh read shows not enough stock, fail with `insufficient_stock`.
  5. Mark the movement `posted`.
- Repair: a movement still `pending` after 2 minutes is checked against its balance. If the balance's `appliedKeys` holds its posting key, it is marked `posted`; if not, the balance never changed and it is marked `failed`. The repair runs whenever someone opens the stock screens or posts stock. A schedule workflow that runs it without anyone signed in is a follow up.
- A document with several lines posts line by line. If a line fails, the lines already posted are reversed with new movements, so the document posts all or nothing in effect.
- Serials: balance rows for a serial must stay 0 or 1 (the filter checks `onHand <= 0` before adding one).
- Moving average cost: `Product.costVersion` Int guards `averageCost` the same way (compare and set), used when receipts land (spec 0012).
- Negative stock: refused unless the user is an Admin or Manager and confirms (stands in for the "override" right until permissions are finer).
- Movements are never edited after `posted` or deleted by the app. The server still allows edits (it must, to flip `pending` to `posted`); L4 applies.

## Code area
`src/features/stock/posting.ts` (shared, no app imports, runs in Node too), `src/features/stock/`, `blocks/data/schemas/InventoryMovement.json`, `InventoryBalance.json`.

## Requirements
Spec 0007 AC-1 to AC-5, AC-10 fully; AC-6 for on hand, picked and in transit (reserved and on order arrive with specs 0011 and 0012); AC-7 as a function used by receiving; AC-9 for one product from its movement history.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect stock ledger and quantities`
to deliberate and ratify it, and update spec 0002 D1 and spec 0007 to point here. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
