# 0018. Accounting, ecommerce and shipping integrations

**Date**: 2026-10-18
**Status**: Proposed

## Summary

Sync invoices, bills, and payments to QuickBooks Online (and Xero later), pull orders in from Shopify and push stock levels back, and buy shipping labels through a rate shopping service. Blocks workflows can receive webhooks, call outside APIs, run on schedules, and keep secrets, which is the right shape for this. The hard parts are each company connecting its own QuickBooks or Shopify account (an OAuth login per company) and keeping those tokens refreshed; that is possible with workflows but not shown in the skills, so it needs a proof first.

## Context

PRD INT-1 (P0 QuickBooks), INT-2 (P0 Shopify), INT-3 (P1 shipping), §9 item 4 ("accounting sync reliability must be P0 quality: retries, mapping UI, error inbox").

## Requirements

**Acceptance criteria**:
- **AC-1**: A company connects its own QuickBooks Online account, and the app keeps the connection alive (token refresh) without the user signing in again.
- **AC-2**: Invoices, payments, bills, and vendor payments push to QuickBooks; payments made in QuickBooks come back.
- **AC-3**: Every sync attempt is logged; failures retry with backoff and land in an error inbox the owner can see and retry.
- **AC-4**: A company connects its Shopify store; new Shopify orders arrive as sales orders (source Shopify, external id) once only.
- **AC-5**: Stock level changes push to Shopify within a few minutes.
- **AC-6**: Users rate shop carriers, buy a label, and store the tracking number on the shipment. (P1)
- **AC-7**: Xero, WooCommerce, Amazon follow the same pattern. (P1)

## Options considered

### Option 1: Blocks workflows per integration, tokens in a per company record, shared secrets in the secret store
**Pros**: no backend; webhooks, schedules, HTTP calls are documented. **Cons**: per company OAuth flow through workflows is unproven; secrets per company cannot live in the project secret store (it is project wide).

### Option 2: An integration platform (iPaaS) handles connections
**Pros**: OAuth, retries, mapping ready made. **Cons**: per company cost; another vendor.

## Decision

**Chosen option**: Option 1, starting with a proof of the QuickBooks OAuth connect and refresh flow on workflows. If the proof fails, move to Option 2.

**Implementation skills**: `blocks-workflow`, `blocks-secrets`, `blocks-data-gateway-crud`, `blocks-notifier`.

## Rationale

Workflows have every building block (webhook trigger for the OAuth callback and Shopify webhooks, `httpRequest` for API calls, schedules for retries and refresh), so the gap is proof, not capability. Company tokens must be stored encrypted per company, which the project wide secret store does not do; that is the main risk.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| INT-1 | Connect per company (OAuth) | Webhook workflow as callback + `httpRequest` token exchange | ⚠️ Possible, unproven |
| INT-1 | Store and refresh company tokens | `IntegrationConnection` schema (column hidden by DataProtection) + schedule refresh | ⚠️ Tokens in the database; secret store is project wide only |
| INT-1 | App level client id and secret | `blocks-secrets` | ✅ Can do |
| INT-1 | Push invoices, payments | Data trigger workflow → `httpRequest` | ✅ Can do |
| §9.4 | Retries, error inbox | `SyncLog` schema + schedule retry workflow | ✅ Can do |
| INT-2 | Shopify orders in | Webhook workflow → `dataAction insertData`, dedupe by external id | ⚠️ Can do; Shopify HMAC check needs the `code` node (crypto availability unverified) |
| INT-2 | Stock out to Shopify | Data trigger on balance updates → `httpRequest` | ⚠️ Can do; depends on spec 0007 |
| INT-3 | Shipping labels | `httpRequest` to a label API | ✅ Can do |
| INT-4 | Card payments, Square (P2) | Webhook workflow from the payment provider | ⚠️ Possible, unproven; card data must never touch Blocks |
| INT-5 | EDI through a partner (P2) | Partner webhooks + `httpRequest` | ⚠️ Possible, unproven |

## Feature design

**Data model sketch**:
- `IntegrationConnection`: `provider` (`quickbooks`, `shopify`, `xero`, `shipping`), `status`, `externalAccountId`, `accessToken`, `refreshToken`, `expiresAt` (tokens masked by DataProtection for every role), `settings` String (JSON mapping).
- `SyncLog`: `provider`, `entityType`, `entityId`, `direction`, `status` (`ok`, `failed`, `retrying`), `attempts`, `nextAttemptAt`, `error`, `externalId`.

**API surface**: workflows `qbo-connect-callback` (webhook), `qbo-push` (data trigger on Payment/SalesOrder invoiced), `qbo-refresh` (schedule), `sync-retry` (schedule), `shopify-orders` (webhook), `shopify-stock` (data trigger).

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Push invoice | QuickBooks customer | mapping in `IntegrationConnection.settings` |
| Import Shopify order | product | Shopify SKU → `Product.sku` |
| Dedupe | external id | `SalesOrder.externalId` unique per source |

**Key invariants**: one sales order per Shopify order id; every push is logged; tokens never sent to the browser.

**Security model**: Integrations permission to connect; tokens masked; webhooks check provider signatures.

**Configuration required**:
- `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`: Blocks secrets.
- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`: Blocks secrets.
- Shipping aggregator API key: Blocks secret.

**Critical test scenarios**:
- Happy path: connect QuickBooks, invoice an order, invoice appears in QuickBooks, verifies **AC-1**, **AC-2**
- Failure case: QuickBooks is down; the push retries and shows in the error inbox, verifies **AC-3**
- Dedupe: Shopify sends the same order twice; one sales order exists, verifies **AC-4**

## Build plan

1. Proof: QuickBooks OAuth connect and token refresh on workflows, satisfies **AC-1**
2. `IntegrationConnection`, `SyncLog`, retry workflow, error inbox, satisfies **AC-3**
3. QuickBooks push and payment pull, satisfies **AC-2**
4. Shopify connect, order webhook, stock push, satisfies **AC-4**, **AC-5**
5. P1: shipping labels, Xero, WooCommerce, Amazon, satisfies **AC-6**, **AC-7**

## Consequences

**Positive**: integrations need no backend if the proof works.
**Negative / tradeoffs**: company tokens live in the database (masked), not in a secret store.
**Neutral**: an iPaaS remains the fallback.

## Follow-up

- [ ] Ask Blocks whether the workflow `code` node has crypto for HMAC checks.
- [ ] Ask Blocks for per tenant secret storage.
