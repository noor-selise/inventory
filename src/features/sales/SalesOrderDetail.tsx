import * as React from "react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { formatDateTime } from "@/components/app/audit"
import { SelectField, TextField } from "@/components/app/form"
import { ErrorBanner, LoadingRows } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { resolveBin } from "@/features/locations/api"
import { formatAddress } from "@/features/partners/api"
import { PaymentDialog } from "@/features/payments/PaymentDialog"
import { payments } from "@/features/payments/api"
import { lots, posting, resolveLot } from "@/features/stock/api"
import { postingMessage } from "@/features/stock/AdjustmentsPage"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatDate, formatMoney, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  cancelSalesOrder,
  convertSalesOrder,
  finishSalesStep,
  fulfillAll,
  invoiceOrder,
  packAll,
  packLines,
  pickAll,
  pickLines,
  restockLines,
  setServiceDone,
  shipAll,
  shipPackages,
  suggestPicks,
  type PickRequest,
} from "./actions"
import { salesOrders, type SalesOrder } from "./api"
import { COST_VIEWERS, FULFILLERS, SALES_EDITORS, type OrderLookups } from "./lookups"
import { isReturn, salesLineRemaining, toHome } from "./order-math"
import { HistoryList, InventoryBadge, PaymentBadge, TotalsBlock, headClass } from "./OrderBits"

// One sales order: lines with their progress, fulfillment, payments, history
// and profit (spec 0011). Every button calls one action in ./actions.

type StepDialog = "pick" | "pack" | "ship" | "restock" | "pay" | "cancel" | null

export function SalesOrderDetail({
  orderId,
  lookups,
  onClose,
  onEdit,
  onChanged,
}: {
  orderId: string
  lookups: OrderLookups
  onClose: () => void
  onEdit: (order: SalesOrder) => void
  onChanged: () => void
}) {
  const { hasRole, user } = useCurrentUser()
  const by = user?.email ?? "unknown"
  const canEdit = hasRole(...SALES_EDITORS)
  const canFulfill = hasRole(...FULFILLERS)
  const canSeeCost = hasRole(...COST_VIEWERS)
  const loaded = useResource(() => salesOrders.get(orderId), [orderId])
  const paid = useResource(async () => (await payments.list({ filter: { "allocations.orderId": orderId }, pageSize: 200 })).items, [orderId])
  const [dialog, setDialog] = React.useState<StepDialog>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const [invoiceDate, setInvoiceDate] = React.useState(new Date().toISOString().slice(0, 10))

  const order = loaded.data
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError(undefined)
    try {
      const result = await action()
      const short = (result as { short?: { lineId: string; missing: number }[] } | undefined)?.short
      if (short?.length && order) {
        toast.warning(
          `${success}. Short: ${short.map((item) => `${lookups.productOf(order.lines.find((line) => line.lineId === item.lineId)?.productId)?.name} ${formatNumber(item.missing)}`).join(", ")} stays on back order.`
        )
      } else toast.success(success)
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
            <DialogTitle>Loading order</DialogTitle>
            <DialogDescription>One moment.</DialogDescription>
          </DialogHeader>
          {loaded.error ? <ErrorBanner message={loaded.error} onRetry={loaded.reload} /> : <LoadingRows />}
        </DialogContent>
      </Dialog>
    )
  }

  const open = !order.isQuote && !order.isCancelled
  const remaining = order.lines.map((line) => ({ line, ...salesLineRemaining(line), product: lookups.productOf(line.productId) }))
  const anyToPick = remaining.some((row) => row.toPick > 0 && row.product?.itemType !== "service")
  const anyToPack = remaining.some((row) => row.toPack > 0)
  const unshipped = (order.packages ?? []).filter((pack) => !pack.shipmentId)
  const anyToRestock = remaining.some((row) => row.toRestock > 0)
  const posting_ = (order.stockSteps ?? []).filter((step) => step.status === "posting")
  const total = Number(order.total ?? 0)
  const due = total - Number(order.amountPaid ?? 0)
  const revenueHome = toHome(Number(order.subtotal ?? 0), order.exchangeRate)
  const profit = revenueHome - Number(order.cogs ?? 0) - Number(order.nonCustomerCosts ?? 0)

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
            {lookups.customerOf(order.customerId)?.name} · {formatDate(order.orderDate)} · ships from {lookups.locationName(order.locationId)}
            {order.dueDate ? ` · due ${formatDate(order.dueDate)}` : ""}
            {order.customerPoNumber ? ` · customer PO ${order.customerPoNumber}` : ""}
          </DialogDescription>
        </DialogHeader>
        {error ? <ErrorBanner message={error} /> : null}
        {posting_.length ? (
          <div className="flex flex-col gap-2 rounded-md border border-warning bg-warning/10 p-3 text-sm sm:flex-row sm:items-center">
            <span className="flex-1">A {posting_[0].kind} from {formatDateTime(posting_[0].at)} did not finish (the page may have closed). Settle it from the ledger.</span>
            <Button size="sm" disabled={busy} onClick={() => void run(() => finishSalesStep(order, posting_[0], lookups, by), "Step settled")}>
              Finish it
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {canEdit && !order.isCancelled && order.inventoryStatus !== "fulfilled" ? (
            <Button variant="secondary" onClick={() => onEdit(order)} disabled={busy}>
              Edit
            </Button>
          ) : null}
          {canEdit && !order.isCancelled ? (
            <Button variant="secondary" disabled={busy} onClick={() => void run(() => convertSalesOrder(order, lookups, by), order.isQuote ? "Converted to an order" : "Back to a quote")}>
              {order.isQuote ? "Convert to order" : "Back to quote"}
            </Button>
          ) : null}
          {open && canFulfill && anyToPick ? (
            <Button disabled={busy} onClick={() => setDialog("pick")}>
              Pick
            </Button>
          ) : null}
          {open && canFulfill && anyToPack ? (
            <Button disabled={busy} onClick={() => setDialog("pack")}>
              Pack
            </Button>
          ) : null}
          {open && canFulfill && unshipped.length ? (
            <Button disabled={busy} onClick={() => setDialog("ship")}>
              Ship
            </Button>
          ) : null}
          {open && canFulfill && anyToRestock ? (
            <Button disabled={busy} onClick={() => setDialog("restock")}>
              Restock returns
            </Button>
          ) : null}
          {open && canEdit && due > 0.005 ? (
            <Button variant="secondary" disabled={busy} onClick={() => setDialog("pay")}>
              Record payment
            </Button>
          ) : null}
          {open && (canEdit || canFulfill) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" disabled={busy}>
                  Quick actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem disabled={!anyToPick || !canFulfill} onSelect={() => void run(() => pickAll(order, lookups, by), "Picked")}>
                  Pick all
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!anyToPack || !canFulfill} onSelect={() => void run(() => packAll(order, lookups, by), "Packed")}>
                  Pack all
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canFulfill} onSelect={() => void run(() => shipAll(order, lookups, by), "Shipped")}>
                  Ship all
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canFulfill} onSelect={() => void run(() => fulfillAll(order, lookups, by), "Fulfilled")}>
                  Fulfill
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!canEdit || Boolean(order.invoicedOn)} onSelect={() => void run(() => invoiceOrder(order, new Date().toISOString(), lookups, by), "Invoiced")}>
                  Invoice today
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canEdit || due <= 0.005} onSelect={() => setDialog("pay")}>
                  Pay in full
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canEdit && !order.isQuote ? (
            <Button variant="ghost" className="sm:ml-auto" disabled={busy} onClick={() => setDialog("cancel")}>
              {order.isCancelled ? "Run cancel again" : "Cancel order"}
            </Button>
          ) : null}
        </div>

        <Tabs defaultValue="lines">
          <TabsList>
            <TabsTrigger value="lines">Lines</TabsTrigger>
            <TabsTrigger value="fulfillment">Fulfillment</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            {canSeeCost ? <TabsTrigger value="profit">Profit</TabsTrigger> : null}
          </TabsList>

          <TabsContent value="lines" className="flex flex-col gap-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className={headClass}>Product</TableHead>
                    <TableHead className={cn(headClass, "text-right")}>Ordered</TableHead>
                    <TableHead className={cn(headClass, "text-right")}>Picked</TableHead>
                    <TableHead className={cn(headClass, "text-right")}>Packed</TableHead>
                    <TableHead className={cn(headClass, "text-right")}>Shipped</TableHead>
                    <TableHead className={cn(headClass, "text-right")}>Price</TableHead>
                    <TableHead className={cn(headClass, "text-right")}>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((line) => {
                    const product = lookups.productOf(line.productId)
                    const service = product?.itemType === "service"
                    return (
                      <TableRow key={line.lineId} className="h-11">
                        <TableCell>
                          <span className="block">{product?.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {line.description ?? product?.sku}
                            {isReturn(line) ? ` · return, ${line.returnAction === "discard" ? "discard" : "restock"} (${formatNumber(line.restockedQty ?? 0)} done)` : ""}
                          </span>
                          {service && open && canFulfill ? (
                            <label className="mt-1 flex items-center gap-2 text-xs">
                              <Checkbox checked={line.serviceDone === true} onCheckedChange={(value) => void run(() => setServiceDone(order, [line.lineId], value === true, lookups, by), "Saved")} />
                              Service done
                            </label>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right num">
                          {formatNumber(line.qty)} {line.uom}
                        </TableCell>
                        {service || isReturn(line) ? (
                          <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                            {service ? (line.serviceDone ? "Done" : "Not done") : "Return"}
                          </TableCell>
                        ) : (
                          <>
                            <TableCell className="text-right num">{formatNumber(line.pickedQty ?? 0)}</TableCell>
                            <TableCell className="text-right num">{formatNumber(line.packedQty ?? 0)}</TableCell>
                            <TableCell className="text-right num">{formatNumber(line.shippedQty ?? 0)}</TableCell>
                          </>
                        )}
                        <TableCell className="text-right num">{formatMoney(line.unitPrice, order.currencyCode)}</TableCell>
                        <TableCell className="text-right num">{formatMoney(line.qty * line.unitPrice, order.currencyCode)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="flex-1 text-sm text-muted-foreground">
                <p>Bill to: {formatAddress(order.billingAddress) || "none"}</p>
                <p>Ship to: {formatAddress(order.shippingAddress) || "none"}</p>
                {order.remarks ? <p className="mt-2 text-foreground">{order.remarks}</p> : null}
                {open && canEdit && !order.invoicedOn ? (
                  <div className="mt-3 flex items-end gap-2">
                    <TextField id="invoice-date" label="Invoice date" type="date" value={invoiceDate} onChange={setInvoiceDate} />
                    <Button variant="secondary" disabled={busy} onClick={() => void run(() => invoiceOrder(order, new Date(`${invoiceDate}T12:00:00Z`).toISOString(), lookups, by), "Invoiced")}>
                      Mark invoiced
                    </Button>
                  </div>
                ) : order.invoicedOn ? (
                  <p className="mt-2">Invoiced {formatDate(order.invoicedOn)}</p>
                ) : null}
              </div>
              <TotalsBlock
                currency={order.currencyCode}
                rows={[
                  { label: "Subtotal", value: Number(order.subtotal ?? 0) },
                  { label: "Freight", value: Number(order.freight ?? 0) },
                  { label: "Tax", value: Number(order.taxTotal ?? 0) },
                  { label: "Total", value: total, strong: true },
                  { label: "Paid", value: Number(order.amountPaid ?? 0) },
                  { label: due < 0 ? "Owed to customer" : "Balance due", value: Math.abs(due), strong: true },
                ]}
              />
            </div>
          </TabsContent>

          <TabsContent value="fulfillment" className="flex flex-col gap-4 text-sm">
            <section>
              <h3 className="mb-2 font-semibold">Packages</h3>
              {(order.packages ?? []).length === 0 ? <p className="text-muted-foreground">Nothing packed yet.</p> : null}
              <ul className="flex flex-col gap-1">
                {(order.packages ?? []).map((pack) => (
                  <li key={pack.number}>
                    <span className="font-mono">{pack.number}</span> · {pack.lines.map((item) => `${lookups.productOf(order.lines.find((line) => line.lineId === item.lineId)?.productId)?.name} × ${formatNumber(item.qty)}`).join(", ")}
                    {pack.shipmentId ? " · shipped" : " · not shipped"}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="mb-2 font-semibold">Shipments</h3>
              {(order.shipments ?? []).length === 0 ? <p className="text-muted-foreground">Nothing shipped yet.</p> : null}
              <ul className="flex flex-col gap-1">
                {(order.shipments ?? []).map((shipment) => (
                  <li key={shipment.shipmentId}>
                    {formatDateTime(shipment.shippedAt)} · {lookups.carriers.find((carrier) => carrier.ItemId === shipment.carrierId)?.name ?? "No carrier"}
                    {shipment.trackingNumber ? ` · tracking ${shipment.trackingNumber}` : ""} · {shipment.packageNumbers.join(", ")}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="mb-2 font-semibold">Stock steps</h3>
              {(order.stockSteps ?? []).length === 0 ? <p className="text-muted-foreground">No stock has moved.</p> : null}
              <ul className="flex flex-col gap-1">
                {(order.stockSteps ?? []).map((step) => (
                  <li key={step.stepId}>
                    {formatDateTime(step.at)} · {step.kind} · {step.status} ·{" "}
                    {step.lines
                      .map((item) => {
                        const product = lookups.productOf(order.lines.find((line) => line.lineId === item.lineId)?.productId)
                        const where = [lookups.binCode(item.sublocationId), item.serial].filter(Boolean).join(" ")
                        return `${product?.name} × ${formatNumber(item.qty)}${where ? ` (${where})` : ""}`
                      })
                      .join(", ")}
                  </li>
                ))}
              </ul>
            </section>
          </TabsContent>

          <TabsContent value="payments" className="text-sm">
            {paid.loading && !paid.data ? <LoadingRows rows={2} /> : null}
            {paid.data && paid.data.length === 0 ? <p className="text-muted-foreground">No payments yet.</p> : null}
            <ul className="flex flex-col gap-1">
              {(paid.data ?? []).map((payment) => (
                <li key={payment.ItemId} className={cn(payment.isVoided && "text-muted-foreground line-through")}>
                  <span className="font-mono">{payment.number}</span> · {formatDate(payment.paidOn)} · {payment.type.replace(/_/g, " ")} ·{" "}
                  {formatMoney(payment.allocations.find((allocation) => allocation.orderId === order.ItemId)?.amount ?? 0, payment.currencyCode)} of {formatMoney(payment.amount, payment.currencyCode)}
                </li>
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="history">
            <HistoryList events={order.history} />
          </TabsContent>

          {canSeeCost ? (
            <TabsContent value="profit" className="text-sm">
              <TotalsBlock
                currency={lookups.homeCurrency}
                rows={[
                  { label: "Revenue (before tax)", value: revenueHome },
                  { label: "Cost of goods", value: Number(order.cogs ?? 0) },
                  { label: "Other costs", value: Number(order.nonCustomerCosts ?? 0) },
                  { label: "Profit", value: profit, strong: true },
                ]}
              />
              <p className="mt-3 text-muted-foreground">
                Cost of goods is fixed when stock is picked, at the average cost then (restocked returns take it back off). Final once the order is fulfilled.
              </p>
            </TabsContent>
          ) : null}
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </DialogFooter>

        {dialog === "pick" ? <PickDialog order={order} lookups={lookups} busy={busy} onClose={() => setDialog(null)} onPick={(picks) => run(() => pickLines(order, picks, lookups, by), "Picked")} /> : null}
        {dialog === "pack" ? <PackDialog order={order} lookups={lookups} busy={busy} onClose={() => setDialog(null)} onPack={(requests) => run(() => packLines(order, requests, lookups, by), "Packed")} /> : null}
        {dialog === "ship" ? (
          <ShipDialog order={order} lookups={lookups} busy={busy} onClose={() => setDialog(null)} onShip={(input) => run(() => shipPackages(order, input, lookups, by), "Shipped")} />
        ) : null}
        {dialog === "restock" ? (
          <RestockDialog order={order} lookups={lookups} busy={busy} onClose={() => setDialog(null)} onRestock={(requests) => run(() => restockLines(order, requests, lookups, by), "Returns recorded")} />
        ) : null}
        {dialog === "pay" ? (
          <PaymentDialog
            lookups={lookups}
            party="customer"
            partyId={order.customerId}
            currencyCode={order.currencyCode}
            preset={{ orderType: "sales", orderId: order.ItemId, orderNumber: order.number, amount: Math.max(0, Math.round(due * 100) / 100) }}
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
                <DialogDescription>Every pick and restock is reversed, so the stock goes back. Payments on this order become store credit. The order stays in the history as cancelled.</DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
                  Keep it
                </Button>
                <Button variant="destructive" disabled={busy} onClick={() => void run(() => cancelSalesOrder(order, lookups, by), `${order.number} cancelled`)}>
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

/** Pick from the bins, lots and serials that have stock, starting from the suggestion. */
function PickDialog({ order, lookups, busy, onClose, onPick }: { order: SalesOrder; lookups: OrderLookups; busy: boolean; onClose: () => void; onPick: (picks: PickRequest[]) => Promise<void> }) {
  const data = useResource(async () => {
    const [{ items: balances }, suggestion] = await Promise.all([
      posting.balances({ locationId: order.locationId, onHand: { $gt: 0 } }, { pageSize: 5000 }),
      suggestPicks(order, lookups),
    ])
    const lotIds = [...new Set(balances.map((balance) => balance.lotId).filter(Boolean) as string[])]
    const lotRows = lotIds.length ? (await lots.list({ filter: { ItemId: { $in: lotIds } }, pageSize: lotIds.length })).items : []
    return { balances, suggestion, lotRows }
  }, [order.ItemId, order.revision])
  const [qty, setQty] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!data.data) return
    const initial: Record<string, string> = {}
    for (const pick of data.data.suggestion.picks) {
      const key = `${pick.lineId}|${pick.sublocationId ?? ""}|${pick.lotId ?? ""}|${pick.serial ?? ""}`
      initial[key] = String(pick.qty)
    }
    setQty(initial)
  }, [data.data])

  const rows = order.lines
    .map((line) => ({ line, product: lookups.productOf(line.productId), left: salesLineRemaining(line).toPick }))
    .filter((row) => row.left > 0 && row.product && row.product.itemType !== "service")

  function submit() {
    const picks: PickRequest[] = Object.entries(qty)
      .filter(([, value]) => Number(value) > 0)
      .map(([key, value]) => {
        const [lineId, sublocationId, lotId, serial] = key.split("|")
        return { lineId, qty: Number(value), sublocationId: sublocationId || null, lotId: lotId || null, serial: serial || null }
      })
    void onPick(picks)
  }

  return (
    <Dialog open onOpenChange={(value) => !value && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pick {order.number}</DialogTitle>
          <DialogDescription>Filled in with lots that expire first (never expired ones), else the fullest bins. Change any number. What you leave stays on back order.</DialogDescription>
        </DialogHeader>
        {data.error ? <ErrorBanner message={data.error} /> : null}
        {!data.data ? (
          <LoadingRows />
        ) : (
          <div className="flex flex-col gap-4">
            {rows.map(({ line, product, left }) => {
              const sources =
                product!.itemType === "non_stocked"
                  ? [{ key: `${line.lineId}|||`, label: "Not tracked in stock", onHand: left }]
                  : data.data!.balances
                      .filter((balance) => balance.productId === line.productId)
                      .map((balance) => {
                        const lot = data.data!.lotRows.find((item) => item.ItemId === balance.lotId)
                        const expired = lot?.expiresOn ? lot.expiresOn < new Date().toISOString() : false
                        return {
                          key: `${line.lineId}|${balance.sublocationId ?? ""}|${balance.lotId ?? ""}|${balance.serial ?? ""}`,
                          label: [lookups.binCode(balance.sublocationId) || "No bin", lot ? `lot ${lot.lotNumber}${lot.expiresOn ? ` (exp ${formatDate(lot.expiresOn)}${expired ? ", expired" : ""})` : ""}` : "", balance.serial ? `serial ${balance.serial}` : ""]
                            .filter(Boolean)
                            .join(" · "),
                          onHand: balance.onHand,
                        }
                      })
              return (
                <section key={line.lineId} className="rounded-md border p-3">
                  <h3 className="text-sm font-semibold">
                    {product!.name} <span className="font-normal text-muted-foreground">· {formatNumber(left)} {product!.standardUom} left to pick</span>
                  </h3>
                  {sources.length === 0 ? <p className="mt-1 text-sm text-destructive-text">No stock at {lookups.locationName(order.locationId)}.</p> : null}
                  <div className="mt-2 flex flex-col gap-1">
                    {sources.map((source) => (
                      <label key={source.key} className="flex items-center gap-3 text-sm">
                        <span className="flex-1">{source.label}</span>
                        <span className="w-24 text-right text-xs text-muted-foreground num">{formatNumber(source.onHand)} on hand</span>
                        <Input
                          aria-label={`Pick from ${source.label}`}
                          type="number"
                          step="any"
                          min={0}
                          className="h-8 w-24 text-right num"
                          value={qty[source.key] ?? ""}
                          onChange={(event) => setQty((current) => ({ ...current, [source.key]: event.target.value }))}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !data.data}>
            {busy ? "Picking…" : "Pick"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PackDialog({ order, lookups, busy, onClose, onPack }: { order: SalesOrder; lookups: OrderLookups; busy: boolean; onClose: () => void; onPack: (requests: { lineId: string; qty: number }[]) => Promise<void> }) {
  const rows = order.lines.map((line) => ({ line, left: salesLineRemaining(line).toPack })).filter((row) => row.left > 0)
  const [qty, setQty] = React.useState<Record<string, string>>(() => Object.fromEntries(rows.map((row) => [row.line.lineId, String(row.left)])))
  return (
    <Dialog open onOpenChange={(value) => !value && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pack into package {order.number}-{(order.packages?.length ?? 0) + 1}</DialogTitle>
          <DialogDescription>Picked items go into one numbered package.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {rows.map(({ line, left }) => (
            <label key={line.lineId} className="flex items-center gap-3 text-sm">
              <span className="flex-1">{lookups.productOf(line.productId)?.name}</span>
              <span className="text-xs text-muted-foreground">{formatNumber(left)} picked</span>
              <Input aria-label="Quantity to pack" type="number" step="any" className="h-8 w-24 text-right num" value={qty[line.lineId] ?? ""} onChange={(event) => setQty((current) => ({ ...current, [line.lineId]: event.target.value }))} />
            </label>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void onPack(Object.entries(qty).map(([lineId, value]) => ({ lineId, qty: Number(value) || 0 })))}>
            {busy ? "Packing…" : "Pack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ShipDialog({
  order,
  lookups,
  busy,
  onClose,
  onShip,
}: {
  order: SalesOrder
  lookups: OrderLookups
  busy: boolean
  onClose: () => void
  onShip: (input: { packageNumbers: string[]; carrierId?: string | null; trackingNumber?: string | null; shippedAt?: string }) => Promise<void>
}) {
  const unshipped = (order.packages ?? []).filter((pack) => !pack.shipmentId)
  const [chosen, setChosen] = React.useState<string[]>(unshipped.map((pack) => pack.number))
  const [carrierId, setCarrier] = React.useState("")
  const [tracking, setTracking] = React.useState("")
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10))
  return (
    <Dialog open onOpenChange={(value) => !value && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ship {order.number}</DialogTitle>
          <DialogDescription>Choose the packages leaving now.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {unshipped.map((pack) => (
            <label key={pack.number} className="flex items-center gap-2 text-sm">
              <Checkbox checked={chosen.includes(pack.number)} onCheckedChange={(value) => setChosen((current) => (value === true ? [...current, pack.number] : current.filter((item) => item !== pack.number)))} />
              <span className="font-mono">{pack.number}</span>
            </label>
          ))}
          <SelectField id="ship-carrier" label="Carrier" options={lookups.carriers.filter((row) => row.isActive !== false).map((row) => ({ value: row.ItemId, label: row.name }))} value={carrierId} onChange={setCarrier} allowNone />
          <TextField id="ship-tracking" label="Tracking number" value={tracking} onChange={setTracking} mono />
          <TextField id="ship-date" label="Ship date" type="date" value={date} onChange={setDate} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || !chosen.length}
            onClick={() => void onShip({ packageNumbers: chosen, carrierId: carrierId || null, trackingNumber: tracking, shippedAt: new Date(`${date}T12:00:00Z`).toISOString() })}
          >
            {busy ? "Shipping…" : "Ship"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RestockDialog({ order, lookups, busy, onClose, onRestock }: { order: SalesOrder; lookups: OrderLookups; busy: boolean; onClose: () => void; onRestock: (requests: PickRequest[]) => Promise<void> }) {
  const rows = order.lines.map((line) => ({ line, product: lookups.productOf(line.productId), left: salesLineRemaining(line).toRestock })).filter((row) => row.left > 0)
  const [values, setValues] = React.useState<Record<string, { qty: string; bin: string; lot: string; serial: string }>>(() =>
    Object.fromEntries(rows.map((row) => [row.line.lineId, { qty: row.product?.trackSerials ? "1" : String(row.left), bin: "", lot: "", serial: "" }]))
  )
  const [error, setError] = React.useState<string>()
  const set = (lineId: string, patch: Partial<{ qty: string; bin: string; lot: string; serial: string }>) => setValues((current) => ({ ...current, [lineId]: { ...current[lineId], ...patch } }))

  async function submit() {
    setError(undefined)
    try {
      const requests: PickRequest[] = []
      for (const { line, product } of rows) {
        const value = values[line.lineId]
        if (!(Number(value.qty) > 0)) continue
        const putBack = line.returnAction === "restock" && product?.itemType === "stocked"
        requests.push({
          lineId: line.lineId,
          qty: Number(value.qty),
          sublocationId: putBack ? await resolveBin(order.locationId, value.bin) : null,
          lotId: putBack && product?.trackLots && value.lot.trim() ? await resolveLot(product.ItemId, value.lot, { shelfLifeDays: product.shelfLifeDays }) : null,
          serial: putBack && product?.trackSerials ? value.serial.trim() || null : null,
        })
      }
      await onRestock(requests)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <Dialog open onOpenChange={(value) => !value && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Returns on {order.number}</DialogTitle>
          <DialogDescription>Restock lines go back into {lookups.locationName(order.locationId)}. Discard lines are recorded with no stock change.</DialogDescription>
        </DialogHeader>
        {error ? <ErrorBanner message={error} /> : null}
        <div className="flex flex-col gap-3">
          {rows.map(({ line, product, left }) => {
            const putBack = line.returnAction === "restock" && product?.itemType === "stocked"
            const value = values[line.lineId]
            return (
              <section key={line.lineId} className="grid grid-cols-2 gap-2 rounded-md border p-3 md:grid-cols-4">
                <p className="col-span-2 text-sm font-semibold md:col-span-4">
                  {product?.name} <span className="font-normal text-muted-foreground">· {formatNumber(left)} to {putBack ? "restock" : "discard"}</span>
                </p>
                <TextField id={`rs-qty-${line.lineId}`} label="Quantity" type="number" step="any" value={value.qty} onChange={(qty) => set(line.lineId, { qty })} />
                {putBack ? <TextField id={`rs-bin-${line.lineId}`} label="Bin" mono value={value.bin} onChange={(bin) => set(line.lineId, { bin })} /> : null}
                {putBack && product?.trackLots ? <TextField id={`rs-lot-${line.lineId}`} label="Lot" mono value={value.lot} onChange={(lot) => set(line.lineId, { lot })} /> : null}
                {putBack && product?.trackSerials ? <TextField id={`rs-serial-${line.lineId}`} label="Serial" mono value={value.serial} onChange={(serial) => set(line.lineId, { serial })} /> : null}
              </section>
            )
          })}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
