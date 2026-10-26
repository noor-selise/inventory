import * as React from "react"
import { Ban, Pencil, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { DateField } from "@/components/app/date-picker"
import { SelectField, TextField } from "@/components/app/form"
import { ErrorBanner, LoadingRows } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatMoney } from "@/lib/format"
import { addMonths, disposalGain, firstDayOf, incomeYearLabel, incomeYearStart, periodOfDate, scheduleRow } from "./calc"
import { countedOnly, deleteAsset, disposeAsset, entriesFor, undoDisposal, type DepreciationState } from "./actions"
import type { DepreciationClass, FixedAsset } from "./api"
import { dayLabel as day, monthLabel } from "./labels"

// One asset: its entries month by month and per income year (spec 0028 AC-11,
// AC-12), with dispose, undo, edit and delete for asset editors.
export function AssetDetail({
  asset,
  onClose,
  state,
  classes,
  productName,
  locationName,
  canEdit,
  seeCost,
  onEdit,
  onChanged,
}: {
  asset?: FixedAsset
  onClose: () => void
  state: DepreciationState
  classes: DepreciationClass[]
  productName: string
  locationName: string
  canEdit: boolean
  seeCost: boolean
  onEdit: (asset: FixedAsset, hasEntries: boolean) => void
  onChanged: () => void
}) {
  const entries = useResource(() => (asset ? entriesFor(asset.ItemId) : Promise.resolve([])), [asset?.ItemId, asset?.LastUpdatedDate])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const [disposing, setDisposing] = React.useState(false)

  React.useEffect(() => setError(undefined), [asset?.ItemId])

  const currency = state.company.homeCurrency
  const money = (value: number) => (seeCost ? formatMoney(value, currency) : "Hidden")
  const all = entries.data ?? []
  const counted = countedOnly(all, state.latestClosed)
  const wdv = counted.length ? counted[counted.length - 1].closingWdv : asset ? (asset.openingWdv ?? asset.cost) : 0
  const className = (id: string) => classes.find((item) => item.ItemId === id)?.name ?? "Unknown class"
  const gain = asset ? disposalGain(asset, counted) : null
  const provisional = asset?.disposalDate ? addMonths(periodOfDate(asset.disposalDate), -1) > (state.latestClosed || "") : false
  const disposalOpen = asset?.status === "disposed" && asset.disposalDate ? periodOfDate(asset.disposalDate) >= state.nextOpen : false

  // One summary row per income year, from the start period to the year being closed now.
  const years: string[] = []
  if (asset) {
    const last = incomeYearStart(state.latestClosed || state.setup.startPeriod, state.setup.incomeYearStartMonth)
    for (let year = state.setup.startPeriod; year <= last; year = addMonths(year, 12)) years.push(year)
  }

  async function act(work: () => Promise<unknown>, done: string, close = false) {
    setBusy(true)
    setError(undefined)
    try {
      await work()
      toast.success(done)
      onChanged()
      if (close) onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={Boolean(asset)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {asset ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{asset.assetNumber}</span> {productName}
                {asset.status === "disposed" ? <Badge variant="muted">{asset.disposalType === "sold" ? "Sold" : "Scrapped"}</Badge> : <Badge variant="success">In use</Badge>}
              </SheetTitle>
              <SheetDescription>
                {className(asset.classId)} · {locationName || "No location"} · in service {day(asset.inServiceDate)}
                {asset.serialNumber ? ` · serial ${asset.serialNumber}` : ""}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-6 px-4 pb-6">
              {error ? <ErrorBanner message={error} /> : null}
              <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                <div>
                  <dt className="label-overline">Cost</dt>
                  <dd className="mt-1 font-semibold num">{money(asset.cost)}</dd>
                </div>
                {asset.openingWdv !== null && asset.openingWdv !== undefined ? (
                  <div>
                    <dt className="label-overline">Opening WDV</dt>
                    <dd className="mt-1 font-semibold num">{money(asset.openingWdv)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="label-overline">Current WDV</dt>
                  <dd className="mt-1 font-semibold num">{money(wdv)}</dd>
                </div>
                <div>
                  <dt className="label-overline">Source</dt>
                  <dd className="mt-1">{asset.source === "receipt" ? "Purchase receipt" : "Added by hand"}</dd>
                </div>
                {asset.status === "disposed" ? (
                  <>
                    <div>
                      <dt className="label-overline">Disposed</dt>
                      <dd className="mt-1">{day(asset.disposalDate)}</dd>
                    </div>
                    <div>
                      <dt className="label-overline">Amount received</dt>
                      <dd className="mt-1 num">{money(Number(asset.disposalAmount ?? 0))}</dd>
                    </div>
                    <div>
                      <dt className="label-overline">{gain !== null && gain < 0 ? "Loss" : "Gain"}</dt>
                      <dd className="mt-1 num">
                        {gain === null ? "" : money(Math.abs(gain))}
                        {provisional ? <span className="ml-2 text-xs text-muted-foreground">provisional</span> : null}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>

              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy || entries.loading} onClick={() => onEdit(asset, all.length > 0)}>
                    <Pencil aria-hidden /> Edit
                  </Button>
                  {asset.status === "active" ? (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDisposing(true)}>
                      <Ban aria-hidden /> Sell or scrap
                    </Button>
                  ) : disposalOpen ? (
                    <>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDisposing(true)}>
                        <Pencil aria-hidden /> Edit disposal
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(() => undoDisposal(asset), "Disposal undone")}>
                        <RotateCcw aria-hidden /> Undo disposal
                      </Button>
                    </>
                  ) : null}
                  {asset.source === "manual" && !all.length && !entries.loading ? (
                    <Button size="sm" variant="ghost" className="text-destructive-text" disabled={busy} onClick={() => void act(() => deleteAsset(asset), "Asset deleted", true)}>
                      <Trash2 aria-hidden /> Delete
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <section>
                <h3 className="mb-2 text-base font-semibold">Per income year</h3>
                {entries.loading && !entries.data ? (
                  <LoadingRows rows={2} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-right">Opening</TableHead>
                        <TableHead className="text-right">Added</TableHead>
                        <TableHead className="text-right">Depreciation</TableHead>
                        <TableHead className="text-right">Closing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {years.map((year) => {
                        const row = scheduleRow(asset, counted, year, state.setup)
                        if (!row) return null
                        return (
                          <TableRow key={year}>
                            <TableCell>{incomeYearLabel(year, state.setup.incomeYearStartMonth)}</TableCell>
                            <TableCell className="text-right num">{money(row.opening)}</TableCell>
                            <TableCell className="text-right num">{money(row.additions)}</TableCell>
                            <TableCell className="text-right num">{money(row.depreciation)}</TableCell>
                            <TableCell className="text-right num">{money(row.closing)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-base font-semibold">Month by month</h3>
                {counted.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Charge</TableHead>
                        <TableHead className="text-right">WDV after</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...counted].reverse().map((entry) => (
                        <TableRow key={entry.ItemId}>
                          <TableCell>{monthLabel(entry.period)}</TableCell>
                          <TableCell className="text-right num">{entry.ratePercent}%</TableCell>
                          <TableCell className="text-right num">{money(entry.amount)}</TableCell>
                          <TableCell className="text-right num">{money(entry.closingWdv)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No closed month has charged this asset yet. Its first charge month is {monthLabel(periodOfDate(asset.inServiceDate) > state.setup.startPeriod ? periodOfDate(asset.inServiceDate) : state.setup.startPeriod)}.</p>
                )}
              </section>
            </div>
            <DisposeDialog
              open={disposing}
              onOpenChange={setDisposing}
              asset={asset}
              state={state}
              onSaved={() => {
                setDisposing(false)
                onChanged()
              }}
            />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function DisposeDialog({ open, onOpenChange, asset, state, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; asset: FixedAsset; state: DepreciationState; onSaved: () => void }) {
  const [type, setType] = React.useState<"sold" | "scrapped">("sold")
  const [dayValue, setDayValue] = React.useState(state.today)
  const [amount, setAmount] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string>()

  React.useEffect(() => {
    if (!open) return
    const editing = asset.status === "disposed"
    setType(editing && asset.disposalType ? asset.disposalType : "sold")
    setDayValue(editing && asset.disposalDate ? asset.disposalDate.slice(0, 10) : state.today)
    setAmount(editing ? String(asset.disposalAmount ?? "") : "")
    setError(undefined)
  }, [open, asset, state.today])

  const earliest = [firstDayOf(state.nextOpen), asset.inServiceDate.slice(0, 10)].sort().at(-1)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      await disposeAsset(asset, { type, day: dayValue, amount: type === "scrapped" ? 0 : amount.trim() === "" ? Number.NaN : Number(amount) })
      toast.success(type === "sold" ? "Asset marked as sold" : "Asset marked as scrapped")
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sell or scrap {asset.assetNumber}</DialogTitle>
          <DialogDescription>Depreciation stops from the disposal month. You can undo this while that month is open.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4">
          {error ? <ErrorBanner message={error} /> : null}
          <SelectField
            id="dispose-type"
            label="What happened"
            required
            options={[
              { value: "sold", label: "Sold" },
              { value: "scrapped", label: "Scrapped (nothing received)" },
            ]}
            value={type}
            onChange={(value) => setType(value as "sold" | "scrapped")}
          />
          <DateField id="dispose-date" label="Disposal date" required value={dayValue} onChange={setDayValue} min={earliest} max={state.today} />
          {type === "sold" ? (
            <TextField id="dispose-amount" label={`Amount received (${state.company.homeCurrency})`} required type="number" inputMode="decimal" step="0.01" min={0} value={amount} onChange={setAmount} />
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
