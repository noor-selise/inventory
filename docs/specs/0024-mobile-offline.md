# 0024. Mobile web app and offline scanning

**Date**: 2026-10-18
**Status**: Proposed

## Summary

Warehouse staff pick, receive, count, and scan on phones and rugged scanners, sometimes without signal. The PRD chose a web app you install on the phone (a PWA), not native apps. This is mostly a frontend job; Blocks only matters for login and saving. Login on a phone works with Blocks hosted login. Saving queued offline scans later is where conflicts appear, and resolving them safely depends on D1.

## Context

PRD §4.13 (web + PWA, no desktop client), NFR Mobile ("offline queue for scans and counts with conflict resolution"), NFR Accessibility (WCAG 2.2 AA). DESIGN.md §7 covers phone layouts.

## Requirements

**Acceptance criteria**:
- **AC-1**: The app installs on Android and iOS home screens and opens full screen.
- **AC-2**: Pick, receive, count, and stockroom screens work on a 360 px wide screen with large touch targets.
- **AC-3**: Camera scanning and hardware scanners (keyboard wedge) both find products by barcode.
- **AC-4**: With no signal, scans and counts queue on the device and send when back online, in order, without duplicates.
- **AC-5**: If the server changed in between (for example stock ran out), the user sees each conflict and decides.
- **AC-6**: Login survives on the device (refresh token) so workers are not signed out mid shift.

## Options considered

### Option 1: PWA with an offline queue in IndexedDB, each queued action carrying an idempotency key
**Pros**: one codebase; no app store. **Cons**: iOS limits background sync.

### Option 2: Native apps
**Pros**: better scanner and background support. **Cons**: the PRD rules it out; two more codebases.

## Decision

**Chosen option**: Option 1.

**Implementation skills**: `blocks-iam-sso-oidc-implementation` (token refresh), `blocks-data-gateway-crud`.

## Rationale

The PRD picks web + PWA. Idempotency keys (spec 0007 `postingKey`) make replaying a queue safe once posting is safe.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| §4.13 | Installable web app | Frontend only; Blocks release hosts it | ✅ Can do |
| AC-6 | Stay signed in | Refresh token (remember me 7 days in project config) | ✅ Can do |
| NFR | Offline queue, replay | Browser storage + idempotency keys | ✅ Can do on the device |
| NFR | Conflict resolution | Replay against posting step | ⚠️ Depends on D1 |
| §4.13 | Bluetooth printers, rugged scanners | Device and browser features | ⚠️ Outside Blocks; Web Bluetooth not on iOS |

## Feature design

**Data model sketch**: device only queue `pendingActions` {`id` (idempotency key), `type`, `payload`, `createdAt`, `status`, `conflict`}. No new Blocks schemas.

**API surface**: the same actions as specs 0008, 0011, 0012, 0021, replayed in order.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Replay | idempotency key | queued action id → `postingKey` |
| Conflict | reason | posting error (`insufficient_stock`, `already_completed`) |

**Key invariants**: a queued action applies at most once.

**Security model**: same permissions as the desktop screens.

**Critical test scenarios**:
- Happy path: count 20 items offline, reconnect, all 20 saved once, verifies **AC-4**
- Failure case: an offline pick of the last unit conflicts with a desktop pick; the worker sees it, verifies **AC-5**
- Session: the app still works after 8 hours, verifies **AC-6**

## Build plan

1. PWA manifest, install, responsive layouts, satisfies **AC-1**, **AC-2**
2. Camera and wedge scanning, satisfies **AC-3**
3. Long lived session, satisfies **AC-6**
4. Offline queue with idempotent replay and conflict screen (after D1), satisfies **AC-4**, **AC-5**

## Consequences

**Positive**: one codebase for desktop and phone.
**Negative / tradeoffs**: iOS limits (no Web Bluetooth, weaker background sync).
**Neutral**: most of this is frontend work.
