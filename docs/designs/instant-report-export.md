# Instant report export

*   **Author:** noor-selise
*   **Status:** Proposed
*   **Date:** 2026-10-29

--------------------------------------------------------------------------------

## Overview

The Reports page (`/reports`) has an Export menu with three items: "CSV file", "Print or PDF" and "Run in the background". "Run in the background" adds a "Background reports" card above the results, listing the person's last 10 runs with a status, date, row count and Download button.

This design removes "Run in the background", the card, and the browser code that runs those jobs. CSV and Print or PDF stay as the only exports. They already build the file at once from the rows the page has loaded. The design makes them safe to rely on:

*   They are disabled while the report is reloading, so they never export old rows.
*   The CSV is protected against spreadsheet formula injection and opens correctly in Excel.
*   The download is reliable and confirms with a toast.

A real background export, running on the server and sending a link by email or notification, is deferred until the platform can run it.

Source brief: the EGM concepts brief `egm/drafts/concepts_brief_report-export.md` (local, not committed). All six Goldfish brainstorm reviewers agreed with removal.

## The Problem

"Run in the background" is not background work. `startBackgroundReport()` (`src/features/reports/jobs.ts:88`) runs `report.load` a second time **in the same browser tab**. That is the same load the page already did, so the tab must stay open. Then it uploads a CSV to Blocks storage and records a `ReportJob`. As a result:

1.  **No capacity is gained.** The row limit is the same as the screen's, and it is not faster.
2.  **The work doubles.** There is a second full read from Blocks and a second copy of the rows in memory, plus three record writes and one upload.
3.  **The file can be wrong.** It ignores Group by, so a grouped report gives a file that does not match the screen (`ReportsPage.tsx:135` compared with `:145`).
4.  **It takes more steps.** You run it, wait, find the card and click Download. "CSV file" takes one click.
5.  **The card stays on the page.** It sits above the results whenever the person has any past run.

It exists because spec 0015 AC-5 asked for long reports to run in the background, through a server workflow. Spec 0027 found that Blocks workflows cannot sign in, so the job was moved into the browser. That move kept the feature's cost and lost its purpose.

Real products split exports by size:

*   **Google Sheets, Linear issue views, Notion:** export at once from what is on screen.
*   **Shopify and Stripe:** build large exports on the server and send a link by email. Stripe keeps past exports on their own page, never on the list you export from.

Removing the background path makes CSV and Print the only exports, and those two have problems of their own. During a filter change they stay enabled while old rows are still on screen. A PDF taken then puts the new filter labels above old numbers (`ReportsPage.tsx:159`). `toCsv` also has no guard against formula injection.

## Goals

*   The Export menu shows exactly two items, "CSV file" and "Print or PDF". The Background reports card no longer renders for anyone, including people with past runs.
*   The browser job code is gone. `BackgroundJobs.tsx` and `jobs.ts` are deleted, and `toCsv` moves to its own module.
*   CSV and Print are disabled while the report loads or reloads. The menu shows why: "Updating the report…" while loading, "No rows to export" when empty.
*   A CSV opened in Excel or Google Sheets:
    *   never runs a cell as a formula;
    *   shows non-English names correctly;
    *   keeps a cell with a line break as one cell.
*   Each CSV download confirms with a toast that gives the file name and row count, and a failure shows an error toast.
*   Cost columns are still left out of every export for people without cost access (spec 0015 AC-4), and a live check still proves it.
*   The docs and specs that describe background reports say it is deferred, with a measurable trigger for bringing it back.

## Non-Goals

*   Deleting the `ReportJob` schema (`blocks/data/schemas/ReportJob.json`), its four policies in `blocks/data/rules.json`, its index in `blocks/data/indexes.json`, existing records or stored files. The Blocks storage permissions granted to app roles stay too.
*   A server-side background export.
*   Fixing the silent 49,000-row cap in `all()` (`definitions.ts:52-61`). This is follow-up 1.
*   Fixing ratio columns (margin, days, cost) being added up in grouped rows. This is follow-up 2.
*   Making the on-screen load faster or cancellable.
*   A size limit on Print or PDF.
*   An export audit trail.
*   Changes to saved reports, filters or column choice.

## Open Questions

None. Every point the brainstorm raised was decided in the brief, and the user accepted all of them on 2026-10-29.

## Critical User Journeys (CUJs)

### CUJ 1: Export a grouped report to CSV

*   **Given**: A person on Sales by product, with This month selected and Group by set to Location. The report has loaded.
*   **When**: They open Export and pick "CSV file".
*   **Then**:
    *   The browser downloads `sales-by-product-2026-10-29.csv` at once.
    *   The file has one row per location, and its columns match the table header.
    *   A toast says "Downloaded sales-by-product-2026-10-29.csv (4 rows)".
    *   Nothing appears above the results.

### CUJ 2: Try to export during a filter change

*   **Given**: A loaded report for Location A.
*   **When**: The person changes Location to B and opens Export before the new rows arrive.
*   **Then**:
    *   "CSV file" and "Print or PDF" are disabled, and the menu shows "Updating the report…".
    *   Once Location B's rows load, both items are enabled again.
    *   A PDF printed after that has the "Location B" heading over Location B's rows.

### CUJ 3: A person who used background reports before

*   **Given**: A person with past `ReportJob` records, including one stuck "in progress".
*   **When**: They open `/reports`.
*   **Then**:
    *   No card shows, and the page loads with no error.
    *   The Export menu has two items.
    *   Their old files cannot be reached from the app (an accepted loss). They export again with "CSV file".

### CUJ 4: Export a report without cost access

*   **Given**: A person whose role is not in `COST_VIEWERS`, on Sales profit.
*   **When**: They export CSV, grouped or not, or print.
*   **Then**: The file has no cost, profit or margin column.

### CUJ 5: A product name that looks like a formula

*   **Given**: A product named `=HYPERLINK("http://example.com","x")` appears in a report.
*   **When**: The CSV is opened in Excel or Google Sheets.
*   **Then**:
    *   The cell shows the text `=HYPERLINK(...)` and does not run as a formula.
    *   Negative money values in the same file are still numbers.

## Technical Plan (Architecture)

### Before and after

```text
BEFORE
ReportsPage ── run() ── report.load ──► rows ──► shown/displayColumns ──► table
     │                                                   ├──► exportCsv() ─► toCsv (jobs.ts) ─► download
     │                                                   └──► printPdf()  ─► new window
     └── runInBackground() ─► startBackgroundReport (jobs.ts)
                                 ├─ ReportJob.create / update ×2
                                 ├─ report.load AGAIN (same tab, raw rows, ignores Group by)
                                 └─ upload CSV to Blocks storage
     └── <BackgroundJobs> ─► ReportJob.list(10) ─► stale sweep ─► Download (jobDownloadUrl)

AFTER
ReportsPage ── run() ── report.load ──► rows ──► shown/displayColumns ──► table
                                                         ├──► exportCsv() ─► toCsv (csv.ts) ─► download + toast
                                                         └──► printPdf()  ─► new window
  (both disabled while `running` or when `shown` is empty)

ReportJob schema, rules, index, records, files: unchanged, no reader or writer in the app.
```

### Components

**`src/features/reports/csv.ts` (new).** This is the pure CSV builder, moved from `jobs.ts`. It keeps the signature `toCsv(rows, columns)` and the rule that it writes only the columns it is given, which is how cost columns stay out (AC-4). Three changes to cell output, applied per cell in this order:

1.  **Formula guard.** Applies only when the cell value is a JavaScript string, never to numbers. If the first character is one of `=`, `+`, `-`, `@`, a tab or a carriage return, a single quote `'` goes in front. This is the OWASP CSV-injection rule. Report rows store amounts as numbers (`ReportRow` is `string | number | null`), so negative amounts are untouched.
2.  **Quoting.** A cell is quoted when it contains `"`, `,`, `\n` or `\r`. The current rule misses `\r`. Inner `"` doubles as now.
3.  **Byte-order mark.** The returned string starts with `﻿` (UTF-8 BOM), so Excel reads the file as UTF-8.

The README invariant "`toCsv` is pure" still holds.

**`ReportsPage.tsx` export menu.** The Export menu items get one shared disabled rule and one hint line:

```text
exportBlocked = running || shown.length === 0
hint          = running ? "Updating the report…" : shown.length === 0 ? "No rows to export" : null
```

*   Both items use `disabled={exportBlocked}`.
*   When `hint` is set, a muted, non-interactive line shows it at the top of the menu content.
*   The Export trigger keeps `disabled={!data}`, so it stays disabled until the shared lookups load.

**`exportCsv()`.**

1.  Wrap the work in try/catch.
2.  Add the link to the page before `click()`, then remove it.
3.  Revoke the object URL after a short delay instead of straight away.
4.  On success: `toast.success("Downloaded <fileName> (<n> rows)")`, where n is `shown.length` formatted with `formatNumber`.
5.  On failure: `toast.error(errorMessage(caught))`.

The file name keeps today's pattern, `<report.key>-<YYYY-MM-DD>.csv`.

**`printPdf()`.** Unchanged. The disabled rule above covers the old-rows case.

### Data and permissions

Nothing in Blocks changes and nothing is pushed:

*   The `ReportJob` schema, policies and index stay as deployed.
*   Records stuck in "in progress" or "not started" stay that way.
*   Stored files stay private to their creators.

Rolling back is a plain `git revert` of the one commit, with no data step.

### Trigger for bringing background export back

Bring it back when both are true:

*   **(a)** Blocks workflows can sign in and run on the server. This is spec 0027's blocker.
*   **(b)** Reports hit the browser's limit, measured by `all()` reaching its 49,000-row cap. Follow-up 1 makes that visible.

It also needs Blocks mail or a notifier channel set up to send the link. The pattern then is a server job, an email or notification with a link, and optionally a separate Exports page. It is never a card on the Reports page. Any new runner must ignore `ReportJob` records started before this change ships.

## Alternatives Considered

### Alternative A: Keep the feature, replace the card with a "ready" toast

*   **Pros**: There is no lasting card, and there is still a stored copy of the file.
*   **Cons**: The job still runs in the same tab, still needs the tab open, still loads the data twice and still ignores Group by.
*   **Reason for Rejection**: It hides the main problem instead of removing it.

### Alternative B: Hide the card only, or hide the menu item only

*   **Pros**: It is the smallest code change.
*   **Cons**:
    *   Hiding the card leaves runs with no way to download them.
    *   Hiding the item leaves the card showing the last 10 runs to anyone who has them (`BackgroundJobs.tsx:39`).
    *   Either way, two export paths with different output stay in the code.
*   **Reason for Rejection**: Each option leaves the feature broken or half visible.

### Alternative C: Keep `jobs.ts` for the future server export

*   **Pros**: The code is ready if background export comes back.
*   **Cons**: A server export has a different lifecycle: a server runner, email or a notification, and no stale-tab sweep. Code with no caller looks live and drifts from `definitions.ts`. `p1-live.mjs` check 9 would keep passing for a feature no screen can reach, creating a record and a file on every run.
*   **Reason for Rejection**: Git history keeps the code. It does not fit the future it would be kept for.

### Alternative D: Also delete the `ReportJob` schema, rules and index

*   **Pros**: There is no dormant data model.
*   **Cons**: Dropping a Blocks schema cannot be undone. The four policies in `rules.json` are pinned to the schema id, so a restored schema gets a new id and is public until the rules are rewritten. `scripts/blocks-data-deploy.mjs` only adds, so removing the JSON would not drop the remote schema anyway. `blocks/data/` also has uncommitted edits from other work right now.
*   **Reason for Rejection**: It adds risk and gains nothing.

### Alternative E: Export waits for the load, then downloads

*   **Pros**: The person can click Export at any time.
*   **Cons**: It needs async state for a pending export and handling for cancel and supersede. Google Sheets and Linear never need this, because their data is already there.
*   **Reason for Rejection**: Disabling the items with a visible reason is simpler and enough.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security & Privacy**:
    *   Cost masking (AC-4) is unchanged, because `toCsv` still receives only the allowed columns, and the replaced live check still proves it.
    *   The formula guard closes a CSV-injection path. Product, customer and vendor names are user input that ends up in files other people open.
*   **Performance**: There are fewer Blocks calls, one less full report load per former background run. The on-screen load is unchanged.
*   **Rollout & Rollback**: The change is one commit with no data migration. Revert the commit to roll back.
*   **Accepted losses**:
    *   Old background files cannot be reached from the app.
    *   Stuck job records stay "in progress".
    *   Exports leave no audit record.
    *   A flat export needs Group by cleared first.

--------------------------------------------------------------------------------

### Additional Resources

*   The EGM concepts brief (`egm/drafts/concepts_brief_report-export.md`, local), with the six Goldfish brainstorm reviews folded in.
*   `docs/specs/0015-reports-dashboards.md` (AC-4, AC-5) and `docs/specs/0027-orders-reports-p1-choices.md` (why background runs in the browser).
*   OWASP, "CSV Injection".

### Future Improvements

*   **Follow-up 1, truncation signal.** `all()` returns whether it hit the 49-page cap, or `totalCount` versus the rows loaded. The page then shows "Partial: first 49,000 rows" in place of "Export CSV for all of them", and the export toast says the file is partial. This is also the evidence for the trigger above.
*   **Follow-up 2, grouped ratio columns.** In grouped mode, leave out margin, days and cost, or work them out again, instead of adding them up. This applies on screen and in files.
*   **Server-side export**, when the trigger above is met.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

All changes go in one commit. Do not stage any other file: the working tree holds unrelated, uncommitted spec 0029 work, including `change.md` and `blocks/data/rules.json`. Commit `change.md` only if its other pending lines have been committed first. Otherwise, add this one line and stage it by hunk.

### Target Files to Create/Modify

#### 1. `src/features/reports/csv.ts` (Create)

*   **Type / Scope**: TypeScript module. This is a pure function.
*   **Proposed Changes**:
    *   Export `toCsv(rows: ReportRow[], columns: Pick<ReportColumn, "key" | "label">[]): string`, moved from `jobs.ts:44-48` with its AC-4 doc comment.
    *   Add a private `cell(value)` with this logic:
        1.  null or undefined becomes `""`.
        2.  A number becomes `String(value)`.
        3.  A string gets the formula-guard prefix `'` if it starts with `= + - @ \t \r`.
        4.  The result is quoted if it contains `" , \n \r`, with inner `"` doubled.
    *   The header row uses the same `cell` on labels.
    *   The output is `"﻿" + lines.join("\n")`.
    *   Import only types from `./definitions`.
*   **Why**: `toCsv` is the one live part of `jobs.ts`. It needs a home that is not tied to the job runner, and it now carries the CSV safety rules.

#### 2. `src/features/reports/jobs.ts` (Delete)

*   **Why**: Everything else in it serves the browser job runner: `startBackgroundReport`, `uploadCsv`, `jobDownloadUrl`, `isStale`, `STALE_MINUTES`, `JOB_STATUSES`, `reportJobs` and the `ReportJob` type.

#### 3. `src/features/reports/BackgroundJobs.tsx` (Delete)

*   **Why**: This is the card being removed. It was the only reader of `ReportJob`.

#### 4. `src/features/reports/ReportsPage.tsx` (Modify)

*   **Type / Scope**: React page.
*   **Proposed Changes**:
    *   **Header comment** (lines 27-31): drop "or run a long one in the background", and change "AC-1 to AC-5" to "AC-1 to AC-4 (AC-5 deferred)".
    *   **Imports**:
        *   Remove `Clock` (line 2) and `DropdownMenuSeparator` (line 11, used only at line 283).
        *   Remove the `BackgroundJobs` import (line 24).
        *   Replace line 25 with `import { toCsv } from "./csv"`.
    *   **State**: remove `jobsVersion` (line 77).
    *   **Functions**: remove `runInBackground()` (lines 132-142).
    *   **`exportCsv()`** (lines 144-151): add try/catch and append the link to the page before `click()`. Delay `URL.revokeObjectURL` with `window.setTimeout(..., 1000)`. Show a success toast with the file name and `formatNumber(shown.length)` rows, and an error toast through `errorMessage`.
    *   **Export state**: derive `exportBlocked` and `exportHint` as described in the Technical Plan.
    *   **Menu** (lines 276-287):
        *   When `exportHint` is set, render it first as a muted, non-interactive line. Use `DropdownMenuLabel` with muted text classes, since it is already imported.
        *   Both items take `disabled={exportBlocked}`.
        *   Remove the separator and the "Run in the background" item.
    *   **Card**: remove `<BackgroundJobs version={jobsVersion} />` (line 347).
*   **Why**: This is the visible change, plus the old-rows guard and a reliable download.

#### 5. `src/features/reports/README.md` (Modify)

*   **Type / Scope**: Directory README.
*   **Proposed Changes**:
    *   **Overview**: change it to "Declarative report catalogue with an on-screen viewer, CSV export and print."
    *   **Interface**:
        *   Replace the `jobs.ts` line with "`toCsv` (`csv.ts`)".
        *   Remove `BackgroundJobs` from the UI line.
    *   **Invariants**:
        *   Remove the `isStale` invariant.
        *   Keep the cost-column invariant, naming `csv.ts`.
        *   Add: "Exports are built only from `shown` and `displayColumns` and are disabled while a run is in progress; no export path loads the report again."
        *   Add: "`toCsv` prefixes text cells starting with `= + - @` tab or CR with `'`, and starts the file with a UTF-8 BOM."
    *   **Side Effects**: remove the background-job sentence, and say that `ReportJob` is a dormant collection with no reader or writer (spec 0015 AC-5 deferred).
*   **Why**: The README is what the next engineer reads first.

#### 6. `scripts/checks/p1-live.mjs` (Modify)

*   **Type / Scope**: Live check script, run against the dev tenant.
*   **Proposed Changes**:
    *   Line 39: replace `const jobs = await load(".../jobs.ts")` with `const { toCsv } = await load("/src/features/reports/csv.ts")`.
    *   Replace step 9 (lines 293-316) with "9. Export file (spec 0015 AC-4)", which does the following:
        1.  Pick the first report with a cost column (as now) and build `noCost`.
        2.  Load its rows through `profitReport.load({}, lookups)`.
        3.  Build `toCsv(rows, noCost)`.
        4.  Assert that the first line, after the BOM is stripped, equals the `noCost` labels joined by commas.
        5.  Assert that no cost label appears.
        6.  Assert that the file starts with `﻿`.
        7.  Assert that `toCsv([{ name: "=1+1", amount: -5 }], [{key:"name",label:"Name"},{key:"amount",label:"Amount"}])` has the data line `'=1+1,-5`.
    *   No records or files are created, so the step needs no cleanup.
*   **Why**: The old step imports the deleted module. It was also the only automated proof of AC-4 for exported files, so the check is rewritten, not dropped.

#### 7. `README.md` (Modify)

*   **Type / Scope**: Root README.
*   **Proposed Changes**:
    *   Line 163: "The 20 core reports, saved reports, CSV and print export".
    *   Line 186: replace "saved and background reports" with "saved reports (background export deferred)".
    *   Line 212: say the storage grant was made for background reports, now deferred, and is kept for a later server export.
    *   Line 213: drop "and background reports".
    *   Line 214: say the file-creator note applies to old background files, now deferred.
    *   Line 251: replace "background report (10 checks)" with "export file (10 checks)".
*   **Why**: These lines describe a feature that will no longer be visible.

#### 8. `docs/scope/scope.md` (Modify)

*   **Type / Scope**: Product scope.
*   **Proposed Changes**:
    *   Line 196: untick the background-reports half. Split the line into "[ ] Background reports: deferred until a server runner exists (design instant-report-export)" and "[x] dashboard widgets per person".
    *   Line 190: leave it as it is ("background reports ... later" is already true).
*   **Why**: The scope must not claim a shipped feature that was removed.

#### 9. `docs/specs/0015-reports-dashboards.md` (Modify)

*   **Type / Scope**: Spec. Normally `/architect` owns spec edits; the user approved making them in this change.
*   **Proposed Changes**:
    *   AC-5 (line 21): append "**Deferred (2026-10-29)**: the in-browser version was removed because it reloaded the report in the same tab and ignored Group by. It returns as a server job with an email or notification link once Blocks workflows can sign in and reports reach the browser load cap. See `docs/designs/instant-report-export.md`."
    *   Add a one-line "(deferred, see AC-5)" note at the lines that describe background reports: the decision (37), the Blocks fit row (53), the test (81) and the build plan (85, 89).
*   **Why**: `/develop` and `/check` read the spec. An unmet AC must be marked as a deliberate deferral.

#### 10. `docs/specs/0027-orders-reports-p1-choices.md` (Modify)

*   **Type / Scope**: Spec.
*   **Proposed Changes**:
    *   Line 16: after "Background reports run in the browser with a `ReportJob` record and a CSV in Blocks storage.", add "(Removed 2026-10-29; see spec 0015 AC-5.)"
    *   Line 17: keep it as history.
*   **Why**: The decision was replaced, not wrong, so it stays recorded.

#### 11. `change.md` (Modify)

*   **Type / Scope**: Changelog.
*   **Proposed Changes**: add under Unreleased: "Reports export at once: removed Run in the background and the Background reports card; CSV and Print are disabled while a report updates, CSV cells that look like formulas are escaped and the file opens in Excel with the right characters (by noor-selise, 2026-10-29)".
*   **Why**: This is the release note for a removed feature.

#### 12. `docs/designs/instant-report-export.md` (Create)

*   **Type / Scope**: Design doc, this file once finalized.
*   **Why**: It is the durable record that the spec notes link to.

Files deliberately **not** changed: `blocks/data/schemas/ReportJob.json`, `blocks/data/rules.json`, `blocks/data/indexes.json` and `src/features/reports/definitions.ts`.

### Verification Plan

*   **Compilation/Build**: `pnpm typecheck`.
*   **Static Analysis & Linting**: `pnpm lint`.
*   **Reference sweep**: the type check does not cover `.mjs` files, so run:
    `rg -n "jobs\.ts|startBackgroundReport|reportJobs|jobDownloadUrl|isStale|BackgroundJobs|Run in the background" src scripts docs README.md`.
    Expect only the deferral notes and this design.
*   **Unit Tests**: the repo has no test script. The `toCsv` behaviour is asserted in the rewritten `p1-live.mjs` step 9.
*   **E2E/Integration**: `node scripts/checks/p1-live.mjs` against the dev tenant. All 10 checks pass.
*   **Manual (browser preview)**: walk CUJ 1 to CUJ 5. Also confirm:
    *   A report with more than 2,000 rows exports every loaded row.
    *   The page loads with no console errors for a user who has past `ReportJob` records.
*   **Graph**: `graphify update .` after the code changes.

--------------------------------------------------------------------------------

*Drafted with EGM*
