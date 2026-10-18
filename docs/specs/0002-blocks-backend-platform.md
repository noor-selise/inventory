# 0002. SELISE Blocks as the only backend

**Date**: 2026-10-18
**Status**: Proposed

## Summary

You have no backend of your own, so SELISE Blocks is the whole server side: login, users and roles, the database, files, email, in app alerts, background jobs, and hosting. The browser app (spec 0001) talks to Blocks only through the `@seliseblocks/client` SDK, and project setup happens through the `blocks` CLI. This spec records what Blocks can and cannot do for this product, so every feature spec can point here instead of repeating it. One big decision is still open: how stock changes are written safely, since Blocks has no documented transactions.

## Context

The product (`docs/01-business-prd.md`) is an inventory and order system. Most of it is ordinary records and screens, but its core is a stock ledger. Every stock change must write a movement row and update a balance together, quantities must never drift, and two people must never be able to take the same last unit (PRD §5.2, §7 Correctness and Concurrency; DB design §2).

You confirmed there will be no separate backend service. Everything has to run on Blocks, the platform behind project `Dfe830076882d4e28a313347efed8fbbe` ("Inventory", dev). The vendored skills in `.agents/skills/` (blocks-cli commit `74be268`) are the documented, verified surface. Raw HTTP calls to the Blocks API are forbidden by those rules.

State of the project on 2026-10-18: no data schemas, no workflows, only the default `clouduser` role, login not enabled (`isOidcEnabled: false`, no OIDC client), multi organization mode off, Azure file storage ready, three languages (en-US, de-DE, bn-BD).

If the platform limits are not written down once, every feature will rediscover them halfway through a build, or worse, ship around them silently.

## Options considered

### Option 1: Blocks only (no backend service)

Every feature uses Blocks services. Logic that must run on the server goes into Blocks workflows (data triggers, webhooks, schedules, with a JavaScript `code` node).

**Pros**:
- Nothing to host or operate besides the static app.
- Login, roles, files, mail, alerts, and deploys come ready made.

**Cons**:
- No transactions, atomic increments, or sums over data (see Platform limits). The stock core is at risk.
- Business rules mostly run in the browser, so a signed in user with write access can get around them.

### Option 2: Blocks plus a small posting service behind `logic proxy`

Same as Option 1, but stock posting, document numbering, and totals run in one small service with a real transactional database, reached through Blocks `logic proxy`.

**Pros**:
- The ledger is correct by construction (real transactions, row locks).
- Everything else still uses Blocks.

**Cons**:
- It is a backend, which you said you do not have. Someone has to build, host, and run it.

## Decision

**Chosen option**: Option 1: Blocks only, with the stock posting strategy left as an explicit open decision (D1 below) until the Blocks team answers the transaction question.

Every feature is designed on Blocks. Features that depend on safe stock posting are marked as blocked by D1.

**Implementation skills**: all 22 skills in `.agents/skills/` (`SELISEdigitalplatforms/blocks-cli`). Most used: `blocks-bootstrap`, `blocks-data-gateway-configuration`, `blocks-data-gateway-crud`, `blocks-workflow`, `blocks-iam-access-control`, `blocks-iam-organizations`.

## Rationale

You ruled out running a backend, and Blocks covers about two thirds of the PRD with documented, verified commands. Choosing Option 2 now would mean building the one thing you said you cannot run, before knowing if it is needed. Keeping D1 open costs nothing while foundation features (login, catalog, settings) are built, because none of them post stock.

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vite + React 19 + TypeScript SPA (spec 0001) | Already built. Wired to Blocks with the existing app flow (`blocks-bootstrap/flows/existing-app.md`), not `blocks new web` |
| Backend platform | SELISE Blocks, project `Dfe830076882d4e28a313347efed8fbbe` | No backend of your own |
| SDK / CLI | `@seliseblocks/client` (0.2.0) in the app, `blocks` CLI (0.9.x) for setup | The only sanctioned surfaces |
| Auth | Blocks IAM hosted login (OIDC), MFA, optional social login | `blocks-iam-*`, `blocks-iam-sso-oidc-*` |
| Tenancy | Blocks organizations, one organization = one customer company | `blocks-iam-organizations`. Every record gets `OrganizationId` automatically |
| Database | Blocks Data Gateway, managed MongoDB behind GraphQL | `blocks-data-gateway-*`. Collections named `blx_{SchemaName}s` |
| Server logic | Blocks workflows (data triggers, webhooks, schedules, code node) | `blocks-workflow`. Not transactional. `blocks logic scheduler` (cron that calls a URL with a signing secret) also exists in the CLI but has no skill yet |
| Files | Blocks storage, default Azure provider | `blocks-data-storage` |
| Email | Blocks mail with templates | `blocks-mail` |
| In app alerts | Blocks notifier | `blocks-notifier` |
| Secrets | Blocks secret store (integration keys) | `blocks-secrets` |
| Translations | Blocks localization | `blocks-localization-*` |
| Hosting | Blocks release | `blocks-release-deployment` |
| Local dev | HTTPS on the project domain (login cookie needs it) | `blocks-frontend-local-https` (written for the scaffold, so you adapt it to Vite 8) |

## Platform limits (what every feature spec checks against)

| # | Limit | Source | Effect |
|---|---|---|---|
| L1 | No documented multi record transactions | crud and workflow skills, SDK source, CLI help | Ledger plus balance cannot be written all or nothing |
| L2 | No documented atomic increment (`$inc`) | same | Stock and cost updates are read, change, write: lost updates when two users act at once |
| L3 | No sums or grouping over records. `schemas.aggregation` is schema metadata only | crud skill, SDK source | Totals and reports must pull rows to the browser, or be precomputed by scheduled workflows |
| L4 | Server side rules are limited to field validations (simple comparisons, regex), permissions, and row or column policies. Anything else runs in the browser or in a workflow after the fact | config skill | Status rules, credit limits, numbering are not enforced on the server |
| L5 | No API key product for your own customers, no signed outgoing webhooks | CLI command list | Public REST API, HMAC webhooks, MCP server cannot be built as the PRD says |
| L6 | The grammar of custom row policies is not documented | config skill | "Only my customers" and "only my locations" rules are unverified |
| L7 | No foreign keys or cascades (document store) | config skill | "Deactivate, never delete once referenced" is enforced by the app |
| L8 | No billing or subscription service in the skills | skill list | Plans and limits (PRD §6) need their own design |
| L9 | Up to 15 indexes per schema, unique indexes allowed | config skill | Uniqueness (name, SKU, order number) is enforceable on the server |
| L10 | The update `filter` grammar is undocumented. If filtered updates act as compare and set, L2 is mostly solved for single records | crud skill | Asked in the report to the Blocks team |

## Open decision D1: stock posting strategy

Blocks the stock changing parts of specs 0007, 0008, 0009, 0011, 0012, 0017 (opening stock), 0020, 0021, 0024. Options, in order of preference:

1. **Compare and set on single records** (if Blocks confirms L10): each balance row carries a `version`; an update filtered by `ItemId` and `version` either wins or retries. The movement row is written first as `pending`, then marked `posted` after the balance update; a nightly workflow repairs any `pending` row. Recommended if confirmed.
2. **One webhook workflow as the only stock writer**, plus a nightly rebuild of balances from the ledger. Works without new Blocks features, but races are still possible under load.
3. **Small posting service behind `logic proxy`** (spec Option 2). Correct, but needs a backend.

## Consequences

**Positive**:
- No servers to run. Login, roles, files, mail, and deploys are ready made.
- One place (this spec) lists the limits, so feature specs stay short.

**Negative / tradeoffs**:
- The stock core is not safe until D1 is closed.
- Totals and reports cost more (L3), and business rules can be bypassed by a determined signed in user (L4).
- PRD items INT-6, INT-7, INT-8 (public API, webhooks, MCP) are out of reach on Blocks alone.

**Neutral**:
- MongoDB means documents, not tables. Line items can live inside their order document, which avoids some multi record writes (used in specs 0011, 0012).

## Follow-up

- [ ] Wait for the Blocks team's answer on transactions, atomic increments, filter grammar, and aggregation (report prepared 2026-10-18), then close D1.
- [ ] Turn on login: register a public OIDC client and set `isOidcEnabled` (spec 0003).
- [ ] Turn on multi organization mode (spec 0003).
- [ ] Update the Blocks CLI from 0.9.0 to 0.9.2 when you agree.
- [ ] The `blocks data rules pull --dry-run` command wrote a local file despite `--dry-run`. Worth a separate report.
