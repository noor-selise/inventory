# 0027 · P1 choices for orders, reordering and reports

**Status**: Assumed
**Date**: 2026-10-19
**Authorized by**: noor-selise, during /develop

## Owed decision
Specs 0011 to 0015 list P1 criteria whose values have no named source: where a rep's "own customers only" flag and a purchaser's approval limit live, who holds the Confirm right, how the suggested reorder point gets its sales rate and safety stock, and how the nightly and background parts run while Blocks workflows cannot sign in (spec 0013 and 0014 chose workflows; live probes wrote nothing).

## Assumption built on
- **Per person settings**: the `TeamMemberProfile` schema from spec 0003 (`userId` unique, `poApprovalLimit`, `allowedLocationIds`, `isStockroomUser`), plus `ownCustomersOnly` Boolean and `dashboardWidgets` String array. Edited by admins on the Team screen. Checked in the app only (Blocks row policy grammar is undocumented, L6).
- **Rep restriction (0011 AC-8)**: a user with `ownCustomersOnly` sees only orders whose `salesRepUserId` is theirs and customers whose `salesRepUserId` is theirs.
- **Confirm right (0011 AC-9)**: roles `admin` and `manager`. An order is held (`needsConfirmation`) when the customer's open balance in the order currency plus this order's total exceeds `Customer.creditLimit`.
- **Approval (0012 AC-3)**: a PO is Unapproved until a user whose `poApprovalLimit` is at least the PO total in home currency approves it; receiving waits for approval. A PO saved by someone whose own limit covers it is approved on save. An admin with no limit set has no ceiling, so no company is left unable to approve. Raising an approved PO's total sends it back to Unapproved.
- **Suggested reorder point (0014 AC-5)**: units picked in the last 90 days ÷ 90 × preferred `VendorItem.leadTimeDays` + `ReorderSetting.safetyStock` (new field, default 0). Shown as a suggestion with one click to apply.
- **No workflows yet**: the first signed in user each day runs the reorder check, guarded by a unique `WorkflowRun.runKey` so it runs once. Alerts show in app on the home page Low stock card until restocked, and go by email through Blocks mail (purpose `low-stock-alert`) to active users with the `purchasing` role. A notifier push is left out: notify demands a notification configuration, connection id and response key and value, and Blocks publishes no channel values to configure it. Background reports run in the browser with a `ReportJob` record and a CSV in Blocks storage (removed 2026-10-29; see spec 0015 AC-5). Dashboard widgets are saved per user in `TeamMemberProfile.dashboardWidgets`.
- **Blocks storage for background reports**: the app roles were granted `Get Pre-Signed Upload URL` and `Get File` (confirmed by the engineer on 2026-10-20); files are created private to their creator.
- **Clearing a field**: Blocks ignores `null` in an update. Text fields are cleared with `""`, "no approval limit" is stored as -1, "no credit limit" as 0. Dates cannot be cleared.
- **Cost View (0015 AC-4)**: roles `admin`, `manager`, `purchasing` until field masking from spec 0003 exists.
- **Company organization (0003 AC-2)**: multi organization mode is on (enabled by the engineer). The first company stays in Blocks' built in `default` organization, where its users and every existing record already are (a record's `OrganizationId` cannot be changed). Companies that sign up later get their own organization. The app shows the organization from the token's `org_id` claim and switches with `auth.switchOrganization` when a person belongs to more than one.
- **Two step login (0003 AC-6)**: tenant MFA on with authenticator app and email code, 10 backup codes, not required for everyone; the admin role holds `mfa-configs` and `mutate-mfa-configs` so admins can change the rule in the app.
- **Manufacture orders (0014 AC-1, AC-3)**: the method can be saved, but drafting MOs waits for manufacturing (spec 0020).

## Code area
`src/features/sales/`, `src/features/purchasing/`, `src/features/reorder/`, `src/features/reports/`, `src/features/dashboard/`, `src/features/team/`, `blocks/data/schemas/`

## Requirements
- 0011 AC-8 to AC-11, 0012 AC-3 and AC-7, 0014 AC-4 and AC-5, 0015 AC-5 and AC-6.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect orders, reordering and reports P1` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
