# 0023. Plans, limits and feature flags

**Date**: 2026-10-18
**Status**: Proposed

## Summary

Each company has a plan (free, then paid tiers) with limits (seats, locations, products, orders a month, integrations) and feature switches (manufacturing, lots, serials, portal, API, advanced rights). Blocks has no billing or subscription service in its skills, so plans are your own records and the app checks them. Payment collection needs an outside billing provider called from workflows.

## Context

PRD §6 (packaging, the free tier, "entitlement system must support plan limits and feature flags per subscription"), INV-1 (plan gated locations).

## Requirements

**Acceptance criteria**:
- **AC-1**: Each company has one plan with limits and feature flags.
- **AC-2**: Creating a seat, location, product, or order past the limit is refused with a clear message.
- **AC-3**: Features off in the plan are hidden and refused.
- **AC-4**: A 14 day trial starts on signup without a card.
- **AC-5**: Upgrades take effect at once; downgrades at the next cycle.
- **AC-6**: Payments are collected by a billing provider and the plan updates from its events.

## Options considered

### Option 1: `Plan` and `Subscription` records, checks in app, billing provider via webhook workflow
**Pros**: no backend. **Cons**: checks can be bypassed (L4); counts need reading rows (L3).

### Option 2: Billing provider as the source of truth, read on each check
**Pros**: always current. **Cons**: slow; outside call on every create.

## Decision

**Chosen option**: Option 1, with usage counters (`Subscription.usage`) kept by data trigger workflows and rebuilt nightly.

**Implementation skills**: `blocks-data-gateway-crud`, `blocks-workflow`, `blocks-iam-access-control`, `blocks-secrets`.

## Rationale

There is no Blocks billing service (L8). Your own records plus a provider webhook is the standard pattern. Counters avoid counting rows on every create.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| §6 | Plan limits | `Subscription` + app checks | ⚠️ App only (L4); counters can race (L2) |
| §6 | Feature flags | Plan flags + FrontendAction and Endpoint permissions per plan role | ⚠️ Per company permission changes need admin role edits |
| §6 | Trial, upgrade, downgrade | `Subscription` dates + schedule workflow | ✅ Can do |
| §6 | Collect payments | Webhook workflow from a billing provider | ⚠️ Possible, unproven |
| SEC-1 | Seat count | Count Blocks users per organization | ⚠️ Needs counter |

## Feature design

**Data model sketch**:
- `Plan` (project wide, not per company): `key`, `name`, `limits` String (JSON: seats, locations, products, ordersPerMonth, integrations), `features` String array.
- `Subscription`: `planKey`, `status` (`trial`, `active`, `past_due`, `cancelled`), `trialEndsAt`, `currentPeriodEnd`, `pendingPlanKey`, `usage` String (JSON counters), `billingCustomerId`.

**API surface**: `canCreate(entity)` and `hasFeature(key)` in the app; workflows `billing-events` (webhook), `usage-recount` (nightly), `trial-expiry` (daily).

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Check limit | usage | `Subscription.usage` counters |
| Check limit | limit | `Plan.limits` |
| Plan change | new plan | billing provider event |

**Key invariants**: one subscription per organization.

**Security model**: only Admin sees billing; plan records editable only by the project owner.

**Configuration required**:
- Billing provider API key and webhook secret: Blocks secrets.

**Critical test scenarios**:
- Happy path: free company adds its 100th product, the 101st is refused, verifies **AC-2**
- Failure case: trial ends and the company drops to free limits, verifies **AC-4**
- Feature: manufacturing hidden on a plan without it, verifies **AC-3**

## Build plan

1. `Plan` and `Subscription` schemas, satisfies **AC-1**
2. Limit and feature checks across create screens, satisfies **AC-2**, **AC-3**
3. Trial and plan change workflows, satisfies **AC-4**, **AC-5**
4. Billing provider webhook, satisfies **AC-6**

## Consequences

**Positive**: pricing can change without code.
**Negative / tradeoffs**: limits are not enforced on the server.
**Neutral**: picking the billing provider is a later decision.

## Follow-up

- [ ] Choose the billing provider.
