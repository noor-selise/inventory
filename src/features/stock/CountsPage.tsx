import * as React from "react"
import { ClipboardCheck, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { formatDateTime } from "@/components/app/audit"
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/app/form"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { blocksClient } from "@/lib/blocks/client"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { cancelCount, completeCount, countVariances, createCount, saveSheetCounts, startSheet } from "./actions"
import { posting, stockCounts, type StockCount } from "./api"
import { DocumentStatus, STOCK_EDITORS, postingMessage } from "./AdjustmentsPage"
import { useStockLookups, type StockLookups } from "./lookups"

// Stock counts split into sheets; review variances; completing posts one
// adjustment of the differences (spec 0008 AC-4 to AC-6).

/** Reviewers see expected quantities while counting; counters count blind. */
const REVIEWERS = ["admin", "manager"]
const headClass = "h-9 text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase"

export function CountsPage() {
  const { hasRole, user } = useCurrentUser()
  const canEdit = hasRole(...STOCK_EDITORS)
  const isReviewer = hasRole(...REVIEWERS)
  const lookups = useStockLookups()
  const team = useResource(async () => {
    const response = await blocksClient.iam.users.list({ pageNo: 1, pageSize: 100 }).catch(() => ({ data: [] }))
    return (response.data ?? []).filter((member) => member.itemId && member.active !== false)
  }, [])
  const list = useResource(() => stockCounts.list({ sort: { CreatedDate: -1 }, pageSize: 100 }), [])
  const [creating, setCreating] = React.useState(false)
  const [viewingId, setViewingId] = React.useState<string>()

  const data = lookups.data
  const memberName = (id?: string | null) => {
    if (!id) return ""
    const member = team.data?.find((item) => item.itemId === id)
    return member ? [member.firstName, member.lastName].filter(Boolean).join(" ") || String(member.email ?? "") : id === user?.itemId ? "You" : ""
  }
  const rows = list.data?.items ?? []
  const viewing = rows.find((row) => row.ItemId === viewingId)

  return (
    <>
      <PageHeader
        title="Counts"
        description="Count a location in sheets, review the differences, then post them as one adjustment."
        actions={
          canEdit ? (
            <Button onClick={() => setCreating(true)} disabled={!data}>
              <Plus aria-hidden /> New count
            </Button>
          ) : null
        }
      />
      {list.error ? <ErrorBanner message={list.error} onRetry={list.reload} /> : null}
      <SectionCard className="p-0 md:p-0">
        {(list.loading && !list.data) || !data ? (
          <div className="p-4">
            <LoadingRows />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardCheck} message="No counts yet." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className={headClass}>Number</TableHead>
                  <TableHead className={headClass}>Location</TableHead>
                  <TableHead className={cn(headClass, "hidden md:table-cell")}>Sheets</TableHead>
                  <TableHead className={cn(headClass, "hidden lg:table-cell")}>Started</TableHead>
                  <TableHead className={headClass}>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((count) => (
                  <TableRow key={count.ItemId} className="h-11 cursor-pointer" onClick={() => setViewingId(count.ItemId)}>
                    <TableCell className="font-mono text-[13px]">{count.number}</TableCell>
                    <TableCell>{data.locationName(count.locationId)}</TableCell>
                    <TableCell className="hidden md:table-cell num">
                      {count.sheets.filter((sheet) => sheet.status === "submitted").length} of {count.sheets.length} submitted
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">{count.startedAt ? formatDateTime(count.startedAt) : ""}</TableCell>
                    <TableCell>
                      <DocumentStatus status={count.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
      {creating && data ? (
        <NewCount
          lookups={data}
          team={(team.data ?? []).map((member) => ({ value: String(member.itemId), label: [member.firstName, member.lastName].filter(Boolean).join(" ") || String(member.email ?? "") }))}
          onClose={() => setCreating(false)}
          onDone={(count) => {
            setCreating(false)
            void list.reload().then(() => setViewingId(count.ItemId))
          }}
        />
      ) : null}
      {viewing && data ? (
        <CountDetail
          count={viewing}
          lookups={data}
          canEdit={canEdit}
          isReviewer={isReviewer}
          memberName={memberName}
          onClose={() => setViewingId(undefined)}
          onChanged={() => void list.reload()}
        />
      ) : null}
    </>
  )
}

type SheetDraft = { key: string; name: string; assigneeId: string; productIds: string[] }

function NewCount({ lookups, team, onClose, onDone }: { lookups: StockLookups; team: { value: string; label: string }[]; onClose: () => void; onDone: (count: StockCount) => void }) {
  const active = lookups.locations.filter((location) => location.isActive !== false)
  const [locationId, setLocationId] = React.useState(active.find((location) => location.isDefault)?.ItemId ?? "")
  const [remarks, setRemarks] = React.useState("")
  const [sheets, setSheets] = React.useState<SheetDraft[]>([{ key: crypto.randomUUID(), name: "Sheet 1", assigneeId: "", productIds: [] }])
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const stocked = lookups.products.filter((product) => product.itemType === "stocked" && product.isActive !== false)
  const withStock = useResource(async () => {
    if (!locationId) return new Set<string>()
    const { items } = await posting.balances({ locationId, onHand: { $ne: 0 } }, { pageSize: 2000 })
    return new Set(items.map((item) => item.productId))
  }, [locationId])

  const update = (key: string, patch: Partial<SheetDraft>) => setSheets(sheets.map((sheet) => (sheet.key === key ? { ...sheet, ...patch } : sheet)))
  const taken = (exceptKey: string) => new Set(sheets.filter((sheet) => sheet.key !== exceptKey).flatMap((sheet) => sheet.productIds))

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!locationId) return setError("Choose a location.")
    if (sheets.some((sheet) => !sheet.name.trim() || sheet.productIds.length === 0)) return setError("Every sheet needs a name and at least one product.")
    setSaving(true)
    setError(undefined)
    try {
      const count = await createCount({
        locationId,
        remarks,
        sheets: sheets.map((sheet) => ({ name: sheet.name.trim(), assigneeId: sheet.assigneeId || null, productIds: sheet.productIds })),
      })
      toast.success(`${count.number} created`)
      onDone(count)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New count</DialogTitle>
          <DialogDescription>Split the products into sheets, one per person or area. Each product can be on one sheet only.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4">
          {error ? <ErrorBanner message={error} /> : null}
          <SelectField id="count-location" label="Location" required options={active.map((location) => ({ value: location.ItemId, label: location.name }))} value={locationId} onChange={setLocationId} className="md:w-80" />
          {sheets.map((sheet, index) => {
            const others = taken(sheet.key)
            const available = stocked.filter((product) => !others.has(product.ItemId))
            return (
              <div key={sheet.key} className="flex flex-col gap-3 rounded-lg bg-muted p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <TextField id={`sheet-${index}-name`} label="Sheet name" value={sheet.name} onChange={(name) => update(sheet.key, { name })} />
                  <SelectField id={`sheet-${index}-assignee`} label="Counted by" allowNone options={team} value={sheet.assigneeId} onChange={(assigneeId) => update(sheet.key, { assigneeId })} />
                  <div className="flex items-end">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${sheet.name}`} disabled={sheets.length === 1} onClick={() => setSheets(sheets.filter((item) => item.key !== sheet.key))}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="xs" variant="secondary" onClick={() => update(sheet.key, { productIds: available.filter((product) => withStock.data?.has(product.ItemId)).map((product) => product.ItemId) })}>
                    All with stock here
                  </Button>
                  <Button type="button" size="xs" variant="secondary" onClick={() => update(sheet.key, { productIds: available.map((product) => product.ItemId) })}>
                    All products
                  </Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => update(sheet.key, { productIds: [] })}>
                    Clear
                  </Button>
                  <span className="self-center text-xs text-muted-foreground num">{sheet.productIds.length} chosen</span>
                </div>
                <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                  {available.map((product) => (
                    <CheckboxField
                      key={product.ItemId}
                      id={`sheet-${index}-product-${product.ItemId}`}
                      label={`${product.name} · ${product.sku}`}
                      checked={sheet.productIds.includes(product.ItemId)}
                      onChange={(checked) =>
                        update(sheet.key, { productIds: checked ? [...sheet.productIds, product.ItemId] : sheet.productIds.filter((id) => id !== product.ItemId) })
                      }
                    />
                  ))}
                </div>
              </div>
            )
          })}
          <div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setSheets([...sheets, { key: crypto.randomUUID(), name: `Sheet ${sheets.length + 1}`, assigneeId: "", productIds: [] }])}>
              <Plus aria-hidden /> Add sheet
            </Button>
          </div>
          <TextAreaField id="count-remarks" label="Remarks" value={remarks} onChange={setRemarks} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-w-24">
              {saving ? "Creating…" : "Create count"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CountDetail({
  count,
  lookups,
  canEdit,
  isReviewer,
  memberName,
  onClose,
  onChanged,
}: {
  count: StockCount
  lookups: StockLookups
  canEdit: boolean
  isReviewer: boolean
  memberName: (id?: string | null) => string
  onClose: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const [entries, setEntries] = React.useState<Record<string, string>>({})
  const countReason = lookups.reasons.find((reason) => reason.name.toLowerCase() === "count correction")
  const [reasonId, setReasonId] = React.useState(countReason?.ItemId ?? "")

  React.useEffect(() => {
    setEntries(Object.fromEntries(count.sheets.flatMap((sheet) => sheet.lines.map((line) => [line.lineId, line.countedQty == null ? "" : String(line.countedQty)]))))
  }, [count])

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      toast.success(success)
      onChanged()
    } catch (caught) {
      setError(postingMessage(caught, lookups))
    } finally {
      setBusy(false)
    }
  }

  const variances = countVariances(count)
  const finished = count.status === "completed" || count.status === "cancelled"
  const showExpected = isReviewer || count.status === "in_review" || finished
  const lineLabel = (line: StockCount["sheets"][number]["lines"][number]) =>
    [lookups.binCode(line.sublocationId), line.serial ?? lookups.lotNumber(line.lotId)].filter(Boolean).join(" · ")

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono">{count.number}</span> <DocumentStatus status={count.status} />
          </DialogTitle>
          <DialogDescription>
            {lookups.locationName(count.locationId)}
            {count.completedAt ? ` · completed ${formatDateTime(count.completedAt)}` : ""}
          </DialogDescription>
        </DialogHeader>
        {error ? <ErrorBanner message={error} /> : null}
        <Tabs defaultValue={count.status === "in_review" || finished ? "review" : count.sheets[0]?.sheetId}>
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList>
              {count.sheets.map((sheet) => (
                <TabsTrigger key={sheet.sheetId} value={sheet.sheetId}>
                  {sheet.name}
                  {sheet.status === "submitted" ? " ✓" : ""}
                </TabsTrigger>
              ))}
              <TabsTrigger value="review">Review</TabsTrigger>
            </TabsList>
          </div>
          {count.sheets.map((sheet) => (
            <TabsContent key={sheet.sheetId} value={sheet.sheetId} className="mt-4 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {memberName(sheet.assigneeId) ? `Counted by ${memberName(sheet.assigneeId)}. ` : ""}
                {sheet.status === "open" ? "Start the sheet when counting begins; that is when expected quantities are captured." : sheet.status === "counting" ? "Enter what you count. Leave a line empty if you did not count it." : "Submitted."}
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                      <TableHead className={headClass}>Product</TableHead>
                      <TableHead className={headClass}>Bin, lot or serial</TableHead>
                      {showExpected ? <TableHead className={cn(headClass, "text-right")}>Expected</TableHead> : null}
                      <TableHead className={cn(headClass, "text-right")}>Counted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sheet.lines.map((line) => {
                      const product = lookups.product(line.productId)
                      return (
                        <TableRow key={line.lineId} className="h-11">
                          <TableCell>{product?.name}</TableCell>
                          <TableCell className="font-mono text-[13px]">{lineLabel(line)}</TableCell>
                          {showExpected ? <TableCell className="text-right num">{line.expectedQty == null ? "" : formatNumber(line.expectedQty)}</TableCell> : null}
                          <TableCell className="w-36 text-right">
                            {sheet.status === "counting" && canEdit ? (
                              <Input
                                aria-label={`Counted ${product?.name ?? ""} ${lineLabel(line)}`}
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                className="h-9 text-right num"
                                value={entries[line.lineId] ?? ""}
                                onChange={(event) => setEntries({ ...entries, [line.lineId]: event.target.value })}
                              />
                            ) : (
                              <span className="num">{line.countedQty == null ? "" : formatNumber(line.countedQty)}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {canEdit && sheet.status === "open" && !finished ? (
                <div>
                  <Button disabled={busy} onClick={() => void run(() => startSheet(count, sheet.sheetId), `${sheet.name} started`)}>
                    Start sheet
                  </Button>
                </div>
              ) : null}
              {canEdit && sheet.status === "counting" ? (
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const values = Object.fromEntries(
                      sheet.lines.map((line) => [line.lineId, entries[line.lineId] === "" || entries[line.lineId] == null ? null : Number(entries[line.lineId])])
                    )
                    const invalid = Object.values(values).some((value) => value !== null && !(value >= 0))
                    return (
                      <>
                        <Button variant="secondary" disabled={busy || invalid} onClick={() => void run(() => saveSheetCounts(count, sheet.sheetId, values, false), "Counts saved")}>
                          Save
                        </Button>
                        <Button disabled={busy || invalid} onClick={() => void run(() => saveSheetCounts(count, sheet.sheetId, values, true), `${sheet.name} submitted`)}>
                          Submit sheet
                        </Button>
                        {invalid ? <span className="self-center text-xs text-destructive-text">Counts must be 0 or more.</span> : null}
                      </>
                    )
                  })()}
                </div>
              ) : null}
            </TabsContent>
          ))}
          <TabsContent value="review" className="mt-4 flex flex-col gap-3">
            {count.status === "in_review" || finished ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {variances.length === 0 ? "No differences. Completing closes the count without changing stock." : `${variances.length} line(s) differ from what was expected. Completing posts them as one adjustment.`}
                </p>
                {variances.length ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted hover:bg-muted">
                          <TableHead className={headClass}>Product</TableHead>
                          <TableHead className={headClass}>Bin, lot or serial</TableHead>
                          <TableHead className={cn(headClass, "text-right")}>Expected</TableHead>
                          <TableHead className={cn(headClass, "text-right")}>Counted</TableHead>
                          <TableHead className={cn(headClass, "text-right")}>Difference</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variances.map(({ line, variance }) => (
                          <TableRow key={line.lineId} className="h-11">
                            <TableCell>{lookups.product(line.productId)?.name}</TableCell>
                            <TableCell className="font-mono text-[13px]">{lineLabel(line)}</TableCell>
                            <TableCell className="text-right num">{formatNumber(line.expectedQty)}</TableCell>
                            <TableCell className="text-right num">{formatNumber(line.countedQty)}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={variance > 0 ? "success" : "warning"} className="num">
                                {variance > 0 ? "+" : ""}
                                {formatNumber(variance)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
                {count.status === "in_review" && isReviewer ? (
                  <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <SelectField id="count-reason" label="Adjustment reason" options={lookups.reasons.map((reason) => ({ value: reason.ItemId, label: reason.name }))} value={reasonId} onChange={setReasonId} className="md:w-64" />
                    <Button disabled={busy || !reasonId} onClick={() => void run(() => completeCount(count, reasonId, lookups), `${count.number} completed`)}>
                      {busy ? "Posting…" : "Complete count"}
                    </Button>
                  </div>
                ) : null}
                {count.status === "in_review" && !isReviewer ? <p className="text-xs text-muted-foreground">An admin or manager completes the count.</p> : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">The review opens when every sheet is submitted.</p>
            )}
          </TabsContent>
        </Tabs>
        <DialogFooter className="gap-2">
          {canEdit && ["open", "in_progress", "in_review"].includes(count.status) ? (
            <Button variant="secondary" className="sm:mr-auto" disabled={busy} onClick={() => void run(() => cancelCount(count), `${count.number} cancelled`)}>
              Cancel count
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
