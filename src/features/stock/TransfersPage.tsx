import * as React from "react"
import { ArrowRight, Plus, Truck } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { formatDateTime } from "@/components/app/audit"
import { SelectField, TextAreaField } from "@/components/app/form"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useResource } from "@/hooks/use-resource"
import { formatDate, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { cancelTransfer, createTransfer, receiveTransfer, sendTransfer } from "./actions"
import { allocateLots, lots, repairIfDue, stockTransfers, type StockTransfer } from "./api"
import { DocumentStatus, STOCK_EDITORS, postingMessage } from "./AdjustmentsPage"
import { LineEditor, emptyLine, lineProblem, type LineDraft } from "./LineEditor"
import { useStockLookups, type StockLookups } from "./lookups"

// Transfers between locations: Open → In transit → Completed (spec 0008 AC-2).
// Approval (AC-3, optional) is not built.

const headClass = "h-9 text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase"

export function TransfersPage() {
  const canEdit = useCurrentUser().hasRole(...STOCK_EDITORS)
  const lookups = useStockLookups()
  const list = useResource(() => stockTransfers.list({ sort: { CreatedDate: -1 }, pageSize: 200 }), [])
  const [creating, setCreating] = React.useState(false)
  const [viewing, setViewing] = React.useState<StockTransfer>()

  React.useEffect(() => {
    void repairIfDue()
  }, [])

  const data = lookups.data
  const rows = list.data?.items ?? []
  return (
    <>
      <PageHeader
        title="Transfers"
        description="Move stock between locations. Sent stock shows as in transit until it is received."
        actions={
          canEdit ? (
            <Button onClick={() => setCreating(true)} disabled={!data}>
              <Plus aria-hidden /> New transfer
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
          <EmptyState icon={Truck} message="No transfers yet." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className={headClass}>Number</TableHead>
                  <TableHead className={headClass}>Route</TableHead>
                  <TableHead className={cn(headClass, "hidden md:table-cell")}>Created</TableHead>
                  <TableHead className={cn(headClass, "hidden lg:table-cell text-right")}>Lines</TableHead>
                  <TableHead className={headClass}>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((doc) => (
                  <TableRow key={doc.ItemId} className="h-11 cursor-pointer" onClick={() => setViewing(doc)}>
                    <TableCell className="font-mono text-[13px]">{doc.number}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1">
                        {data.locationName(doc.fromLocationId)} <ArrowRight className="size-4 text-muted-foreground" aria-label="to" /> {data.locationName(doc.toLocationId)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{formatDate(doc.CreatedDate)}</TableCell>
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
        <NewTransfer
          lookups={data}
          onClose={() => setCreating(false)}
          onDone={(doc) => {
            setCreating(false)
            void list.reload()
            void lookups.reload()
            setViewing(doc)
          }}
        />
      ) : null}
      {viewing && data ? (
        <TransferDetail
          doc={viewing}
          lookups={data}
          canEdit={canEdit}
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

function NewTransfer({ lookups, onClose, onDone }: { lookups: StockLookups; onClose: () => void; onDone: (doc: StockTransfer) => void }) {
  const active = lookups.locations.filter((location) => location.isActive !== false)
  const [fromLocationId, setFrom] = React.useState(active.find((location) => location.isDefault)?.ItemId ?? "")
  const [toLocationId, setTo] = React.useState("")
  const [remarks, setRemarks] = React.useState("")
  const [lines, setLines] = React.useState<LineDraft[]>([{ ...emptyLine(), direction: "out" }])
  const [hints, setHints] = React.useState<Record<string, string>>({})
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>({})
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string>()

  // Suggest the lot that expires first for lot tracked lines (spec 0009 AC-4).
  React.useEffect(() => {
    let cancelled = false
    for (const line of lines) {
      const product = lookups.product(line.productId)
      if (!product?.trackLots || line.lotNumber || !fromLocationId || hints[line.key]) continue
      void allocateLots(product.ItemId, fromLocationId).then((candidates) => {
        if (cancelled) return
        const first = candidates[0]
        setHints((current) => ({
          ...current,
          [line.key]: first
            ? `Suggested lot ${first.lot.lotNumber} (${formatNumber(first.onHand)} on hand${first.lot.expiresOn ? `, expires ${formatDate(first.lot.expiresOn)}` : ""}). Expired lots are never suggested.`
            : "No unexpired lot of this product has stock here.",
        }))
        if (first) setLines((current) => current.map((item) => (item.key === line.key && !item.lotNumber ? { ...item, lotNumber: first.lot.lotNumber } : item)))
      })
    }
    return () => {
      cancelled = true
    }
  }, [lines, fromLocationId, lookups, hints])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!fromLocationId || !toLocationId) return setSaveError("Choose both locations.")
    if (fromLocationId === toLocationId) return setSaveError("The two locations must differ.")
    const problems = Object.fromEntries(
      lines.map((line) => [
        line.key,
        lineProblem({ ...line, direction: "out" }, lookups.product(line.productId), {
          lotsExist: (number) => lookups.lots.some((lot) => lot.productId === line.productId && lot.lotNumber === number),
        }),
      ])
    )
    setErrors(problems)
    if (Object.values(problems).some(Boolean)) return setSaveError("Fix the highlighted lines.")
    setSaving(true)
    setSaveError(undefined)
    try {
      const doc = await createTransfer({ fromLocationId, toLocationId, remarks, lines, lookups })
      toast.success(`${doc.number} saved. Send it when the stock leaves.`)
      onDone(doc)
    } catch (caught) {
      setSaveError(postingMessage(caught, lookups))
    } finally {
      setSaving(false)
    }
  }

  const options = active.map((location) => ({ value: location.ItemId, label: location.name }))
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New transfer</DialogTitle>
          <DialogDescription>Saving creates an open transfer. Stock moves when you send it and when it is received.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4">
          {saveError ? <ErrorBanner message={saveError} /> : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField id="transfer-from" label="From" required options={options} value={fromLocationId} onChange={setFrom} />
            <SelectField id="transfer-to" label="To" required options={options.filter((option) => option.value !== fromLocationId)} value={toLocationId} onChange={setTo} />
          </div>
          <LineEditor lines={lines} onChange={setLines} lookups={lookups} locationId={fromLocationId} toLocationId={toLocationId} mode="transfer" disabled={saving} errors={errors} />
          {Object.entries(hints).map(([key, hint]) =>
            lines.some((line) => line.key === key) ? (
              <p key={key} className="text-xs text-muted-foreground">
                {lookups.product(lines.find((line) => line.key === key)?.productId)?.name}: {hint}
              </p>
            ) : null
          )}
          <TextAreaField id="transfer-remarks" label="Remarks" value={remarks} onChange={setRemarks} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-w-24">
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TransferDetail({ doc, lookups, canEdit, onClose, onChanged }: { doc: StockTransfer; lookups: StockLookups; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const [confirmCancel, setConfirmCancel] = React.useState(false)
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
            {lookups.locationName(doc.fromLocationId)} to {lookups.locationName(doc.toLocationId)}
            {doc.sentAt ? ` · sent ${formatDateTime(doc.sentAt)}` : ""}
            {doc.receivedAt ? ` · received ${formatDateTime(doc.receivedAt)}` : ""}
          </DialogDescription>
        </DialogHeader>
        {error ? <ErrorBanner message={error} /> : null}
        {doc.remarks ? <p className="text-sm text-muted-foreground">{doc.remarks}</p> : null}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className={headClass}>Product</TableHead>
                <TableHead className={headClass}>Bins</TableHead>
                <TableHead className={headClass}>Lot or serial</TableHead>
                <TableHead className={cn(headClass, "text-right")}>Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.lines.map((line) => {
                const product = lookups.product(line.productId)
                return (
                  <TableRow key={line.lineId} className="h-11">
                    <TableCell>{product?.name}</TableCell>
                    <TableCell className="font-mono text-[13px]">
                      {lookups.binCode(line.fromSublocationId) || "none"} → {lookups.binCode(line.toSublocationId) || "none"}
                    </TableCell>
                    <TableCell className="font-mono text-[13px]">{line.serial ?? lotNumber(line.lotId)}</TableCell>
                    <TableCell className="text-right num">
                      {formatNumber(line.qty)} {product?.standardUom}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        {confirmCancel ? (
          <ErrorBanner
            message={doc.status === "in_transit" ? "The sent stock goes back to the source location. The transfer stays in the history as cancelled." : "The transfer is cancelled. No stock has moved yet."}
          />
        ) : null}
        <DialogFooter className="gap-2">
          {canEdit && ["open", "in_transit", "cancelling"].includes(doc.status) ? (
            confirmCancel ? (
              <Button variant="destructive" disabled={busy} onClick={() => void run(() => cancelTransfer(doc), `${doc.number} cancelled`)}>
                {busy ? "Cancelling…" : "Yes, cancel"}
              </Button>
            ) : (
              <Button variant="secondary" className="sm:mr-auto" onClick={() => setConfirmCancel(true)}>
                Cancel transfer
              </Button>
            )
          ) : null}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
          {canEdit && doc.status === "open" ? (
            <Button disabled={busy} onClick={() => void run(() => sendTransfer(doc, lookups), `${doc.number} sent`)}>
              {busy ? "Sending…" : "Send"}
            </Button>
          ) : null}
          {canEdit && doc.status === "in_transit" ? (
            <Button disabled={busy} onClick={() => void run(() => receiveTransfer(doc, lookups), `${doc.number} received`)}>
              {busy ? "Receiving…" : "Receive"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
