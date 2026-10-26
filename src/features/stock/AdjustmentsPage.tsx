import * as React from "react"
import { Ban, CircleAlert, CircleCheck, CircleDashed, ClipboardList, Plus } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { formatDateTime } from "@/components/app/audit"
import { CheckboxField, SelectField, TextAreaField } from "@/components/app/form"
import { DateField } from "@/components/app/date-picker"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { cancelAdjustment, createAdjustment, retryAdjustment } from "./actions"
import { lots, repairIfDue, stockAdjustments, type StockAdjustment } from "./api"
import { LineEditor, emptyLine, lineProblem, type LineDraft } from "./LineEditor"
import { STOCK_EDITORS, STOCK_REVIEWERS } from "@/features/team/roles"
import { locationFilter, seesLocation, useLocationScope } from "@/features/team/location-scope"
import { useStockLookups, type StockLookups } from "./lookups"
import { PostingError } from "./posting.ts"

// Stock adjustments with reasons; saving posts, cancelling reverses (spec 0008 AC-1).

const headClass = "h-9 label-overline"

export function DocumentStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "success" | "info" | "neutral" | "warning" | "destructive" | "muted"; icon: React.ComponentType<{ "aria-hidden"?: boolean }> }> = {
    posted: { label: "Posted", variant: "success", icon: CircleCheck },
    completed: { label: "Completed", variant: "success", icon: CircleCheck },
    open: { label: "Open", variant: "neutral", icon: CircleDashed },
    in_transit: { label: "In transit", variant: "info", icon: CircleDashed },
    in_progress: { label: "In progress", variant: "info", icon: CircleDashed },
    in_review: { label: "In review", variant: "warning", icon: CircleAlert },
    failed: { label: "Failed", variant: "destructive", icon: CircleAlert },
    cancelled: { label: "Cancelled", variant: "muted", icon: Ban },
  }
  const busy = { label: "Working…", variant: "info" as const, icon: CircleDashed }
  const entry = map[status] ?? busy
  return (
    <Badge variant={entry.variant}>
      <entry.icon aria-hidden /> {entry.label}
    </Badge>
  )
}

export function postingMessage(error: unknown, lookups: StockLookups) {
  if (error instanceof PostingError && error.line) {
    const product = lookups.product(error.line.productId)
    return `${product?.name ?? "A product"}: ${error.message}`
  }
  return errorMessage(error)
}

export function AdjustmentsPage() {
  const { hasRole } = useCurrentUser()
  const canEdit = hasRole(...STOCK_EDITORS)
  const lookups = useStockLookups()
  const scope = useLocationScope()
  const list = useResource(() => stockAdjustments.list({ filter: locationFilter(scope, "locationId"), sort: { CreatedDate: -1 }, pageSize: 200 }), [scope.key])
  const [creating, setCreating] = React.useState(false)
  const [viewing, setViewing] = React.useState<StockAdjustment>()

  React.useEffect(() => {
    void repairIfDue()
  }, [])

  const data = lookups.data
  const rows = list.data?.items ?? []
  return (
    <>
      <PageHeader
        title="Adjustments"
        description="Add or remove stock with a reason, like opening stock, damage or a count correction."
        actions={
          canEdit ? (
            <Button onClick={() => setCreating(true)} disabled={!data}>
              <Plus aria-hidden /> New adjustment
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
          <EmptyState icon={ClipboardList} message="No adjustments yet." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className={headClass}>Number</TableHead>
                  <TableHead className={headClass}>Date</TableHead>
                  <TableHead className={headClass}>Location</TableHead>
                  <TableHead className={cn(headClass, "hidden md:table-cell")}>Reason</TableHead>
                  <TableHead className={cn(headClass, "hidden lg:table-cell text-right")}>Lines</TableHead>
                  <TableHead className={headClass}>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((doc) => (
                  <TableRow key={doc.ItemId} className="h-11 cursor-pointer" onClick={() => setViewing(doc)}>
                    <TableCell className="font-mono text-[13px]">{doc.number}</TableCell>
                    <TableCell className="text-sm">{formatDateTime(doc.adjustedAt)}</TableCell>
                    <TableCell>{data.locationName(doc.locationId)}</TableCell>
                    <TableCell className="hidden md:table-cell">{data.reasons.find((reason) => reason.ItemId === doc.reasonId)?.name}</TableCell>
                    <TableCell className="hidden text-right num lg:table-cell">{doc.lines?.length ?? 0}</TableCell>
                    <TableCell>
                      <DocumentStatus status={doc.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
      {creating && data ? (
        <NewAdjustment
          lookups={data}
          canOverride={hasRole(...STOCK_REVIEWERS)}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            void list.reload()
            void lookups.reload()
          }}
        />
      ) : null}
      {viewing && data ? (
        <AdjustmentDetail
          doc={viewing}
          lookups={data}
          canEdit={canEdit}
          canOverride={hasRole(...STOCK_REVIEWERS)}
          onClose={() => setViewing(undefined)}
          onChanged={() => {
            setViewing(undefined)
            void list.reload()
          }}
        />
      ) : null}
    </>
  )
}

function NewAdjustment({ lookups, canOverride, onClose, onDone }: { lookups: StockLookups; canOverride: boolean; onClose: () => void; onDone: () => void }) {
  const scope = useLocationScope()
  const defaultLocation = lookups.locations.find((location) => location.isDefault && location.isActive !== false)?.ItemId ?? ""
  const [locationId, setLocationId] = React.useState(defaultLocation)
  const [reasonId, setReasonId] = React.useState("")
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [remarks, setRemarks] = React.useState("")
  const [allowNegative, setAllowNegative] = React.useState(false)
  const [lines, setLines] = React.useState<LineDraft[]>([emptyLine()])
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>({})
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string>()

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!locationId || !reasonId) {
      setSaveError("Choose a location and a reason.")
      return
    }
    const lotNumbers = (productId: string) => new Set(lookups.lots.filter((lot) => lot.productId === productId).map((lot) => lot.lotNumber))
    const problems = Object.fromEntries(
      lines.map((line) => [line.key, lineProblem(line, lookups.product(line.productId), { lotsExist: (number) => lotNumbers(line.productId).has(number) })])
    )
    setErrors(problems)
    if (Object.values(problems).some(Boolean)) {
      setSaveError("Fix the highlighted lines.")
      return
    }
    setSaving(true)
    setSaveError(undefined)
    try {
      // Keep the time of day for today's date, so the ledger order stays true.
      const today = new Date().toISOString().slice(0, 10)
      const adjustedAt = date === today ? new Date().toISOString() : new Date(`${date}T12:00:00Z`).toISOString()
      const doc = await createAdjustment({ locationId, reasonId, adjustedAt, remarks, lines, lookups, allowNegative: canOverride && allowNegative })
      toast.success(`${doc.number} posted`)
      onDone()
    } catch (caught) {
      setSaveError(`${postingMessage(caught, lookups)} Nothing was changed for this adjustment.`)
      if (!(caught instanceof PostingError)) return
      // The document exists as failed; refresh so it shows in the list.
      onDone()
      toast.error(postingMessage(caught, lookups))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New adjustment</DialogTitle>
          <DialogDescription>Stock changes the moment you save. Quantities are converted to each product's standard unit.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4">
          {saveError ? <ErrorBanner message={saveError} /> : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SelectField
              id="adjustment-location"
              label="Location"
              required
              options={lookups.locations.filter((location) => location.isActive !== false && seesLocation(scope, location.ItemId)).map((location) => ({ value: location.ItemId, label: location.name }))}
              value={locationId}
              onChange={setLocationId}
            />
            <SelectField
              id="adjustment-reason"
              label="Reason"
              required
              options={lookups.reasons.filter((reason) => reason.isActive !== false).map((reason) => ({ value: reason.ItemId, label: reason.name }))}
              value={reasonId}
              onChange={setReasonId}
            />
            <DateField id="adjustment-date" label="Date" value={date} onChange={setDate} />
          </div>
          <LineEditor lines={lines} onChange={setLines} lookups={lookups} locationId={locationId} mode="adjustment" disabled={saving} errors={errors} />
          <TextAreaField id="adjustment-remarks" label="Remarks" value={remarks} onChange={setRemarks} />
          {canOverride ? (
            <CheckboxField
              id="adjustment-negative"
              label="Allow stock to go below zero"
              helper="Only for correcting mistakes. Without this, a removal larger than on hand is refused."
              checked={allowNegative}
              onChange={setAllowNegative}
            />
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-w-28">
              {saving ? "Posting…" : "Save and post"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AdjustmentDetail({
  doc,
  lookups,
  canEdit,
  canOverride,
  onClose,
  onChanged,
}: {
  doc: StockAdjustment
  lookups: StockLookups
  canEdit: boolean
  canOverride: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const [confirmCancel, setConfirmCancel] = React.useState(false)
  // Lot numbers may belong to lots created after the screen loaded.
  const lotRows = useResource(async () => {
    const ids = doc.lines.map((line) => line.lotId).filter(Boolean) as string[]
    return ids.length ? (await lots.list({ filter: { ItemId: { $in: ids } }, pageSize: 200 })).items : []
  }, [doc.ItemId])
  const lotNumber = (id?: string | null) => lotRows.data?.find((lot) => lot.ItemId === id)?.lotNumber ?? lookups.lotNumber(id)

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

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono">{doc.number}</span> <DocumentStatus status={doc.status} />
          </DialogTitle>
          <DialogDescription>
            {lookups.locationName(doc.locationId)} · {lookups.reasons.find((reason) => reason.ItemId === doc.reasonId)?.name} · {formatDateTime(doc.adjustedAt)}
          </DialogDescription>
        </DialogHeader>
        {error ? <ErrorBanner message={error} /> : null}
        {doc.remarks ? <p className="text-sm text-muted-foreground">{doc.remarks}</p> : null}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className={headClass}>Product</TableHead>
                <TableHead className={headClass}>Bin</TableHead>
                <TableHead className={headClass}>Lot or serial</TableHead>
                <TableHead className={cn(headClass, "text-right")}>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.lines.map((line) => {
                const product = lookups.product(line.productId)
                return (
                  <TableRow key={line.lineId} className="h-11">
                    <TableCell>{product?.name}</TableCell>
                    <TableCell className="font-mono text-[13px]">{lookups.binCode(line.sublocationId)}</TableCell>
                    <TableCell className="font-mono text-[13px]">{line.serial ?? lotNumber(line.lotId)}</TableCell>
                    <TableCell className="text-right num">
                      {line.qtyDelta > 0 ? "+" : ""}
                      {formatNumber(line.qtyDelta)} {product?.standardUom}
                      {line.uom && line.uom !== product?.standardUom ? (
                        <span className="block text-xs text-muted-foreground">
                          entered {formatNumber(line.enteredQty)} {line.uom}
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        {confirmCancel ? (
          <ErrorBanner message="Cancelling writes reversing movements for every line. The adjustment stays in the history as cancelled." />
        ) : null}
        <DialogFooter className="gap-2">
          {canEdit && (doc.status === "posted" || doc.status === "cancelling") ? (
            confirmCancel ? (
              <Button variant="destructive" disabled={busy} onClick={() => void run(() => cancelAdjustment(doc), `${doc.number} cancelled`)}>
                {busy ? "Cancelling…" : "Yes, cancel and reverse"}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
                Cancel adjustment
              </Button>
            )
          ) : null}
          {canEdit && doc.status === "failed" ? (
            <Button disabled={busy} onClick={() => void run(() => retryAdjustment(doc, lookups, canOverride), `${doc.number} posted`)}>
              {busy ? "Posting…" : "Try posting again"}
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
