# 0021. Stockroom scanning

**Date**: 2026-10-18
**Status**: Proposed

## Summary

Unlimited scan only users (name plus a 4 digit PIN) who scan items out to a job or back in, using workflows an admin sets up ("Check out to job", "Transfer to truck"). Each scan becomes an adjustment or transfer tied to that person. The setup screens fit Blocks. Two things do not fit cleanly: Blocks users are full accounts (so "unlimited free scan users" needs a shared device login plus PIN records), and every scan is a stock posting that waits on D1.

## Context

PRD §4.7 (STK-1 to STK-4), persona "Stockroom user: PIN identified, no web seat". P1.

## Requirements

**Acceptance criteria**:
- **AC-1**: An admin adds stockroom users with a name and optional 4 digit PIN; they do not use a paid seat.
- **AC-2**: An admin defines stockroom workflows mapping to an adjustment or transfer, with required fields (job number, site id).
- **AC-3**: On a shared device, a user picks their name, enters the PIN, scans items, and each scan saves as an adjustment or transfer attributed to them.
- **AC-4**: Reports show who took what and scans in the last 30 days; low stock alerts work as in spec 0014.

## Options considered

### Option 1: One Blocks user per stockroom device; stockroom people as `StockroomUser` records with hashed PINs
**Pros**: no seat per person; works today. **Cons**: the server only knows the device account; attribution is a field the app fills.

### Option 2: A Blocks user per stockroom person
**Pros**: real identity on the server. **Cons**: every person is a full account, which breaks the "unlimited, no seat" promise.

## Decision

**Chosen option**: Option 1.

**Implementation skills**: `blocks-iam-users`, `blocks-iam-access-control`, `blocks-data-gateway-crud`.

## Rationale

The PRD says stockroom users have no web seat. A device account with a narrow "Stockroom scan" role plus PIN records matches that.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| STK-1 | Unlimited PIN users, no seat | Device account + `StockroomUser` (hashed PIN) | ⚠️ Can do; attribution is app level, PIN check in browser |
| STK-2 | Admin defined workflows | `StockroomWorkflow` schema | ✅ Can do |
| STK-3 | Scan as adjustment or transfer | Spec 0008 + 0007 | ⚠️ Blocked by D1 |
| STK-4 | Reports, alerts | Spec 0015, 0014 | ⚠️ Same limits as those |

## Feature design

**Data model sketch**:
- `StockroomUser`: `name` req, `pinHash` String, `isActive`.
- `StockroomWorkflow`: `name` req, `action` (`adjust_out`, `adjust_in`, `transfer`), `reasonId`, `toLocationId`, `requiredFields` String array.
- Adjustments and transfers get `stockroomUserId` and `customFields` (job number, site id).

**API surface**: device signs in once with the device account; app checks PIN against `pinHash`; scan creates a spec 0008 document.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Scan | who | selected `StockroomUser` after PIN check |
| Scan | product | barcode lookup (spec 0005) |

**Key invariants**: inactive stockroom users cannot scan.

**Security model**: device role has only "Stockroom scan" permissions; PIN hashes masked from everyone.

**Critical test scenarios**:
- Happy path: nurse picks name, PIN, scans 3 items to job 42, adjustment saved with her name, verifies **AC-3**
- Failure case: wrong PIN three times locks that name for 5 minutes, verifies **AC-3**
- Report: "who took what" lists her 3 items, verifies **AC-4**

## Build plan

1. Push `StockroomUser`, `StockroomWorkflow`; device role, satisfies **AC-1**, **AC-2**
2. Admin screens, satisfies **AC-1**, **AC-2**
3. Scan app flow (posting after D1), satisfies **AC-3**
4. Reports, satisfies **AC-4**

## Consequences

**Positive**: unlimited scan users without seats.
**Negative / tradeoffs**: identity per scan is app level, not server verified.
**Neutral**: depends on spec 0024 for the mobile app.
