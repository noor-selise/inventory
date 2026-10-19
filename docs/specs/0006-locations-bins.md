# 0006. Locations and bins

**Date**: 2026-10-18
**Status**: In Progress

## Summary

Warehouses, stores, trucks, and sites (locations), each with bins (sublocations) like `A-03-2`. These are small records and fit Blocks fully. The plan limit on how many locations a company may have is checked in the app, because Blocks has no counting rule on the server.

## Context

PRD INV-1, INV-11, §9 item 3 (bins are first class records), DB design LOCATION and SUBLOCATION. Every stock feature points at a location.

## Requirements

**User stories**:
- As an owner, I want to set up my warehouses and trucks, with bins inside them.
- As a warehouse worker, I want the app to suggest the bin where a product already lives.

**Acceptance criteria**:
- **AC-1**: A location has a name (unique in the company), address, and an "is default" flag; exactly one is default.
- **AC-2**: A bin belongs to one location and has a code unique within that location.
- **AC-3**: Typing a new bin code during receiving or adjusting can create the bin on the fly.
- **AC-4**: Locations and bins are deactivated, never deleted, once stock or documents use them.
- **AC-5**: A company cannot create more locations than its plan allows (spec 0023).
- **AC-6**: When putting away or picking, the app suggests bins where the product already has stock or was last used. (P1)

## Options considered

### Option 1: `Location` and `Sublocation` schemas
**Pros**: unique index on (`locationId`, `code`); bin level reports. **Cons**: one more schema.

### Option 2: Free text bin codes on stock rows (like the reference)
**Pros**: simplest. **Cons**: typos split stock; no bin reports (PRD §9 item 3 rejects it).

## Decision

**Chosen option**: Option 1: two schemas, bins auto created from free text when allowed.

**Implementation skills**: `blocks-data-gateway-configuration`, `blocks-data-gateway-crud`.

## Rationale

The PRD makes bins first class records (§9 item 3), and the compound unique index stops duplicates on the server.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| INV-1 | Locations and bins | Schemas + compound unique index | ✅ Can do |
| INV-1 | Plan gated count | App check before create | ⚠️ App only (L3, L4); could be bypassed |
| INV-11 | Suggested bins | Query balances by product (spec 0007) | ✅ Can do |
| §5.6 | One default | App rule | ⚠️ Not atomic (L1), low risk |

## Feature design

**Data model sketch**:
- `Location`: `name` req (unique), `address`, `kind` String (`warehouse`, `store`, `truck`, `site`), `isDefault` Boolean, `isActive` Boolean.
- `Sublocation`: `locationId` ID req, `code` req (unique with `locationId`), `isActive` Boolean.

**API surface**: `data.collection("Location")` and `("Sublocation")` CRUD; bin suggestion = query `InventoryBalance` by product, sorted by quantity.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Create location | allowed? | plan limit (spec 0023) vs count of `Location` rows |
| Suggest bin | bins | `InventoryBalance` rows for the product and location |

**Key invariants**: one default location; bin code unique per location.

**Security model**: Settings Edit to manage; everyone signed in reads. Location restricted users (spec 0003 AC-8) only see their locations.

**Critical test scenarios**:
- Happy path: create a warehouse with three bins, verifies **AC-1**, **AC-2**
- Failure case: duplicate bin code in the same location is rejected, verifies **AC-2**
- Auth/permission: Warehouse user cannot create a location (403), verifies **AC-1**

## Build plan

- [x] 1. Push both schemas with unique indexes, satisfies **AC-1**, **AC-2**
- [x] 2. Location and bin screens with deactivate, satisfies **AC-1**, **AC-2**, **AC-4**
- [x] 3. Inline bin creation in stock forms, satisfies **AC-3** (on adjustment, transfer and count lines)
- [ ] 4. Plan limit check, satisfies **AC-5** (waits for plans, spec 0023)
- [ ] 5. P1: bin suggestions, satisfies **AC-6** (P1, not built)

## Consequences

**Positive**: simple, fully supported.
**Negative / tradeoffs**: plan limit enforced in app only.
**Neutral**: bin suggestions depend on spec 0007's balance rows.
