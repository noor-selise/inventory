import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { formatDateTime } from "@/components/app/audit"
import { ErrorBanner, LoadingRows } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/app/date-picker"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PaymentDialog } from "@/features/payments/PaymentDialog"
import { payments } from "@/features/payments/api"
import { type OrderLookups } from "@/features/sales/lookups"
import { COST_VIEWERS, PURCHASE_EDITORS, RECEIVERS } from "@/features/team/roles"
import { discounted, landedUnitCosts } from "@/features/sales/order-math"
import { HistoryList, InventoryBadge, PaymentBadge, TotalsBlock, headClass } from "@/features/sales/OrderBits"
import { postingMessage } from "@/features/stock/AdjustmentsPage"
import { useResource } from "@/hooks/use-resource"
import { formatDate, formatMoney, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { canApprove } from "@/features/team/profile"
import { toHome } from "@/features/sales/order-math"
import { seesLocation, useLocationScope } from "@/features/team/location-scope"
import {
  applyVendorPrices,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  convertPurchaseOrder,
  finishPurchaseStep,
  receiveLines,
  vendorPriceChanges,
  type ReceiveRequest,
} from "./actions"
import { purchaseOrders, type PurchaseOrder } from "./api"

// One purchase order: lines with what is received, receiving with bins, lots
// and serials, payments and history (spec 0012).

export function PurchaseOrderDetail({
  orderId,
  lookups,
  onClose,
  onEdit,
  onChanged,
}: {
  orderId: string
  lookups: OrderLookups
  onClose: () => void
  onEdit: (order: PurchaseOrder) => void
  onChanged: () => void
}) {
  const { hasRole, user, profile, isAdmin } = useCurrentUser()
  const by = user?.email ?? "unknown"
  const approver = { by, profile, isAdmin }
  const canEdit = hasRole(...PURCHASE_EDITORS)
  const canReceive = hasRole(...RECEIVERS)
  const canSeeCost = hasRole(...COST_VIEWERS)
  const scope = useLocationScope()
  const loaded = useResource(() => purchaseOrders.get(orderId), [orderId])
  const paid = useResource(async () => (await payments.list({ filter: { "allocations.orderId": orderId }, pageSize: 200 })).items, [orderId])
  const [dialog, setDialog] = React.useState<"receive" | "return" | "pay" | "cancel" | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  // The price list lives in the screen's lookups, so hide the prompt once applied here.
  const [pricesApplied, setPricesApplied] = React.useState(false)
  const order = loaded.data

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      toast.success(success)
      setDialog(null)
      await loaded.reload()
      await paid.reload()
      onChanged()
    } catch (caught) {
      setError(postingMessage(caught, { product: lookups.productOf } as never))
    } finally {
      setBusy(false)
    }
  }

  if (!order) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Loading purchase order</DialogTitle>
            <DialogDescription>One moment.</DialogDescription>
          </DialogHeader>
          {loaded.error ? <ErrorBanner message={loaded.error} onRetry={loaded.reload} /> : <LoadingRows />}
        </DialogContent>
      </Dialog>
    )
  }

  // Location limits (spec 0003): app side only, like the rep restriction.
  if (!seesLocation(scope, order.receiveLocationId)) {
    return (
      <Dialog open onOpenChange={(value) => !value && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>No access to this location</DialogTitle>
            <DialogDescription>This purchase order belongs to a location you are not set up for. Ask an owner to add it on the Team screen.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  const open = !order.isQuote && !order.isCancelled
  const left = (line: PurchaseOrder["lines"][number]) => Math.abs(Number(line.stdQty)) - Math.abs(Number(line.receivedQty ?? 0))
  const toReceive = order.lines.some((line) => line.stdQty > 0 && left(line) > 0)
  const toReturn = order.lines.some((line) => line.stdQty < 0 && left(line) > 0)
  const posting = (order.stockSteps ?? []).filter((step) => step.status === "posting")
  const total = Number(order.total ?? 0)
  const due = total - Number(order.amountPaid ?? 0)
  const landed = landedUnitCosts(order, (id) => lookups.productOf(id))
  const unapproved = order.inventoryStatus === "unapproved"
  const totalHome = toHome(total, order.exchangeRate)
  const mayApprove = canApprove(profile, totalHome, isAdmin)
  // Offer the price list update once stock has come in from this PO (spec 0012 AC-7).
  const priceChanges = canEdit && !pricesApplied && order.lines.some((line) => Number(line.receivedQty ?? 0) > 0) ? vendorPriceChanges(order, lookups.vendorItems, lookups.homeCurrency) : []

  return (
    <Dialog open onOpenChange={(value) => !value && !busy && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{order.number}</span>
            <InventoryBadge status={order.inventoryStatus} />
            <PaymentBadge status={order.paymentStatus} />
          </DialogTitle>
          <DialogDescription>
            {lookups.vendorOf(order.vendorId)?.name} · {formatDate(order.orderDate)} · receive at {lookups.locationName(order.receiveLocationId)}
            {order.vendorOrderNumber ? ` · vendor ref ${order.vendorOrderNumber}` : ""}
          </DialogDescription>
        </DialogHeader>
        {error ? <ErrorBanner message={error} /> : null}
        {posting.length ? (
          <div className="flex flex-col gap-2 rounded-md border border-warning bg-warning/10 p-3 text-sm sm:flex-row sm:items-center">
            <span className="flex-1">A receipt from {formatDateTime(posting[0].at)} did not finish. Settle it from the ledger.</span>
            <Button size="sm" disabled={busy} onClick={() => void run(() => finishPurchaseStep(order, posting[0], lookups, by), "Receipt settled")}>
              Finish it
            </Button>
          </div>
        ) : null}
        {unapproved && open ? (
          <div className="flex flex-col gap-2 rounded-md border border-warning bg-warning/10 p-3 text-sm sm:flex-row sm:items-center">
            <span className="flex-1">
              Waiting for approval by someone whose limit covers {formatMoney(totalHome, lookups.homeCurrency)}. It can be received once approved.
            </span>
            {mayApprove ? (
              <Button size="sm" disabled={busy} onClick={() => void run(() => approvePurchaseOrder(order, approver), "Approved")}>
                Approve
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Your approval limit does not cover this order.</span>
            )}
          </div>
        ) : null}
        {priceChanges.length ? (
          <div className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center">
            <span className="flex-1">
              Prices here differ from {lookups.vendorOf(order.vendorId)?.name}'s price list:{" "}
              {priceChanges.map((change) => `${lookups.productOf(change.productId)?.name} ${change.oldCost == null ? "new" : formatMoney(change.oldCost, change.currencyCode)} → ${formatMoney(change.newCost, change.currencyCode)}`).join(", ")}. Update the price list?
            </span>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(async () => {
                  await applyVendorPrices(order, priceChanges)
                  setPricesApplied(true)
                }, "Vendor price list updated")}>
              Update price list
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canEdit && !order.isCancelled ? (
            <Button variant="secondary" onClick={() => onEdit(order)} disabled={busy}>
              Edit
            </Button>
          ) : null}
          {canEdit && !order.isCancelled ? (
            <Button variant="secondary" disabled={busy} onClick={() => void run(() => convertPurchaseOrder(order, by, approver), order.isQuote ? "Converted to an order" : "Back to a quote")}>
              {order.isQuote ? "Convert to order" : "Back to quote"}
            </Button>
          ) : null}
          {open && canReceive && toReceive && !unapproved ? (
            <Button disabled={busy} onClick={() => setDialog("receive")}>
              Receive
            </Button>
          ) : null}
          {open && canReceive && toReturn && !unapproved ? (
            <Button disabled={busy} onClick={() => setDialog("return")}>
              Return to vendor
            </Button>
          ) : null}
          {open && canEdit && due > 0.005 ? (
            <Button variant="secondary" disabled={busy} onClick={() => setDialog("pay")}>
              Pay vendor
            </Button>
          ) : null}
          {canEdit && !order.isQuote ? (
            <Button variant="ghost" className="sm:ml-auto" disabled={busy} onClick={() => setDialog("cancel")}>
              {order.isCancelled ? "Run cancel again" : "Cancel order"}
            </Button>
          ) : null}
        </div>
        <Tabs defaultValue="lines">
          <TabsList aria-label="Order sections">
            <TabsTrigger value="lines">Lines</TabsTrigger>
            <TabsTrigger value="receipts">Receipts</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="lines" className="flex flex-col gap-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className={headClass}>Product</TableHead>
                    <TableHead className={cn(headClass, "text-right")}>Ordered</TableHead>
                    <TableHead className={cn(headClass, "text-right")}>Received</TableHead>
                    <TableHead className={cn(headClass, "text-right")}>Price</TableHead>
                    {canSeeCost ? <TableHead className={cn(headClass, "text-right")}>Landed unit cost</TableHead> : null}
                    <TableHead className={cn(headClass, "text-right")}>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((line) => {
                    const product = lookups.productOf(line.productId)
                    return (
                      <TableRow key={line.lineId} className="h-11">
                        <TableCell>
                          <span className="block">{product?.name}</span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {line.vendorItemCode ?? product?.sku}
                            {line.stdQty < 0 ? " · return to vendor" : ""}
                          </span>
                        </TableCell>
                        <TableCell className="text-right num">
                          {formatNumber(line.qty)} {line.uom}
                        </TableCell>
                        <TableCell className="text-right num">
                          {formatNumber(Math.abs(Number(line.receivedQty ?? 0)))} {product?.standardUom}
                        </TableCell>
                        <TableCell className="text-right num">{formatMoney(discounted(line.unitPrice, line.discountType, line.discount), order.currencyCode)}</TableCell>
                        {canSeeCost ? (
                          <TableCell className="text-right num">{landed.has(line.lineId) ? formatMoney(landed.get(line.lineId)!, lookups.homeCurrency) : ""}</TableCell>
                        ) : null}
                        <TableCell className="text-right num">{formatMoney(line.qty * discounted(line.unitPrice, line.discountType, line.discount), order.currencyCode)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <TotalsBlock
              currency={order.currencyCode}
              rows={[
                { label: "Subtotal", value: Number(order.subtotal ?? 0) },
                { label: "Freight", value: Number(order.freight ?? 0) },
                { label: "Tax", value: Number(order.taxTotal ?? 0) },
                { label: "Total", value: total, strong: true },
                { label: "Paid", value: Number(order.amountPaid ?? 0) },
                { label: due < 0 ? "Vendor owes you" : "Balance due", value: Math.abs(due), strong: true },
              ]}
            />
          </TabsContent>
          <TabsContent value="receipts" className="text-sm">
            {(order.stockSteps ?? []).length === 0 ? <p className="text-muted-foreground">Nothing received yet.</p> : null}
            <ul className="flex flex-col gap-1">
              {(order.stockSteps ?? []).map((step) => (
                <li key={step.stepId}>
                  {formatDateTime(step.at)} · {step.kind === "unstock" ? "returned" : "received"} · {step.status} ·{" "}
                  {step.lines
                    .map((item) => {
                      const product = lookups.productOf(order.lines.find((line) => line.lineId === item.lineId)?.productId)
                      const where = [lookups.binCode(item.sublocationId), item.serial].filter(Boolean).join(" ")
                      return `${product?.name} × ${formatNumber(item.qty)}${where ? ` (${where})` : ""}${canSeeCost && item.unitCost != null ? ` at ${formatMoney(item.unitCost, lookups.homeCurrency)}` : ""}`
                    })
                    .join(", ")}
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="payments" className="text-sm">
            {paid.data && paid.data.length === 0 ? <p className="text-muted-foreground">No payments yet.</p> : null}
            <ul className="flex flex-col gap-1">
              {(paid.data ?? []).map((payment) => (
                <li key={payment.ItemId} className={cn(payment.isVoided && "text-muted-foreground line-through")}>
                  <span className="font-mono">{payment.number}</span> · {formatDate(payment.paidOn)} · {formatMoney(payment.allocations.find((item) => item.orderId === order.ItemId)?.amount ?? 0, payment.currencyCode)}
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="history">
            <HistoryList events={order.history} />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </DialogFooter>
        {dialog === "receive" || dialog === "return" ? (
          <ReceiveDialog
            order={order}
            lookups={lookups}
            returns={dialog === "return"}
            busy={busy}
            onClose={() => setDialog(null)}
            onReceive={(requests) => run(() => receiveLines(order, requests, lookups, by), dialog === "return" ? "Returned to vendor" : "Received")}
          />
        ) : null}
        {dialog === "pay" ? (
          <PaymentDialog
            lookups={lookups}
            party="vendor"
            partyId={order.vendorId}
            currencyCode={order.currencyCode}
            preset={{ orderType: "purchase", orderId: order.ItemId, orderNumber: order.number, amount: Math.max(0, Math.round(due * 100) / 100) }}
            onClose={() => setDialog(null)}
            onSaved={() => {
              setDialog(null)
              void loaded.reload()
              void paid.reload()
              onChanged()
            }}
          />
        ) : null}
        {dialog === "cancel" ? (
          <Dialog open onOpenChange={(value) => !value && !busy && setDialog(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Cancel {order.number}?</DialogTitle>
                <DialogDescription>Received stock is taken back out and returns go back in. Payments become vendor credit. The average cost is not rewound.</DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
                  Keep it
                </Button>
                <Button variant="destructive" disabled={busy} onClick={() => void run(() => cancelPurchaseOrder(order, by), `${order.number} cancelled`)}>
                  {busy ? "Cancelling…" : "Yes, cancel"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type Row = { key: string; lineId: string; qty: string; binCode: string; lotNumber: string; lotExpiresOn: string; serial: string }

/** Receive into bins with lot or serial; one row per serial. Add rows to split a line over bins or lots. */
function ReceiveDialog({ order, lookups, returns, busy, onClose, onReceive }: { order: PurchaseOrder; lookups: OrderLookups; returns: boolean; busy: boolean; onClose: () => void; onReceive: (requests: ReceiveRequest[]) => Promise<void> }) {
  const lines = order.lines.filter((line) => (returns ? line.stdQty < 0 : line.stdQty > 0) && Math.abs(line.stdQty) - Math.abs(Number(line.receivedQty ?? 0)) > 0)
  const [rows, setRows] = React.useState<Row[]>(() =>
    lines.map((line) => {
      const product = lookups.productOf(line.productId)
      const left = Math.abs(line.stdQty) - Math.abs(Number(line.receivedQty ?? 0))
      return { key: crypto.randomUUID(), lineId: line.lineId, qty: String(product?.trackSerials ? 1 : left), binCode: "", lotNumber: "", lotExpiresOn: "", serial: "" }
    })
  )
  const set = (key: string, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  return (
    <Dialog open onOpenChange={(value) => !value && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {returns ? "Return to vendor" : "Receive"} {order.number}
          </DialogTitle>
          <DialogDescription>
            {returns ? "Stock leaves" : "Stock arrives at"} {lookups.locationName(order.receiveLocationId)}. Quantities are in each product's standard unit. New bins and lots are created as you type them.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {lines.map((line) => {
            const product = lookups.productOf(line.productId)
            const left = Math.abs(line.stdQty) - Math.abs(Number(line.receivedQty ?? 0))
            const stocked = product?.itemType === "stocked"
            return (
              <section key={line.lineId} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {product?.name} <span className="font-normal text-muted-foreground">· {formatNumber(left)} {product?.standardUom} left</span>
                  </h3>
                  {stocked ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setRows((current) => [...current, { key: crypto.randomUUID(), lineId: line.lineId, qty: product?.trackSerials ? "1" : "", binCode: "", lotNumber: "", lotExpiresOn: "", serial: "" }])}
                    >
                      <Plus aria-hidden /> Row
                    </Button>
                  ) : null}
                </div>
                {rows
                  .filter((row) => row.lineId === line.lineId)
                  .map((row) => (
                    <div key={row.key} className="mb-1 flex flex-wrap gap-2">
                      <Input aria-label="Quantity" type="number" step="any" className="h-8 w-24 text-right num" value={row.qty} onChange={(event) => set(row.key, { qty: event.target.value })} disabled={product?.trackSerials === true} />
                      {stocked ? <Input aria-label="Bin" placeholder="Bin" className="h-8 w-28 font-mono" value={row.binCode} onChange={(event) => set(row.key, { binCode: event.target.value })} /> : null}
                      {stocked && product?.trackLots ? (
                        <>
                          <Input aria-label="Lot number" placeholder="Lot" className="h-8 w-32 font-mono" value={row.lotNumber} onChange={(event) => set(row.key, { lotNumber: event.target.value })} />
                          {!returns ? <DatePicker id={`expiry-${row.key}`} aria-label="Lot expiry" className="w-40" value={row.lotExpiresOn} onChange={(lotExpiresOn) => set(row.key, { lotExpiresOn })} clearable placeholder="Expiry" /> : null}
                        </>
                      ) : null}
                      {stocked && product?.trackSerials ? <Input aria-label="Serial" placeholder="Serial" className="h-8 w-40 font-mono" value={row.serial} onChange={(event) => set(row.key, { serial: event.target.value })} /> : null}
                    </div>
                  ))}
              </section>
            )
          })}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void onReceive(rows.map((row) => ({ lineId: row.lineId, qty: Number(row.qty) || 0, binCode: row.binCode, lotNumber: row.lotNumber, lotExpiresOn: row.lotExpiresOn, serial: row.serial })))}>
            {busy ? "Saving…" : returns ? "Return" : "Receive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
