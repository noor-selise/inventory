import * as React from "react"
import { ChartColumn, Clock, Download, Printer, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { CheckboxField, SelectField, TextField } from "@/components/app/form"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { collection, type Entity } from "@/lib/blocks/data"
import { COST_VIEWERS, useOrderLookups } from "@/features/sales/lookups"
import { headClass } from "@/features/sales/OrderBits"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatDate, formatMoney, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { REPORTS, type ReportColumn, type ReportFilters, type ReportRow } from "./definitions"
import { BackgroundJobs } from "./BackgroundJobs"
import { startBackgroundReport, toCsv } from "./jobs"

// Reports (spec 0015 AC-1 to AC-5): pick a report, filter, group, choose
// columns, export CSV or print to PDF, save the setup for the team, or run a
// long one in the background. Cost columns never show, print or export for
// users without cost access.

type SavedReport = Entity & { name: string; reportKey: string; filters: string; columns: string[]; isShared: boolean; ownerId: string }
const savedReports = collection<SavedReport>("SavedReport", ["name", "reportKey", "filters", "columns", "isShared", "ownerId"])

function format(value: ReportRow[string], column: ReportColumn, currency: string) {
  if (value == null || value === "") return ""
  if (column.type === "money") return formatMoney(Number(value), currency)
  if (column.type === "number") return formatNumber(Number(value))
  if (column.type === "date") return formatDate(String(value))
  return String(value)
}

export function ReportsPage() {
  const { hasRole, user } = useCurrentUser()
  const seeCost = hasRole(...COST_VIEWERS)
  const lookups = useOrderLookups()
  const saved = useResource(() => savedReports.list({ sort: { name: 1 }, pageSize: 500 }), [])
  const [key, setKey] = React.useState(REPORTS[0].key)
  const report = REPORTS.find((item) => item.key === key) ?? REPORTS[0]
  const allowed = report.columns.filter((column) => seeCost || !column.cost)
  const [filters, setFilters] = React.useState<ReportFilters>({})
  const [visible, setVisible] = React.useState<string[]>(allowed.map((column) => column.key))
  const [groupBy, setGroupBy] = React.useState("")
  const [rows, setRows] = React.useState<ReportRow[]>()
  const [running, setRunning] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const [saveName, setSaveName] = React.useState("")
  const [share, setShare] = React.useState(true)
  const [jobsVersion, setJobsVersion] = React.useState(0)
  const data = lookups.data
  const currency = data?.homeCurrency ?? "USD"

  function choose(nextKey: string, preset?: { filters?: ReportFilters; columns?: string[] }) {
    const next = REPORTS.find((item) => item.key === nextKey) ?? REPORTS[0]
    setKey(next.key)
    setFilters(preset?.filters ?? {})
    const nextAllowed = next.columns.filter((column) => seeCost || !column.cost).map((column) => column.key)
    setVisible(preset?.columns?.filter((column) => nextAllowed.includes(column)) ?? nextAllowed)
    setGroupBy("")
    setRows(undefined)
  }

  async function run() {
    if (!data) return
    setRunning(true)
    setError(undefined)
    try {
      setRows(await report.load(filters, data))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setRunning(false)
    }
  }

  // Cost columns are dropped here, before display, print and export.
  const columns = allowed.filter((column) => visible.includes(column.key))
  const shown = React.useMemo(() => {
    if (!rows) return []
    if (!groupBy) return rows
    const groups = new Map<string, ReportRow>()
    for (const row of rows) {
      const groupKey = String(row[groupBy] ?? "")
      const entry = groups.get(groupKey) ?? { [groupBy]: groupKey, __count: 0 }
      entry.__count = Number(entry.__count) + 1
      for (const column of allowed) if (column.type === "number" || column.type === "money") entry[column.key] = Number(entry[column.key] ?? 0) + Number(row[column.key] ?? 0)
      groups.set(groupKey, entry)
    }
    return [...groups.values()]
  }, [rows, groupBy, allowed])
  const displayColumns = groupBy ? [allowed.find((column) => column.key === groupBy)!, ...columns.filter((column) => column.key !== groupBy && (column.type === "number" || column.type === "money"))] : columns
  const totals = Object.fromEntries(displayColumns.filter((column) => column.type === "number" || column.type === "money").map((column) => [column.key, shown.reduce((sum, row) => sum + Number(row[column.key] ?? 0), 0)]))

  async function runInBackground() {
    if (!data || !user) return
    try {
      const { done } = await startBackgroundReport({ report, filters, columns, lookups: data, ownerId: String(user.itemId ?? user.email ?? "") })
      toast.success(`${report.title} is running in the background. Keep this tab open until it finishes.`)
      setJobsVersion((value) => value + 1)
      void done.then(() => setJobsVersion((value) => value + 1))
    } catch (caught) {
      toast.error(errorMessage(caught))
    }
  }

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(shown, displayColumns)], { type: "text/csv" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `${report.key}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function printPdf() {
    const win = window.open("", "_blank", "noopener=no")
    if (!win) return toast.error("Allow pop ups to print the report.")
    const cell = (value: string, right: boolean) => `<td style="padding:4px 8px;border-bottom:1px solid #ddd;${right ? "text-align:right" : ""}">${value.replace(/</g, "&lt;")}</td>`
    const numeric = (column: ReportColumn) => column.type === "number" || column.type === "money"
    win.document.write(`<!doctype html><html><head><title>${report.title}</title><style>body{font:12px system-ui;margin:24px}table{border-collapse:collapse;width:100%}th{text-align:left;padding:4px 8px;border-bottom:2px solid #333}</style></head><body>
      <h1 style="font-size:18px">${report.title}</h1><p>${[filters.from && `From ${filters.from}`, filters.to && `to ${filters.to}`].filter(Boolean).join(" ")}</p>
      <table><thead><tr>${displayColumns.map((column) => `<th style="${numeric(column) ? "text-align:right" : ""}">${column.label}</th>`).join("")}</tr></thead>
      <tbody>${shown.map((row) => `<tr>${displayColumns.map((column) => cell(format(row[column.key], column, currency), numeric(column))).join("")}</tr>`).join("")}</tbody></table>
      <script>window.onload=()=>window.print()</script></body></html>`)
    win.document.close()
  }

  async function saveReport() {
    if (!saveName.trim() || !user) return
    try {
      await savedReports.create({ name: saveName.trim(), reportKey: report.key, filters: JSON.stringify(filters), columns: visible, isShared: share, ownerId: String(user.itemId ?? user.email ?? "") })
      toast.success("Report saved")
      setSaveName("")
      void saved.reload()
    } catch (caught) {
      toast.error(errorMessage(caught))
    }
  }

  const me = String(user?.itemId ?? user?.email ?? "")
  const mySaved = (saved.data?.items ?? []).filter((item) => item.reportKey !== "probe" && (item.isShared || item.ownerId === me))
  const options = {
    locations: (data?.locations ?? []).map((row) => ({ value: row.ItemId, label: row.name })),
    products: (data?.products ?? []).map((row) => ({ value: row.ItemId, label: row.name })),
    customers: (data?.customers ?? []).map((row) => ({ value: row.ItemId, label: row.name })),
    vendors: (data?.vendors ?? []).map((row) => ({ value: row.ItemId, label: row.name })),
  }

  return (
    <>
      <PageHeader title="Reports" description="The core sales, purchasing and inventory reports. Totals are worked out in your browser from the live records, in your home currency unless a column says otherwise." />
      {lookups.error ? <ErrorBanner message={lookups.error} onRetry={lookups.reload} /> : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-4">
          {(["Sales", "Purchasing", "Inventory"] as const).map((group) => (
            <nav key={group} aria-label={`${group} reports`} className="flex flex-col gap-1">
              <p className="px-2 text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">{group}</p>
              {REPORTS.filter((item) => item.group === group).map((item) => (
                <button key={item.key} type="button" onClick={() => choose(item.key)} className={cn("rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted", item.key === key && "bg-muted font-semibold")}>
                  {item.title}
                </button>
              ))}
            </nav>
          ))}
          {mySaved.length ? (
            <nav aria-label="Saved reports" className="flex flex-col gap-1">
              <p className="px-2 text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">Saved</p>
              {mySaved.map((item) => (
                <div key={item.ItemId} className="flex items-center gap-1">
                  <button type="button" className="flex-1 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => choose(item.reportKey, { filters: JSON.parse(item.filters || "{}"), columns: item.columns })}>
                    {item.name}
                    {item.isShared ? <span className="text-xs text-muted-foreground"> · shared</span> : null}
                  </button>
                  {item.ownerId === me ? (
                    <Button size="icon" variant="ghost" aria-label={`Delete ${item.name}`} onClick={() => void savedReports.remove(item.ItemId).then(saved.reload)}>
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </div>
              ))}
            </nav>
          ) : null}
        </aside>
        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard title={report.title} description={report.description}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {report.filters.includes("date") ? (
                <>
                  <TextField id="report-from" label="From" type="date" value={filters.from ?? ""} onChange={(from) => setFilters((current) => ({ ...current, from }))} />
                  <TextField id="report-to" label="To" type="date" value={filters.to ?? ""} onChange={(to) => setFilters((current) => ({ ...current, to }))} />
                </>
              ) : null}
              {report.filters.includes("location") ? <SelectField id="report-location" label="Location" options={options.locations} value={filters.locationId ?? ""} onChange={(locationId) => setFilters((current) => ({ ...current, locationId }))} allowNone /> : null}
              {report.filters.includes("product") ? <SelectField id="report-product" label="Product" options={options.products} value={filters.productId ?? ""} onChange={(productId) => setFilters((current) => ({ ...current, productId }))} allowNone /> : null}
              {report.filters.includes("customer") ? <SelectField id="report-customer" label="Customer" options={options.customers} value={filters.partyId ?? ""} onChange={(partyId) => setFilters((current) => ({ ...current, partyId }))} allowNone /> : null}
              {report.filters.includes("vendor") ? <SelectField id="report-vendor" label="Vendor" options={options.vendors} value={filters.partyId ?? ""} onChange={(partyId) => setFilters((current) => ({ ...current, partyId }))} allowNone /> : null}
              <SelectField id="report-group" label="Group by" options={allowed.filter((column) => column.type === "text").map((column) => ({ value: column.key, label: column.label }))} value={groupBy} onChange={setGroupBy} allowNone />
            </div>
            <fieldset className="mt-4">
              <legend className="mb-2 text-sm font-semibold">Columns</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {allowed.map((column) => (
                  <label key={column.key} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={visible.includes(column.key)} onCheckedChange={(value) => setVisible((current) => (value === true ? [...current, column.key] : current.filter((item) => item !== column.key)))} />
                    {column.label}
                  </label>
                ))}
              </div>
              {!seeCost && report.columns.some((column) => column.cost) ? <p className="mt-2 text-xs text-muted-foreground">Cost and profit columns are hidden for your role.</p> : null}
            </fieldset>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void run()} disabled={running || !data}>
                <ChartColumn aria-hidden /> {running ? "Running…" : "Run report"}
              </Button>
              <Button variant="secondary" onClick={exportCsv} disabled={!rows?.length}>
                <Download aria-hidden /> CSV
              </Button>
              <Button variant="secondary" onClick={printPdf} disabled={!rows?.length}>
                <Printer aria-hidden /> Print or PDF
              </Button>
              <Button variant="ghost" onClick={() => void runInBackground()} disabled={!data}>
                <Clock aria-hidden /> Run in background
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4">
              <TextField id="report-save-name" label="Save this setup as" value={saveName} onChange={setSaveName} className="max-w-xs" />
              <CheckboxField id="report-share" label="Share with the team" checked={share} onChange={setShare} />
              <Button variant="ghost" onClick={() => void saveReport()} disabled={!saveName.trim()}>
                <Save aria-hidden /> Save
              </Button>
            </div>
          </SectionCard>
          {error ? <ErrorBanner message={error} /> : null}
          <BackgroundJobs version={jobsVersion} />
          <SectionCard className="p-0 md:p-0">
            {running ? (
              <div className="p-4">
                <LoadingRows />
              </div>
            ) : !rows ? (
              <EmptyState icon={ChartColumn} message="Choose filters and run the report." />
            ) : shown.length === 0 ? (
              <EmptyState icon={ChartColumn} message="No rows match." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                      {displayColumns.map((column) => (
                        <TableHead key={column.key} className={cn(headClass, (column.type === "number" || column.type === "money") && "text-right")}>
                          {column.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.slice(0, 2000).map((row, index) => (
                      <TableRow key={index} className="h-10">
                        {displayColumns.map((column) => (
                          <TableCell key={column.key} className={cn((column.type === "number" || column.type === "money") && "text-right num")}>
                            {format(row[column.key], column, currency)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    <TableRow className="h-10 font-semibold">
                      {displayColumns.map((column, index) => (
                        <TableCell key={column.key} className={cn((column.type === "number" || column.type === "money") && "text-right num")}>
                          {index === 0 ? `Total (${shown.length} rows)` : column.key in totals && column.key !== "margin" && column.key !== "days" && column.key !== "cost" ? format(totals[column.key], column, currency) : ""}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  )
}
