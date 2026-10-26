# Verify: Sign in, team and roles · spec 0003 · updated 2026-10-26
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Sign in as a Warehouse user → you can pick, pack, ship and receive; edit buttons are hidden on Products, Price lists, Customers and Vendors → AC-4
- [ ] Sign in as a Sales user → you can edit sales orders and customers; Confirm is hidden; cost columns are hidden in Reports, Sales order detail and PO detail → AC-4, AC-5 (interim UI hiding)
- [ ] Sign in as a Purchasing user → you can edit POs, vendors and products, receive, and see cost → AC-4
- [ ] Sign in as a Manager → you can confirm orders, review counts and override negative stock; the Team screen is hidden → AC-4
- [ ] Open Payments as each role → Admin, Manager, Sales and Purchasing can record payments; Warehouse, Production and Read only cannot → AC-4
- [ ] Trigger the daily reorder check with a product under its reorder point → only users with the Purchasing role get the alert email → AC-4 (role matrix, ALERT_ROLES)
- [ ] Deactivate a user, then reactivate them → they cannot sign in while deactivated, and can again after → AC-3
- [ ] As the only Admin, try to demote or deactivate yourself → the Team screen refuses → last Admin invariant
- [ ] Enroll an authenticator app on Settings, Security → a wrong code is rejected, a backup code works once → AC-6
- [ ] Approve a PO as a purchaser at their limit, then just above it, then as a non admin with no limit → approved, refused, refused → AC-9
- [x] Open any record → it shows who last changed it and when → AC-7

## Location limits (step 9b)
- [ ] On the Team screen, open a Warehouse user's settings and tick only location X → their row says "1 location only" → AC-8
- [ ] Sign in as that user → Stock, Lots, Adjustments, Counts, Reorder and the dashboard show only location X; sales orders and POs at Y are missing from the lists → AC-8
- [ ] Create a transfer from Y to X as an Admin → the limited user sees it on Transfers (the receiving end is allowed) → AC-8
- [ ] As the limited user, start a new transfer → "From" offers only X, "To" offers every active location → AC-8
- [ ] As the limited user, open a sales order at Y by its link → "No access to this location" → AC-8
- [ ] As the limited user, run Stock on hand with no location filter → only rows at X → AC-8
- [x] Give an Admin location limits → the boxes are disabled and the Admin still sees every location → AC-8
- [ ] Untick every location → the user sees every location again → AC-8
- [ ] Reload the app as the limited user → no flash of other locations while it loads → AC-8

## Commands
- [x] `pnpm typecheck && pnpm lint && pnpm build` → all pass → AC-4 (role module refactor, step 5b)
- [x] `grep -rnE 'const [A-Z_]+ = \["admin' src` → no matches outside `src/features/team/roles.ts` → AC-4 (one role module)
- [ ] `ORG_A_TOKEN=... ORG_B_TOKEN=... node scripts/checks/org-isolation-live.mjs` → prints `ok: a record in <A> is invisible from <B>` → AC-2 (needs the second organization; expected to stay unrun until it exists)

## Value sourcing
- [ ] Create a record while signed in to the second organization → its `OrganizationId` is that organization, not `default` → AC-2 (OrganizationId from the session)
- [ ] Edit a record → the audit line shows your name and the current time → AC-7 (Blocks system fields)
- [ ] Give a Sales user the Purchasing role as well → cost columns appear → AC-5 interim (cost hiding from `COST_VIEWERS`)
- [ ] Set a purchaser's limit in a home currency of BDT, then approve a PO in USD → the PO total is converted to home currency before the limit check → AC-9 (limit from `TeamMemberProfile.poApprovalLimit`, home currency)

## Expected to fail until the exit gate
- [ ] As a Sales user, read a product through the SDK → `averageCost` comes back masked → AC-5 (step 5c, blocked on Blocks)
- [ ] As a non admin, update your own `poApprovalLimit` through the SDK → refused → profile write rule (exit gate)

## Acceptance-criteria coverage
- AC-1 sign in: covered by every UI step (each starts with sign in)
- AC-2 company isolation: isolation script, OrganizationId value step
- AC-3 invite, deactivate, reactivate, role change: deactivate and reactivate step
- AC-4 role bundles: Warehouse, Sales, Purchasing, Manager, Payments, alert steps, build commands, one module grep
- AC-5 cost masking: interim UI step now; server step expected to fail until 5c
- AC-6 MFA: enroll step
- AC-7 last changed: record step, audit value step
- AC-8 location limits: Location limits steps (browser and query filter only, not server enforced)
- AC-9 approval limit: approval step, home currency value step
