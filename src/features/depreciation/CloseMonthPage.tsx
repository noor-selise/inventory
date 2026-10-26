import * as React from "react"
import { CalendarCheck, CalendarX2, History, Lock, RotateCcw, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Link } from "@/app/router/navigation"
import { useCurrentUser, userDisplayName } from "@/app/providers/CurrentUserProvider"
import { KpiCard, KpiRow } from "@/components/app/data"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { COST_VIEWERS, DEPRECIATION_ADMINS } from "@/features/team/roles"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatDate, formatMoney } from "@/lib/format"
import { incomeYearLabel } from "./calc"
import { closeMonth, listRuns, previewMonth, reopenMonth } from "./actions"
import { monthLabel } from "./labels"

// Month close and reopen (spec 0028 AC-9, AC-10). Months close in order; a
// close or reopen that stopped halfway shows here for any admin to resume.
export function CloseMonthPage() {
  const { hasRole, user } = useCurrentUser()
  const isAdmin = hasRole(...DEPRECIATION_ADMINS)
  const seeCost = hasRole(...COST_VIEWERS)
  const by = userDisplayName(user) || "Unknown"
  const preview = useResource(() => previewMonth(), [])
  const runs = useResource(() => listRuns(), [])
  const [busy, setBusy] = React.useState(false)
  const [actionError, setActionError] = React.useState<string>()
  const [confirmReopen, setConfirmReopen] = React.useState(false)

  const data = preview.data
  const state = data?.state
  const currency = state?.company.homeCurrency ?? "USD"
  const money = (value: number) => (seeCost ? formatMoney(value, currency) : "Hidden")
  const total = (data?.rows ?? []).reduce((sum, row) => sum + row.total, 0)
  const count = (data?.rows ?? []).reduce((sum, row) => sum + row.count, 0)

  async function act(work: () => Promise<unknown>, done: string) {
    setBusy(true)
    setActionError(undefined)
    try {
      await work()
      toast.success(done)
    } catch (caught) {
      setActionError(errorMessage(caught))
    } finally {
      setBusy(false)
      setConfirmReopen(false)
      await Promise.all([preview.reload(), runs.reload()])
    }
  }

  if (preview.loading && !data) {
    return (
      <>
        <PageHeader title="Close month" />
        <LoadingRows rows={6} />
      </>
    )
  }

  if (!preview.error && !data) {
    return (
      <>
        <PageHeader title="Close month" description="Record each month's depreciation once, in order." />
        <SectionCard>
          <EmptyState
            icon={CalendarX2}
            message="Depreciation is not set up for this organization yet."
            action={
              <Button asChild variant="secondary">
                <Link to="/settings/company">Set the country in Company settings</Link>
              </Button>
            }
          />
        </SectionCard>
      </>
    )
  }

  const running = state && state.status !== "open"
  const yearLabel = data && state ? incomeYearLabel(data.period, state.setup.incomeYearStartMonth) : ""

  return (
    <>
      <PageHeader
        title="Close month"
        description="Closing a month writes one depreciation entry per asset in use. Closed months never change; reopen the latest one to fix a mistake."
        actions={
          isAdmin && state?.latestClosed && !running ? (
            <Button variant="secondary" onClick={() => setConfirmReopen(true)} disabled={busy}>
              <RotateCcw aria-hidden /> Reopen {monthLabel(state.latestClosed)}
            </Button>
          ) : null
        }
      />
      {preview.error ? <ErrorBanner message={preview.error} onRetry={() => void preview.reload()} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      {state ? (
        <KpiRow>
          <KpiCard label="Next month to close" value={monthLabel(state.status === "open" ? state.nextOpen : state.activePeriod)} hint={`Income year ${yearLabel}`} icon={CalendarCheck} />
          <KpiCard label="Latest closed" value={monthLabel(state.latestClosed)} hint={state.latestClosed ? "Entries up to here count" : "Nothing closed yet"} icon={Lock} />
          <KpiCard label="Assets to charge" value={count} hint="In use this month" />
          <KpiCard label="Depreciation" value={money(total)} hint={`For ${monthLabel(data?.period)}`} />
        </KpiRow>
      ) : null}

      {running && state ? (
        <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          <span className="min-w-0 flex-1">
            {state.status === "closing" ? "A close" : "A reopen"} of {monthLabel(state.activePeriod)} stopped before it finished. Asset changes wait until it is done.
          </span>
          {isAdmin ? (
            <Button size="sm" disabled={busy} onClick={() => void act(() => (state.status === "closing" ? closeMonth(by) : reopenMonth(by)), "Finished")}>
              {busy ? "Working…" : "Resume"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {data && state ? (
        <SectionCard
          title={`Preview: ${monthLabel(data.period)}`}
          description="What closing this month will write, per class. Rates come from each asset's first entry this income year."
          actions={
            isAdmin && !running ? (
              <Button disabled={busy || Boolean(data.blocked)} onClick={() => void act(() => closeMonth(by), `${monthLabel(data.period)} closed`)}>
                {busy ? "Closing…" : `Close ${monthLabel(data.period)}`}
              </Button>
            ) : null
          }
        >
          {data.blocked ? <p className="mb-3 text-sm text-muted-foreground">{data.blocked} You can close it once it ends.</p> : null}
          {data.rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Assets</TableHead>
                  <TableHead className="text-right">Depreciation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.classId}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{row.code}</span> {row.name}
                    </TableCell>
                    <TableCell className="text-right num">{row.count}</TableCell>
                    <TableCell className="text-right num">{money(row.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold num">{count}</TableCell>
                  <TableCell className="text-right font-semibold num">{money(total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={CalendarCheck} message="No asset is in use this month. Closing it still moves you to the next month." />
          )}
          {!isAdmin ? <p className="mt-3 text-xs text-muted-foreground">Only admins can close or reopen months.</p> : null}
        </SectionCard>
      ) : null}

      <SectionCard title="History" description="Every close and reopen, newest first." className="mt-6">
        {runs.data?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>By</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Assets</TableHead>
                <TableHead className="text-right">Depreciation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.data.map((run) => (
                <TableRow key={run.ItemId}>
                  <TableCell>{monthLabel(run.period)}</TableCell>
                  <TableCell>{run.action === "close" ? <Badge variant="success">Closed</Badge> : <Badge variant="warning">Reopened</Badge>}</TableCell>
                  <TableCell>{run.by}</TableCell>
                  <TableCell>{formatDate(run.at, state?.timeZone)}</TableCell>
                  <TableCell className="text-right num">{run.assetCount ?? 0}</TableCell>
                  <TableCell className="text-right num">{money(Number(run.total ?? 0))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState icon={History} message="No month has been closed yet." />
        )}
      </SectionCard>

      <Dialog open={confirmReopen} onOpenChange={setConfirmReopen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen {monthLabel(state?.latestClosed)}?</DialogTitle>
            <DialogDescription>
              Its depreciation entries are removed and every asset's value goes back to where it was before that month. You can then fix assets dated in it and close it again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmReopen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void act(() => reopenMonth(by), `${monthLabel(state?.latestClosed)} reopened`)}>
              {busy ? "Reopening…" : "Reopen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
