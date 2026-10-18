# 0003. Sign in, team members and roles on Blocks IAM

**Date**: 2026-10-18
**Status**: In Progress

## Summary

People sign in through Blocks hosted login, can turn on two step login, and belong to one company (a Blocks organization). What each person can do comes from Blocks roles and permissions, shipped as ready made bundles (Admin, Manager, Sales, Purchasing, Warehouse, Production, Read only). Blocks covers almost all of this. The parts that need care are hiding cost from some users, limiting people to certain locations, and the PO approval limit.

## Context

PRD §4.11 (SEC-1 to SEC-8) and §2 personas. The DB design has `ROLE` and `TEAM_MEMBER` tables and a `company_id` on every table. On Blocks, users, roles, and organizations already exist as platform records, so most of those tables are not needed as custom schemas.

Today the project has login turned off (`isOidcEnabled: false`), no OIDC client, multi organization mode off, and only the default `clouduser` role. Nothing else in the product works until sign in does.

## Requirements

**User stories**:
- As an owner, I want to invite my staff by email and give each a role, so they only see what their job needs.
- As a team member, I want to sign in with email and password (optionally Google or Microsoft) and protect my account with a second step.
- As an owner, I want cost and margin hidden from people without cost access.

**Acceptance criteria**:
- **AC-1**: A user signs in through Blocks hosted login and lands in the app with a working session over HTTPS on the project domain.
- **AC-2**: Each user belongs to exactly one company (organization); every record they create carries that `OrganizationId`, and they never see another company's records.
- **AC-3**: An owner can invite, deactivate, and reactivate team members and change their role.
- **AC-4**: Seven ready made roles exist (Admin, Manager, Sales, Purchasing, Warehouse, Production, Read only), each a bundle of permissions an owner can edit.
- **AC-5**: A user without the "Cost view" permission never receives cost fields from the server (masked, not just hidden in the UI).
- **AC-6**: A user can enroll in two step login (TOTP or OTP), and an owner can require it for the whole company.
- **AC-7**: Every record shows who last changed it and when.
- **AC-8**: A user limited to some locations only sees stock and documents for those locations. (P1)
- **AC-9**: A purchaser can only approve a PO up to their own approval limit. (P1, enforced in app, see Blocks fit)

## Options considered

### Option 1: Blocks IAM users, roles, permissions, organizations

Use the platform's own users, roles, permissions (Endpoint, FrontendAction, DataProtection types), and organizations. Keep only a small `TeamMemberProfile` schema for fields Blocks users lack (PO approval limit, allowed locations).

**Pros**:
- Login, MFA, invites, lockout, password reset are built in and verified.
- DataProtection permissions mask fields on the server, which meets AC-5.

**Cons**:
- Location limits and approval limits are not native; they need a custom schema and row policies whose grammar is undocumented (L6).

### Option 2: Custom ROLE and TEAM_MEMBER schemas, as in the DB design

Store roles and permissions as your own records and check them in the app.

**Pros**:
- Matches the DB design one to one.

**Cons**:
- Checks run only in the browser, so the server enforces nothing. Duplicates what Blocks already does.

## Decision

**Chosen option**: Option 1: Blocks IAM for users, roles, permissions, and organizations, plus a small `TeamMemberProfile` schema.

**Implementation skills**: `blocks-bootstrap`, `blocks-iam-sso-oidc-configuration`, `blocks-iam-sso-oidc-implementation`, `blocks-iam-account`, `blocks-iam-users`, `blocks-iam-access-control`, `blocks-iam-organizations`, `blocks-iam-mfa`, `blocks-frontend-local-https`, `blocks-captcha` (all in `.agents/skills/`).

## Rationale

The server must enforce access (PRD §7 Security), and only Blocks permissions are enforced by the gateway (Endpoint type gives a 403, DataProtection masks fields). Rebuilding roles in custom schemas would leave everything enforced only in the browser.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| SEC-1 | Email login, 2FA | IAM account, `blocks-iam-mfa` | ✅ Can do |
| SEC-1 | SSO Google, Microsoft, Okta (P2) | `blocks-iam-sso-oidc-configuration` (identity providers) | ✅ Can do |
| SEC-2 | About 50 rights by module and action | Permissions (Endpoint + FrontendAction) | ✅ Can do |
| SEC-2 | Cost View/Edit | DataProtection permission + column level policy | ⚠️ Can do; confirm masking per field on first build |
| SEC-3 | Role bundles, per user overrides | Roles; overrides via an extra role | ✅ Can do |
| SEC-4 | Location restriction | `TeamMemberProfile.allowedLocationIds` + custom row policy | ⚠️ Row policy grammar undocumented (L6) |
| SEC-5 | PO approval limit | `TeamMemberProfile.poApprovalLimit`, checked in app | ⚠️ Not enforced on server (L4) |
| SEC-6 | Last modified by and when | System fields `LastUpdatedBy`, `LastUpdatedDate` | ✅ Can do. Full change history for orders needs its own log (spec 0011) |
| SEC-7 | Optimistic concurrency | No row version | ⚠️ Depends on L10 (compare and set) |
| SEC-8 | Backups, point in time restore | Platform managed, not exposed in skills | ⚠️ Unverified, ask Blocks |
| §2 | One company per tenant | Organizations, multi org mode | ✅ Can do (mode must be turned on) |

## Feature design

**Data model sketch**:
- Blocks platform records (not custom schemas): User, Role, Permission, Organization.
- `TeamMemberProfile` (custom): `userId` ID (required, unique index), `poApprovalLimit` Float (nullable), `allowedLocationIds` ID array (empty means all), `isStockroomUser` Boolean (default false, spec 0021). System fields add `OrganizationId`, `CreatedBy`, `LastUpdatedBy`.

**API surface** (SDK and CLI operations):
| Operation | Surface | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Sign in | SDK `redirectToProvider`, `/login/callback` | none | session | public | redirect loop if not HTTPS |
| Invite user | SDK `iam.users.create` | email, roleSlugs | userId | Admin | email taken |
| Change role | SDK `iam.users.updateAccess` | userId, roles | ok | Admin | 403 |
| Deactivate | SDK `iam.users.deactivate` | userId | ok | Admin | 403 |
| Read my permissions | SDK `iam.resources.features()` | none | permission list | signed in | none |
| Define roles (setup) | CLI `blocks iam roles create`, `assign-permissions` | slug, permissions | role | project owner | dry run first |
| MFA enroll | SDK `mfa.*` | method | secret, backup codes | signed in | wrong code |

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Any write | `OrganizationId` | Blocks session (active organization) |
| Any write | last changed by and when | Blocks system fields |
| Cost masking | whether to mask | user's DataProtection permission |
| PO approve | limit | `TeamMemberProfile.poApprovalLimit` |

**Key invariants**:
- A user belongs to one organization (PRD §1.5, no multi company consolidation).
- An Admin cannot remove the last Admin.

**Security model**: Gateway enforces Endpoint permissions (403) and DataProtection masking. FrontendAction permissions only hide UI. Role and permission definitions change only with an owner's explicit confirmation.

**Configuration required**:
- `VITE_BLOCKS_X_BLOCKS_KEY`, `VITE_BLOCKS_API_URL`, `VITE_BLOCKS_APP_DOMAIN`, `VITE_BLOCKS_OIDC_CLIENT_ID`, `VITE_BLOCKS_OIDC_URL`: read from `blocks projects get` and `blocks auth oidc-clients list`, never typed by hand.

**Critical test scenarios**:
- Happy path: invite a Warehouse user, they sign in and see fulfillment screens only, verifies **AC-1**, **AC-3**, **AC-4**
- Failure case: user of company A queries company B's products and gets nothing, verifies **AC-2**
- Auth/permission: Sales user reads a product and the cost field comes back masked, verifies **AC-5**

## Build plan

- [ ] 1. Register the public OIDC client for the app's real callback URL and enable `isOidcEnabled`, satisfies **AC-1** (script ready in `scripts/blocks-setup.sh`, not run yet)
- [x] 2. Set up local HTTPS on the project domain for the Vite app, satisfies **AC-1**
- [x] 3. Install the SDK, create the single `blocksClient`, add login, callback, and route guards, satisfies **AC-1**
- [ ] 4. Turn on multi organization mode and create the first organization on signup, satisfies **AC-2** (deferred: multi org can be switched on only once and never off, needs your explicit go ahead)
- [ ] 5. Create the seven roles and their permissions (dry run reviewed, then applied), satisfies **AC-4**, **AC-5** (roles and admin team permissions in `scripts/blocks-setup.sh`, not run yet; cost masking not built)
- [x] 6. Team screen: invite, deactivate, change role, satisfies **AC-3**
- [ ] 7. MFA settings screen and company MFA policy, satisfies **AC-6** (not built)
- [x] 8. Show last changed by and when on records, satisfies **AC-7**
- [ ] 9. `TeamMemberProfile` schema with location limits and approval limit (P1), satisfies **AC-8**, **AC-9** (P1, not built)

## Consequences

**Positive**:
- Sign in, MFA, lockout, and invites are ready made and enforced on the server.

**Negative / tradeoffs**:
- Location limits and approval limits are partly app side until row policy grammar is confirmed.
- Seat counting for plans (spec 0023) is not built in.

**Neutral**:
- The DB design's `ROLE` and `TEAM_MEMBER` tables are replaced by Blocks records plus `TeamMemberProfile`.

## Follow-up

- [ ] Confirm with Blocks how a custom row policy can compare a record field with a value on the current user (needed for AC-8 and SO-17).
- [ ] Confirm backup and restore guarantees (SEC-8).
