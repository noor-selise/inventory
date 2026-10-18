# 0019. Public API, outgoing webhooks, MCP server and Zapier

**Date**: 2026-10-18
**Status**: Proposed

## Summary

The PRD wants your own customers to get a REST API with API keys, rate limits, and versioning, signed webhooks when records change, an MCP server for AI agents, and a Zapier app. **Blocks cannot provide this as specified.** It has no API key product for your customers, no rate limiting, and no signed outgoing webhooks. A reduced version is possible (OAuth client credentials per company, and webhooks sent by workflows), but it is a different product than the PRD describes. This spec recommends moving the public API out of the MVP.

## Context

PRD INT-6 (P0), INT-7 (P0), INT-8 (P1), INT-9 (P1), NFR API (versioned, rate limited, idempotent upserts), persona "Integrator/agent".

## Requirements

**Acceptance criteria**:
- **AC-1**: A company admin creates and revokes API keys scoped to their company.
- **AC-2**: The API offers JSON CRUD for core records with filter, sort, cursor paging (max 100), includes, and upsert by client id.
- **AC-3**: Requests are rate limited (about 60 a minute, burst 300) and versioned by date.
- **AC-4**: Edits fail if the record changed since read (row version).
- **AC-5**: Webhooks fire on created and updated events, are HMAC signed, and auto disable after repeated failures.
- **AC-6**: An MCP server exposes the same operations as AI agent tools. (P1)
- **AC-7**: A Zapier app with triggers and actions. (P1)

## Options considered

### Option 1: Defer the public API; build outgoing webhooks only
Outgoing webhooks from data trigger workflows, signed in a `code` node if crypto is available.

**Pros**: honest, cheap, covers "react to events". **Cons**: no inbound API in the MVP.

### Option 2: OAuth client credentials per company as "API keys"
Blocks supports the `client_credentials` grant (seen in `blocks auth config get`). Each company gets a client; integrators call the Blocks GraphQL gateway directly.

**Pros**: real server enforcement through Blocks permissions. **Cons**: exposes Blocks GraphQL, not your REST shape; no rate limits or versioning you control (no rate limit option in the CLI or skills); clients are created with `blocks auth client-credentials save --roles --permissions` (checked in CLI help), an admin action per company.

### Option 3: A small API service behind `logic proxy`
**Pros**: meets the PRD fully. **Cons**: a backend.

## Decision

**Chosen option**: Option 1 for the MVP: outgoing webhooks only, and move INT-6, INT-8, INT-9 to a later phase. Revisit Option 2 or 3 once D1 (spec 0002) is settled, since a posting service would make Option 3 cheap.

**Implementation skills**: `blocks-workflow`, `blocks-iam-sso-oidc-configuration` (client credentials, if Option 2 later).

## Rationale

Every part of INT-6 that matters (keys, limits, versions, row versions) is missing from Blocks (L5, L10). Shipping half of it would create a public contract you cannot keep.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| INT-6 | API keys per company | none (client credentials is the closest) | ❌ Not as specified |
| INT-6 | REST, cursor paging, includes, upsert | Blocks GraphQL (not REST) | ❌ Not as specified |
| INT-6 | Rate limits, date versions | none | ❌ Cannot |
| INT-6 | Row version concurrency | L10 | ⚠️ Unverified |
| INT-7 | Event webhooks | Data trigger workflow → `httpRequest` to subscriber | ✅ Can do |
| INT-7 | HMAC signing | `code` node | ⚠️ Crypto in the sandbox unverified |
| INT-7 | Auto disable after failures | `WebhookSubscription.failures` + `if` node | ✅ Can do |
| INT-8 | MCP server | none | ❌ Cannot on Blocks alone |
| INT-9 | Zapier | Zapier can call webhooks and receive them | ⚠️ Possible with outgoing webhooks + Option 2 |

## Feature design

**Data model sketch**:
- `WebhookSubscription`: `url` req, `events` String array, `secret` (masked), `isActive`, `failures` Int, `lastError`.
- `WebhookDelivery`: `subscriptionId`, `event`, `entityId`, `status`, `attempts`, `responseCode`.

**API surface**: one data trigger workflow per entity and event → `code` (build payload, sign) → `httpRequest` → `if` failure → update counters.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Deliver | payload | the changed record from the trigger |
| Sign | signature | HMAC of payload with `WebhookSubscription.secret` |

**Key invariants**: a subscription with 10 straight failures is disabled; secrets never shown after creation.

**Security model**: Integrations permission to manage subscriptions.

**Critical test scenarios**:
- Happy path: product updated, subscriber gets a signed payload, verifies **AC-5**
- Failure case: subscriber down 10 times, subscription disabled, verifies **AC-5**
- Auth/permission: a Sales user cannot create a subscription, verifies **AC-5**

## Build plan

1. `WebhookSubscription` and `WebhookDelivery` schemas and screen, satisfies **AC-5**
2. Delivery workflows for the PRD event list, satisfies **AC-5**
3. Later phase: decide Option 2 or 3 for **AC-1** to **AC-4**, **AC-6**, **AC-7**

## Consequences

**Positive**: no false promises in the MVP.
**Negative / tradeoffs**: PRD P0 items INT-6 move out of the MVP; the integrator persona waits.
**Neutral**: outgoing webhooks give Zapier a starting point.

## Follow-up

- [ ] Update the PRD release plan (§8) to move INT-6 out of the MVP, if you agree.
