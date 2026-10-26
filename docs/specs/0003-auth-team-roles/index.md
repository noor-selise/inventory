# 0003. Sign-in, team members and roles on Blocks IAM

**Date**: 2026-10-18 (revised 2026-10-26 after EGM review)
**Status**: In Progress

## Summary

People sign in through Blocks hosted login, can turn on MFA, and belong to a company (a Blocks organization). What each person can do comes from seven ready-made roles (Admin, Manager, Sales, Purchasing, Warehouse, Production, Read-only).

Blocks provides identity: sign-in, sessions, MFA, invites and IAM admin actions, all enforced on the server. Data rights (who may edit products, see cost, approve a PO) are checked in the browser by role today. The server does not enforce them yet, because every data schema is open to any signed-in user and Blocks has not yet confirmed how to grant or unmask a field for some roles only. This spec records that interim state honestly and defines the exit gate to server enforcement.

## Terms

- **Owner**: a user holding the Admin role in the app.
- **Project owner**: the Blocks console account that runs the `blocks` CLI. It is not an app user, and it is the recovery path if every Admin is locked out.
- **Company**: one Blocks organization.
- **MFA**: multi-factor authentication. Blocks supports an authenticator app (TOTP) and an emailed one-time code.
- **P0, P1, P2**: PRD priorities (P0 is needed for launch).

Platform limits cited in this spec (L4, L6, L10) are defined in [spec 0002, Platform limits](../0002-blocks-backend-platform.md).

## Requirements

**User stories**:
- As an owner, I want to invite my staff by email and give each a role, so they only see what their job needs.
- As a team member, I want to sign in with email and password and protect my account with MFA.
- As an owner, I want cost and margin hidden from people without cost access.

**Acceptance criteria**:
- **AC-1**: A user signs in through Blocks hosted login and lands on `/` with an authenticated session over HTTPS on the project domain.
- **AC-2**: Each user works in one company (organization). Every record they create carries that `OrganizationId`, and they never see another company's records.
- **AC-3**: An owner can invite, deactivate and reactivate team members and change their role.
- **AC-4**: Seven ready-made roles exist (Admin, Manager, Sales, Purchasing, Warehouse, Production, Read-only) with the capabilities in the [role matrix](#role-matrix). Bundles are fixed in this version. Owner-editable bundles need permission-based gating and are deferred.
- **AC-5**: A user without cost view never receives cost fields from the server (masked by the server, not only hidden in the UI). Blocked on Blocks, see [Risks](#risks--mitigations).
- **AC-6**: A user can enroll in MFA (TOTP or email code), and an owner can require it for the whole company.
- **AC-7**: Every record shows who last changed it and when.
- **AC-8**: A user limited to some locations only sees stock and documents for those locations. (P1, browser filter until L6 is resolved)
- **AC-9**: A purchaser can only approve a PO up to their own approval limit. (P1, enforced in the app only, L4)

## Goals and Non-goals

**Goals**: SEC-1 to SEC-6 through AC-1 to AC-9, with the enforcement level of each stated in [Enforcement today](#enforcement-today).

**Non-goals** (owned elsewhere or deferred):
- SEC-7 optimistic concurrency: [spec 0026](../0026-stock-posting-compare-and-set.md), which confirms L10 holds.
- SEC-6 full change history for orders: [spec 0011](../0011-sales-orders-fulfillment.md).
- Seat counting for plans: [spec 0023](../0023-plans-entitlements.md). No work in this spec.
- SSO with Google, Microsoft, Okta (P2).
- SEC-3 per-user overrides (one person gets one extra right). Deferred until roles are permission-gated.
- SEC-8 backups and point-in-time restore: a platform question for the Blocks team.
- `isStockroomUser` behaviour: [spec 0021](../0021-stockroom-scanning.md).

## Decision

Why this option, and the options rejected: [rationale.md](rationale.md).

**Chosen option**: Option 3 (hybrid) as the interim, with Option 1 as the target.

**Exit gate to Option 1**: when the Blocks team confirms (a) the Custom access policy grammar (L6) and (b) how a DataProtection permission or rule unmasks a column for some roles, switch schemas to Custom access, move cost to DataProtection, and change `scripts/blocks-data-deploy.mjs` so it stops resetting `rules.security` to User access.

**Implementation skills**: `blocks-bootstrap`, `blocks-iam-sso-oidc-configuration`, `blocks-iam-sso-oidc-implementation`, `blocks-iam-account`, `blocks-iam-users`, `blocks-iam-access-control`, `blocks-iam-organizations`, `blocks-iam-mfa`, `blocks-frontend-local-https`, `blocks-data-gateway-configuration` (all in `.agents/skills/`).

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| SEC-1 | Email login, MFA | IAM account, `blocks-iam-mfa` | ✅ Done |
| SEC-1 | SSO Google, Microsoft, Okta (P2) | `blocks-iam-sso-oidc-configuration` (identity providers) | Non-goal |
| SEC-2 | Rights by module and action | Interim: role slugs in the app. Target: Custom schema access + Endpoint permissions | ⚠️ UI only today |
| SEC-2 | Cost View | Interim: `COST_VIEWERS` role list. Target: DataProtection + column policy | ⚠️ Blocked on Blocks (unmask by role) |
| SEC-3 | Role bundles | Seven Blocks roles | ✅ Done (fixed bundles); overrides are a non-goal |
| SEC-4 | Location restriction | `TeamMemberProfile.allowedLocationIds` + browser filter; target custom row policy | ⚠️ Not built; row policy grammar undocumented (L6) |
| SEC-5 | PO approval limit | `TeamMemberProfile.poApprovalLimit`, checked in app | ⚠️ App only (L4) |
| SEC-6 | Last modified by and when | System fields `LastUpdatedBy`, `LastUpdatedDate` | ✅ Done; order history in spec 0011 |
| §2 | One company per organization | Organizations, multi-organization mode | ⚠️ Mode on; isolation not yet proven by a test |

### Enforcement today

| Capability | Enforced where today | Target |
|---|---|---|
| Sign-in, session, MFA | Server (Blocks IAM) | Same |
| IAM admin actions (invite, role change, deactivate) | Server (admin role holds the IAM permissions) | Same |
| Company isolation | Server by `OrganizationId` (assumed; not proven) | Proven by a live check (step 4b) |
| Data rights per module | Browser only (role lists) | Custom schema access |
| Cost visibility | Browser only (`COST_VIEWERS`) | DataProtection masking |
| PO approval limit | Browser only (`canApprove`) | Custom access on PO status, or accepted risk |
| Location limits | Browser and query filter (spec rules in [Location limits](#location-limits)) | Row policy (L6) |
| Profile writes | Any signed-in user | Admin only via Custom access |
| Last-admin guard | Browser only (`TeamPage.tsx`) | Same; recovery by project owner |

All data schemas are `accessLevel: 1` (any signed-in user) with no policies, because `scripts/blocks-data-deploy.mjs` writes them that way on every deploy.

## Feature design

**Data model**:
- Blocks platform records (not custom schemas): User, Role, Permission, Organization.
- `TeamMemberProfile` (custom, the shared per-person settings record; `userId` has a unique index). It is created by `saveProfile` the first time an owner edits a person, and a missing profile behaves as all defaults.

| Field | Type | Owner spec | Access control? | Meaning |
|---|---|---|---|---|
| `userId` | ID | 0003 | – | The Blocks user |
| `poApprovalLimit` | Float | 0003 | Yes | Highest PO total in home currency the person may approve. `-1` (`NO_LIMIT`, because Blocks ignores null in an update) means no personal limit: an Admin may then approve any total, a non-admin may approve none. A 0.005 tolerance applies. |
| `allowedLocationIds` | ID array | 0003 | Yes | Locations ([spec 0006](../0006-locations-bins.md)) the person may see. Empty means all; ignored for Admins. |
| `ownCustomersOnly` | Boolean | [0011](../0011-sales-orders-fulfillment.md) | Yes | A sales rep sees only their own customers and orders |
| `isStockroomUser` | Boolean | [0021](../0021-stockroom-scanning.md) | – | Stockroom device user |
| `dashboardWidgets` | String array | [0027](../0027-orders-reports-p1-choices.md) | No (preference) | Home widgets |

System fields add `OrganizationId`, `CreatedBy`, `LastUpdatedBy` and `LastUpdatedDate`.

### Role matrix

Capabilities each role holds today. The lists live in one module, `src/features/team/roles.ts`, and must match this table.

| Capability | Admin | Manager | Sales | Purchasing | Warehouse | Production | Read-only |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| View all screens | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Team, company settings, locations | ✅ | | | | | | |
| Products, categories | ✅ | ✅ | | ✅ | | | |
| Price lists | ✅ | ✅ | | | | | |
| Customers | ✅ | ✅ | ✅ | | | | |
| Vendors | ✅ | ✅ | | ✅ | | | |
| Edit sales orders | ✅ | ✅ | ✅ | | | | |
| Confirm sales orders | ✅ | ✅ | | | | | |
| Fulfil (pick, pack, ship) | ✅ | ✅ | ✅ | | ✅ | | |
| Edit purchase orders, reorder | ✅ | ✅ | | ✅ | | | |
| Receive purchase orders | ✅ | ✅ | | ✅ | ✅ | | |
| Stock adjustments, transfers, counts | ✅ | ✅ | | | ✅ | | |
| Review counts, override negative stock | ✅ | ✅ | | | | | |
| Payments | ✅ | ✅ | ✅ | ✅ | | | |
| Cost view | ✅ | ✅ | | ✅ | | | |
| Low-stock alert emails | | | | ✅ | | | |

"Fulfillment screens" means the Fulfil row. Production has no screens yet (spec 0020).

### Location limits

Decided 2026-10-26 by /architect without a design conversation, at your request ("don't ask any"). Each rule is a recommendation you can change; `/develop` builds to it.

- **Who is limited**: a non admin whose `TeamMemberProfile.allowedLocationIds` is not empty. Admins are never limited. An empty list, or no profile, means every location.
- **Documents with one location** (sales orders by `locationId`, POs by `receiveLocationId`, adjustments and counts by `locationId`): visible only when that location is allowed. Opening a blocked one by URL shows a "no access to this location" message.
- **Transfers**: visible when either end (`fromLocationId` or `toLocationId`) is allowed, so the receiving store sees what is coming. A limited user may send only from an allowed location, to any active location.
- **Stock rows** (balances, movements, lots, reorder suggestions, count sheets): only rows at allowed locations.
- **Location pickers** (order editors, stock documents, stock and reorder filters, report filters): offer only allowed locations. Two pickers name the other end of a move and offer every active location: a transfer's "To" and a reorder setting's "Move from".
- **Reports and dashboard**: rows and totals cover allowed locations only; a report run without a location filter covers all allowed locations, not every location.
- **Not limited**: records with no location (products, customers, vendors, price lists, payments, settings). Payments belong to a customer or vendor, not a location.
- **Edited where**: the owner picks the locations in the Team screen's per person settings dialog.
- **Loading**: the app shows nothing until the signed in user and their profile are loaded, so a limited user never sees every location for a moment.
- **Enforcement**: the filters go into the Data Gateway query where one field decides (`$in` on the location field) and run in the browser for transfers. Neither is server enforcement; the exposure risk stays in [Risks](#risks--mitigations) until the exit gate.
- **Code**: one helper, `src/features/team/location-scope.ts` (`useLocationScope`), used by every screen above.

**API surface** (SDK and CLI operations):

| Operation | Surface | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Sign in | SDK `redirectToProvider`, `/login/callback` | none | session | public | redirect loop if not HTTPS |
| Invite user | SDK `iam.users.create` | email, roles | userId | Admin | email taken |
| Change role | SDK `iam.users.updateAccess` | userId, roles | ok | Admin | 403 |
| Deactivate | SDK `iam.users.deactivate` | userId | ok | Admin | 403 |
| Reactivate | SDK `iam.users.activate` | userId | ok | Admin | 403 |
| Read my profile | SDK `iam.me()` | none | user, roles | signed in | none |
| MFA enroll | SDK `mfa.totp.setup`, `mfa.totp.verifySetup`, `mfa.setMethod` | method, code | secret, backup codes | signed in | wrong code |
| Company MFA rule | SDK `mfa.config`, `mfa.saveConfig` | enable, require for all | ok | Admin | 403 |
| Define roles (setup) | CLI `blocks iam roles create`, `assign-permissions` | slug, permissions | role | project owner | slug exists |

Role and permission changes from the CLI run with `--dry-run` first, then `--yes`, after the project owner reviews the dry run.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| Any write | `OrganizationId` | Blocks session (active organization) |
| Any write | last changed by and when | Blocks system fields |
| Cost hiding | whether to hide | role in `COST_VIEWERS` (target: DataProtection permission) |
| PO approve | limit | `TeamMemberProfile.poApprovalLimit` |

**Key invariants**:
- A user works in one active organization at a time. The first company stays in Blocks' `default` organization ([spec 0027](../0027-orders-reports-p1-choices.md)); a person in several can switch.
- An Admin cannot remove the last Admin, by role change or deactivation. Enforced in the browser (`wouldRemoveLastAdmin`, `src/features/team/TeamPage.tsx`); if bypassed, the project owner restores an Admin with `blocks iam users access grant`.

**Security model**: Blocks IAM enforces sign-in, sessions, MFA and IAM admin actions on the server. Everything in the [role matrix](#role-matrix) is UI gating only until the exit gate. Role and permission definitions change only after the project owner confirms a dry run.

**Configuration required**:
- `VITE_BLOCKS_X_BLOCKS_KEY`, `VITE_BLOCKS_API_URL`, `VITE_BLOCKS_APP_DOMAIN`, `VITE_BLOCKS_OIDC_CLIENT_ID`, `VITE_BLOCKS_OIDC_URL`: read from `blocks projects get` and `blocks auth oidc-clients list`, never typed by hand.

**Critical test scenarios**:
- Happy path: invite a Warehouse user, they sign in and can fulfil and receive but not edit products, verifies **AC-1**, **AC-3**, **AC-4**
- Reactivate: deactivate then reactivate a user; they can sign in again, verifies **AC-3**
- Last Admin: the only Admin cannot demote or deactivate themselves, verifies the invariant
- Deactivation: a deactivated user's existing session stops working
- MFA: enroll TOTP; a wrong code is rejected; a backup code works once, verifies **AC-6**
- Approval: a purchaser approves a PO at their limit, is refused just above it, and a non-admin with no limit is refused, verifies **AC-9**
- Expected to fail until the exit gate:
  - A user of company A queries company B's products and gets nothing, verifies **AC-2** (step 4b)
  - A Sales user reads a product and the cost field comes back masked, verifies **AC-5** (step 5c)
  - A non-admin updates their own `poApprovalLimit` and is refused

## Risks & Mitigations

| Risk | Impact | Mitigation | Owner |
|---|---|---|---|
| All schemas are open to any signed-in user, including `TeamMemberProfile` | A user can edit records outside their role, or raise their own approval limit, via the SDK | Accepted for the interim; exit gate moves schemas to Custom access. Admin-only profile write is the first rule to add. | Engineer, after the Blocks answer |
| Deploy script resets security | Any hand-added rule in `rules.security` is lost on the next `blocks-setup.sh` | Change `scripts/blocks-data-deploy.mjs` as part of the exit gate | Engineer |
| Cost masking unproven by role | AC-5 cannot be met | Fallback: move cost fields to a separate schema with role-based read | Blocks team answer, then engineer |
| Organization isolation unproven | A company could read another's records | Live check in step 4b before a second company signs up | Engineer |
| Last-admin guard is browser-only | A company could lose its last Admin | Recovery by the project owner via the CLI | Project owner |
| PO approval limit bypass (L4) | A purchaser could approve above their limit through the SDK | Accepted; approvals are visible in the PO history | Owner |

## Build plan

- [x] 1. Register the public OIDC client for the callback URL on the project domain and enable `isOidcEnabled`, satisfies **AC-1** (`scripts/blocks-setup.sh` steps 1-2)
- [x] 2. Set up local HTTPS on the project domain for the Vite app, satisfies **AC-1** (`scripts/generate-cert.mjs`, `vite.config.ts`)
- [x] 3. Install the SDK, create the single `blocksClient`, add login, callback and route guards, satisfies **AC-1** (`src/lib/blocks/client.ts`, `auth.ts`, `src/app/router/guards.tsx`)
- [x] 4. Turn on multi-organization mode; the first company stays in `default`, satisfies **AC-2** in part (decision in [spec 0027](../0027-orders-reports-p1-choices.md); `src/features/team/OrganizationCard.tsx`)
- [ ] 4b. Prove organization isolation: a live check that a user in organization A reads nothing from organization B, satisfies **AC-2**. Prerequisite: a second test organization, created by the project owner (commands in the script header). Check written: `scripts/checks/org-isolation-live.mjs`; not yet run.
- [x] 5a. Create the seven roles; Admin holds the IAM team permissions, satisfies **AC-4** in part (`scripts/blocks-setup.sh` steps 4-5)
- [x] 5b. Move every role list into `src/features/team/roles.ts` so the code matches the [role matrix](#role-matrix), satisfies **AC-4**. Test: `pnpm typecheck`, `pnpm lint` and `pnpm build` pass.
- [ ] 5c. Server cost masking for the cost fields (`Product.averageCost`, PO line unit cost, movement and lot unit cost, landed cost, stock valuation), satisfies **AC-5**. Blocked on the Blocks answer; includes the `blocks-data-deploy.mjs` change. Gate: one field masked for Sales and visible for Purchasing, including inside embedded lines.
- [ ] 5d. Delete the temporary `CostProbe` schema and its rules once 5c is decided.
- [x] 6. Team screen: invite, deactivate, reactivate, change role, last-admin guard, satisfies **AC-3** (`src/features/team/TeamPage.tsx`)
- [x] 7. MFA settings screen and company MFA rule, satisfies **AC-6** (`src/features/team/SecurityPage.tsx`, route `/settings/security`)
- [x] 8. Show the last-modified user and time on records, satisfies **AC-7** (`src/components/app/audit.tsx`)
- [x] 9a. `TeamMemberProfile` schema, approval limit editor and PO approval check, satisfies **AC-9** (`src/features/team/profile.ts`, `TeamPage.tsx`, `src/features/purchasing/actions.ts`; live check in `scripts/checks/p1-live.mjs`)
- [x] 9b. Location limits (P1), built to [Location limits](#location-limits): the `location-scope.ts` helper, the Team screen picker, then pickers, lists, detail pages, reports and dashboard, satisfies **AC-8**. Prerequisite: 5b (done). Test: a user limited to location X sees no stock or documents at location Y, and sees a transfer from Y to X.

## Consequences

**Positive**:
- Sign-in, MFA, lockout and invites are provided by Blocks IAM and enforced on the server.
- One role model (the role matrix) serves both the interim and the target.

**Negative / tradeoffs**:
- Data rights and cost hiding are UI-only until the exit gate.
- The PO approval limit is enforced in the app only (L4).
- Location limits are not built.
- Every data schema is open to any signed-in user.

**Neutral**:
- The DB design's `ROLE` and `TEAM_MEMBER` tables are replaced by Blocks IAM roles and users plus `TeamMemberProfile`, which [spec 0027](../0027-orders-reports-p1-choices.md) extended with `ownCustomersOnly` and `dashboardWidgets`.

## Follow-up

- [ ] Ask the Blocks team how a DataProtection permission or rule unmasks a column for some roles (unblocks step 5c and AC-5).
- [ ] Ask the Blocks team for the Custom access and row policy grammar, including comparing a record field with a value on the current user (unblocks the exit gate, AC-8 and SO-17 in [spec 0011](../0011-sales-orders-fulfillment.md)). Fallback if it cannot be confirmed: keep the browser filter for AC-8 and accept the exposure risk.
- [ ] Build the organization isolation check (step 4b).
- [ ] Ask the Blocks team about backup and restore guarantees (SEC-8).
