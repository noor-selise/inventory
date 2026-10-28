import * as React from "react"
import { Boxes, ChartColumn, ChevronDown, Columns3, Download, FileText, Printer, RefreshCw, Save, Search, ShoppingCart, Trash2, Truck, X } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { DateField, DateRangeField, RANGE_PRESETS, formatDay } from "@/components/app/date-picker"
import { CheckboxField, SelectField, TextField } from "@/components/app/form"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { collection, type Entity } from "@/lib/blocks/data"
import { useOrderLookups } from "@/features/sales/lookups"
import { COST_VIEWERS } from "@/features/team/roles"
import { headClass } from "@/features/sales/OrderBits"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatDate, formatMoney, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { seesLocation, useLocationScope } from "@/features/team/location-scope"
import { REPORTS, type ReportColumn, type ReportDefinition, type ReportFilters, type ReportRow } from "./definitions"
import { toCsv } from "./csv"

// Reports (spec 0015 AC-1 to AC-4; AC-5 deferred): pick a report, set dates
// and filters, group, choose columns, export CSV or print to PDF from the rows
// already loaded, and save the setup for the team. A report runs again by itself
// when its filters change. Cost columns never show, print or export for users
// without cost access.

type SavedReport = Entity & { name: string; reportKey: string; filters: string; columns: string[]; isShared: boolean; ownerId: string }
const savedReports = collection<SavedReport>("SavedReport", ["name", "reportKey", "filters", "columns", "isShared", "ownerId"])

const GROUPS = [
  { name: "Sales", icon: ShoppingCart },
  { name: "Purchasing", icon: Truck },
  { name: "Inventory", icon: Boxes },
] as const

const numeric = (column: ReportColumn) => column.type === "number" || column.type === "money"
/** Ratios and per row values that make no sense added up. */
const NOT_SUMMED = new Set(["margin", "days", "cost"])

function format(value: ReportRow[string], column: ReportColumn, currency: string) {
  if (value == null || value === "") return ""
  if (column.type === "money") return formatMoney(Number(value), currency)
  if (column.type === "number") return formatNumber(Number(value))
  if (column.type === "date") return formatDate(String(value))
  return String(value)
}

/** Date reports open on this month, so there is something to see right away. */
function defaultFilters(report: ReportDefinition): ReportFilters {
  return report.filters.includes("date") ? RANGE_PRESETS.find((preset) => preset.key === "month")!.range() : {}
}

export function ReportsPage() {
  const { hasRole, user } = useCurrentUser()
  const seeCost = hasRole(...COST_VIEWERS)
  const lookups = useOrderLookups()
  const saved = useResource(() => savedReports.list({ sort: { name: 1 }, pageSize: 500 }), [])
  const [key, setKey] = React.useState(REPORTS[0].key)
  const report = REPORTS.find((item) => item.key === key) ?? REPORTS[0]
  const allowed = React.useMemo(() => report.columns.filter((column) => seeCost || !column.cost), [report, seeCost])
  const [filters, setFilters] = React.useState<ReportFilters>(() => defaultFilters(REPORTS[0]))
  const scope = useLocationScope()
  // A limited person's reports cover only their locations (spec 0003); saved reports keep `filters` clean.
  const scoped = React.useMemo<ReportFilters>(() => (scope.limited ? { ...filters, allowedLocationIds: scope.ids } : filters), [filters, scope])
  const [visible, setVisible] = React.useState<string[]>(allowed.map((column) => column.key))
  const [groupBy, setGroupBy] = React.useState("")
  const [rows, setRows] = React.useState<ReportRow[]>()
  const [running, setRunning] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const [search, setSearch] = React.useState("")
  const runId = React.useRef(0)
  const data = lookups.data
  const currency = data?.homeCurrency ?? "USD"

  function choose(nextKey: string, preset?: { filters?: ReportFilters; columns?: string[] }) {
    const next = REPORTS.find((item) => item.key === nextKey) ?? REPORTS[0]
    setKey(next.key)
    setFilters(preset?.filters ?? defaultFilters(next))
    const nextAllowed = next.columns.filter((column) => seeCost || !column.cost).map((column) => column.key)
    setVisible(preset?.columns?.filter((column) => nextAllowed.includes(column)) ?? nextAllowed)
    setGroupBy("")
    setRows(undefined)
  }

  const run = React.useCallback(async () => {
    if (!data) return
    const id = ++runId.current
    setRunning(true)
    setError(undefined)
    try {
      const result = await report.load(scoped, data)
      if (id === runId.current) setRows(result)
    } catch (caught) {
      if (id === runId.current) setError(errorMessage(caught))
    } finally {
      if (id === runId.current) setRunning(false)
    }
  }, [data, report, scoped])

  // Run again shortly after the report or a filter changes; a newer run wins.
  React.useEffect(() => {
    const timer = window.setTimeout(() => void run(), 250)
    return () => window.clearTimeout(timer)
  }, [run])

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
      for (const column of allowed) if (numeric(column)) entry[column.key] = Number(entry[column.key] ?? 0) + Number(row[column.key] ?? 0)
      groups.set(groupKey, entry)
    }
    return [...groups.values()]
  }, [rows, groupBy, allowed])
  const displayColumns = groupBy ? [allowed.find((column) => column.key === groupBy)!, ...columns.filter((column) => column.key !== groupBy && numeric(column))] : columns
  const summed = displayColumns.filter((column) => numeric(column) && !NOT_SUMMED.has(column.key))
  const totals = Object.fromEntries(summed.map((column) => [column.key, shown.reduce((sum, row) => sum + Number(row[column.key] ?? 0), 0)]))

  // Exports use the rows on screen, so they wait while a run replaces them:
  // otherwise a file could carry the new filters over the old rows.
  const exportHint = running || !rows ? "Updating the report…" : !shown.length ? "No rows to export" : undefined

  function exportCsv() {
    try {
      const fileName = `${report.key}-${new Date().toISOString().slice(0, 10)}.csv`
      const url = URL.createObjectURL(new Blob([toCsv(shown, displayColumns)], { type: "text/csv;charset=utf-8" }))
      const link = document.createElement("a")
      link.href = url
      link.download = fileName
      document.body.append(link)
      link.click()
      link.remove()
      // Some browsers cancel the download if the link is revoked straight away.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success(`Downloaded ${fileName} (${formatNumber(shown.length)} ${shown.length === 1 ? "row" : "rows"})`)
    } catch (caught) {
      toast.error(errorMessage(caught))
    }
  }

  function printPdf() {
    const win = window.open("", "_blank", "noopener=no")
    if (!win) return toast.error("Allow pop ups to print the report.")
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    const cell = (value: string, right: boolean) => `<td style="padding:4px 8px;border-bottom:1px solid #ddd;${right ? "text-align:right" : ""}">${escape(value)}</td>`
    win.document.write(`<!doctype html><html><head><title>${escape(report.title)}</title><style>body{font:12px system-ui;margin:24px}table{border-collapse:collapse;width:100%}th{text-align:left;padding:4px 8px;border-bottom:2px solid #333}</style></head><body>
      <h1 style="font-size:18px">${escape(report.title)}</h1><p>${escape(chips.map((chip) => chip.label).join(" · "))}</p>
      <table><thead><tr>${displayColumns.map((column) => `<th style="${numeric(column) ? "text-align:right" : ""}">${escape(column.label)}</th>`).join("")}</tr></thead>
      <tbody>${shown.map((row) => `<tr>${displayColumns.map((column) => cell(format(row[column.key], column, currency), numeric(column))).join("")}</tr>`).join("")}</tbody></table>
      <script>window.onload=()=>window.print()</script></body></html>`)
    win.document.close()
  }

  const me = String(user?.itemId ?? user?.email ?? "")
  const mySaved = (saved.data?.items ?? []).filter((item) => item.reportKey !== "probe" && (item.isShared || item.ownerId === me))
  const options = {
    locations: (data?.locations ?? []).filter((row) => seesLocation(scope, row.ItemId)).map((row) => ({ value: row.ItemId, label: row.name })),
    products: (data?.products ?? []).map((row) => ({ value: row.ItemId, label: row.name })),
    customers: (data?.customers ?? []).map((row) => ({ value: row.ItemId, label: row.name })),
    vendors: (data?.vendors ?? []).map((row) => ({ value: row.ItemId, label: row.name })),
  }
  const nameOf = (list: { value: string; label: string }[], id?: string) => list.find((item) => item.value === id)?.label ?? ""

  // Active filters as removable chips.
  const chips: { key: string; label: string; clear: () => void }[] = []
  if (report.filters.includes("date")) {
    const preset = RANGE_PRESETS.find((item) => {
      const range = item.range()
      return range.from === (filters.from || undefined) && range.to === (filters.to || undefined)
    })
    const label = preset ? preset.label : filters.from && filters.to ? `${formatDay(filters.from)} to ${formatDay(filters.to)}` : filters.from ? `From ${formatDay(filters.from)}` : filters.to ? `Until ${formatDay(filters.to)}` : "All time"
    chips.push({ key: "date", label, clear: () => setFilters((current) => ({ ...current, from: undefined, to: undefined })) })
  }
  if (report.filters.includes("asOf")) chips.push({ key: "asOf", label: `As of ${filters.to ? formatDay(filters.to) : "today"}`, clear: () => setFilters((current) => ({ ...current, to: undefined })) })
  if (filters.locationId) chips.push({ key: "location", label: nameOf(options.locations, filters.locationId), clear: () => setFilters((current) => ({ ...current, locationId: undefined })) })
  if (filters.productId) chips.push({ key: "product", label: nameOf(options.products, filters.productId), clear: () => setFilters((current) => ({ ...current, productId: undefined })) })
  if (filters.partyId) chips.push({ key: "party", label: nameOf(report.filters.includes("vendor") ? options.vendors : options.customers, filters.partyId), clear: () => setFilters((current) => ({ ...current, partyId: undefined })) })
  if (groupBy) chips.push({ key: "group", label: `Grouped by ${allowed.find((column) => column.key === groupBy)?.label}`, clear: () => setGroupBy("") })

  const term = search.trim().toLowerCase()
  const matches = (title: string) => !term || title.toLowerCase().includes(term)
  const GroupIcon = GROUPS.find((group) => group.name === report.group)?.icon ?? ChartColumn

  return (
    <>
      <PageHeader title="Reports" description="Sales, purchasing and inventory reports from your live records. Money is in your home currency unless a column says otherwise." />
      {lookups.error ? <ErrorBanner message={lookups.error} onRetry={lookups.reload} /> : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="flex flex-col gap-5 lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Find a report" placeholder="Find a report" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" />
          </div>
          {GROUPS.map(({ name, icon: Icon }) => {
            const items = REPORTS.filter((item) => item.group === name && matches(item.title))
            if (!items.length) return null
            return (
              <nav key={name} aria-label={`${name} reports`} className="flex flex-col gap-0.5">
                <p className="mb-1 flex items-center gap-2 px-2 label-overline">
                  <Icon className="size-3.5" aria-hidden /> {name}
                </p>
                {items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-current={item.key === key ? "page" : undefined}
                    onClick={() => choose(item.key)}
                    className={cn("rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent", item.key === key && "bg-accent font-semibold text-foreground")}
                  >
                    {item.title}
                  </button>
                ))}
              </nav>
            )
          })}
          {mySaved.filter((item) => matches(item.name)).length ? (
            <nav aria-label="Saved reports" className="flex flex-col gap-0.5">
              <p className="mb-1 flex items-center gap-2 px-2 label-overline">
                <Save className="size-3.5" aria-hidden /> Saved
              </p>
              {mySaved
                .filter((item) => matches(item.name))
                .map((item) => (
                  <div key={item.ItemId} className="group flex items-center gap-1">
                    <button type="button" className="flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => choose(item.reportKey, { filters: JSON.parse(item.filters || "{}"), columns: item.columns })}>
                      {item.name}
                      {item.isShared ? <span className="text-xs text-muted-foreground"> · shared</span> : null}
                    </button>
                    {item.ownerId === me ? (
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete ${item.name}`} onClick={() => void savedReports.remove(item.ItemId).then(saved.reload)}>
                        <Trash2 aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                ))}
            </nav>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <GroupIcon className="size-5 text-primary" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                    {report.title} <Badge variant="neutral">{report.group}</Badge>
                  </h2>
                  <p className="text-sm text-muted-foreground">{report.description}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => void run()} disabled={running || !data}>
                  <RefreshCw aria-hidden className={cn(running && "animate-spin")} /> Refresh
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" disabled={!data}>
                      <Download aria-hidden /> Export <ChevronDown aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {exportHint ? <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{exportHint}</DropdownMenuLabel> : null}
                    <DropdownMenuItem disabled={!!exportHint} onSelect={exportCsv}>
                      <FileText aria-hidden /> CSV file
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!!exportHint} onSelect={printPdf}>
                      <Printer aria-hidden /> Print or PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <SaveReport reportKey={report.key} filters={filters} columns={visible} disabled={!user} onSaved={() => void saved.reload()} />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">
              {report.filters.includes("date") ? (
                <DateRangeField id="report-range" label="Dates" value={{ from: filters.from, to: filters.to }} onChange={(range) => setFilters((current) => ({ ...current, from: range.from, to: range.to }))} />
              ) : null}
              {report.filters.includes("asOf") ? <DateField id="report-as-of" label="As of" value={filters.to ?? ""} onChange={(to) => setFilters((current) => ({ ...current, to: to || undefined }))} helper="Empty means today." /> : null}
              {report.filters.includes("location") ? (
                <SelectField id="report-location" label="Location" options={options.locations} value={filters.locationId ?? ""} onChange={(locationId) => setFilters((current) => ({ ...current, locationId: locationId || undefined }))} allowNone placeholder="All locations" />
              ) : null}
              {report.filters.includes("product") ? (
                <SelectField id="report-product" label="Product" options={options.products} value={filters.productId ?? ""} onChange={(productId) => setFilters((current) => ({ ...current, productId: productId || undefined }))} allowNone placeholder="All products" />
              ) : null}
              {report.filters.includes("customer") ? (
                <SelectField id="report-customer" label="Customer" options={options.customers} value={filters.partyId ?? ""} onChange={(partyId) => setFilters((current) => ({ ...current, partyId: partyId || undefined }))} allowNone placeholder="All customers" />
              ) : null}
              {report.filters.includes("vendor") ? (
                <SelectField id="report-vendor" label="Vendor" options={options.vendors} value={filters.partyId ?? ""} onChange={(partyId) => setFilters((current) => ({ ...current, partyId: partyId || undefined }))} allowNone placeholder="All vendors" />
              ) : null}
              <SelectField id="report-group" label="Group by" options={allowed.filter((column) => column.type === "text").map((column) => ({ value: column.key, label: column.label }))} value={groupBy} onChange={setGroupBy} allowNone placeholder="No grouping" />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-accent py-1 pr-1 pl-3 text-xs font-medium">
                  {chip.label}
                  <button type="button" aria-label={`Remove ${chip.label}`} onClick={chip.clear} className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground">
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="xs" variant="ghost" className="ml-auto">
                    <Columns3 aria-hidden /> Columns ({columns.length}/{allowed.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                  <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                  {allowed.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.key}
                      checked={visible.includes(column.key)}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={(value) => setVisible((current) => (value === true ? [...current, column.key] : current.filter((item) => item !== column.key)))}
                    >
                      {column.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {!seeCost && report.columns.some((column) => column.cost) ? <p className="mt-2 text-xs text-muted-foreground">Cost and profit columns are hidden for your role.</p> : null}
          </SectionCard>

          {error ? <ErrorBanner message={error} onRetry={() => void run()} /> : null}

          {rows && shown.length ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryTile label={groupBy ? "Groups" : "Rows"} value={formatNumber(shown.length)} />
              {summed.slice(0, 3).map((column) => (
                <SummaryTile key={column.key} label={column.label} value={format(totals[column.key], column, currency)} />
              ))}
            </div>
          ) : null}

          <SectionCard className="p-0 md:p-0">
            {running && !rows ? (
              <div className="p-4">
                <LoadingRows />
              </div>
            ) : !rows ? (
              <EmptyState icon={ChartColumn} message={data ? "Loading the report…" : "Loading your data…"} />
            ) : shown.length === 0 ? (
              <EmptyState icon={ChartColumn} message="No rows match these filters. Try a wider date range." />
            ) : (
              <div className={cn("max-h-[70vh] overflow-auto transition-opacity", running && "opacity-60")}>
                <Table>
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="bg-muted hover:bg-muted">
                      {displayColumns.map((column) => (
                        <TableHead key={column.key} className={cn(headClass, "bg-muted", numeric(column) && "text-right")}>
                          {column.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.slice(0, 2000).map((row, index) => (
                      <TableRow key={index} className="h-10 even:bg-muted/30">
                        {displayColumns.map((column) => (
                          <TableCell key={column.key} className={cn(numeric(column) && "text-right num")}>
                            {format(row[column.key], column, currency)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    <TableRow className="h-10 border-t-2 font-semibold hover:bg-transparent">
                      {displayColumns.map((column, index) => (
                        <TableCell key={column.key} className={cn(numeric(column) && "text-right num")}>
                          {index === 0 ? `Total (${formatNumber(shown.length)} ${groupBy ? "groups" : "rows"})` : column.key in totals ? format(totals[column.key], column, currency) : ""}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
                {shown.length > 2000 ? <p className="p-3 text-xs text-muted-foreground">Showing the first 2,000 rows. Export CSV for all of them.</p> : null}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 dark:border-transparent">
      <p className="truncate label-overline">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold num">{value}</p>
    </div>
  )
}

/** Saves the current setup by name, for yourself or the whole team (AC-3). */
function SaveReport({ reportKey, filters, columns, disabled, onSaved }: { reportKey: string; filters: ReportFilters; columns: string[]; disabled: boolean; onSaved: () => void }) {
  const { user } = useCurrentUser()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [share, setShare] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || !user) return
    setSaving(true)
    try {
      await savedReports.create({ name: name.trim(), reportKey, filters: JSON.stringify(filters), columns, isShared: share, ownerId: String(user.itemId ?? user.email ?? "") })
      toast.success("Report saved")
      setName("")
      setOpen(false)
      onSaved()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="secondary" disabled={disabled}>
          <Save aria-hidden /> Save
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form onSubmit={save} className="flex flex-col gap-3">
          <TextField id="report-save-name" label="Name" value={name} onChange={setName} placeholder="For example: Monthly sales by rep" autoFocus />
          <CheckboxField id="report-share" label="Share with the team" checked={share} onChange={setShare} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim() || saving}>
              {saving ? "Saving…" : "Save report"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
