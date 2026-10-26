# 0003. Sign-in, team members and roles: decision record

Build spec: [index.md](index.md).

## Context

Staff need access scoped to their job, and the owner needs cost and margin hidden from people who should not see them. The PRD wants the server to enforce this ([PRD §7 Security](../../01-business-prd.md), [§4.11 SEC-1 to SEC-8](../../01-business-prd.md#411-users-security--access), personas in [§2](../../01-business-prd.md)). The [DB design](../../02-database-design.md) has `ROLE` and `TEAM_MEMBER` tables and a `company_id` on every table. On Blocks, users, roles and organizations already exist as platform records, so most of those tables are not needed as custom schemas.


State on 2026-10-18: login was off (`isOidcEnabled: false`), no OIDC client, multi-organization mode off, and only the default `clouduser` role. All other features depend on sign-in. Build plan steps 1-3 have since changed this.

## Options considered

### Option 1: Blocks IAM plus server-enforced data rights

Use Blocks users, roles, permissions (Endpoint, FrontendAction, DataProtection) and organizations. Data rights are enforced by the Data Gateway: schemas set to Custom access (`accessLevel: 3`) with role policies, and cost fields masked by DataProtection.

**Pros**:
- Login, MFA, invites, lockout and password reset come from Blocks IAM, which enforces them on the server.
- The gateway returns 403 for a missing right and masks protected fields.

**Cons**:
- The policy grammar for Custom access and row rules is undocumented (L6).
- A column policy masks a field for everyone; how a role unmasks it is not known yet ([scope](../../scope/scope.md)).

### Option 2: Custom ROLE and TEAM_MEMBER schemas, as in the DB design

Store roles and permissions as custom records and check them in the app.

**Pros**:
- Matches the DB design one-to-one.

**Cons**:
- The gateway's 403 and field masking apply to Blocks IAM permissions, not to custom role records, so enforcement would still be in the browser or in undocumented row policies.
- Duplicates users and roles that Blocks IAM already holds.

### Option 3: Hybrid (as built)

Blocks IAM for identity, sessions, MFA, invites and organizations (server-enforced). Data rights checked in the browser against the user's role slugs (`useCurrentUser().hasRole`). A small `TeamMemberProfile` schema holds per-person settings Blocks users lack.

**Pros**:
- Works today on documented Blocks features.
- Moving to Option 1 later changes the enforcement point, not the role model.

**Cons**:
- Data rights, cost hiding, the approval limit and location limits can be bypassed by calling the Data Gateway directly.

## Rationale

The PRD wants server enforcement, and only Blocks can provide it. Identity is fully covered by Blocks today, so it uses Blocks. Data rights cannot be enforced on the server until the two Blocks questions in the exit gate are answered. Option 2 would not change that, and it would duplicate IAM. Option 3 ships working role gating now and keeps one role model that Option 1 will enforce later.

