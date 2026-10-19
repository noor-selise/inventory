import * as React from "react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { SelectField, TextAreaField, TextField } from "@/components/app/form"
import { ErrorBanner, LoadingRows } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { purchaseOrders } from "@/features/purchasing/api"
import { salesOrders } from "@/features/sales/api"
import type { OrderLookups } from "@/features/sales/lookups"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatDate, formatMoney } from "@/lib/format"
import { checkPayment, recordPayment, type PaymentInput } from "./actions"
import { PAYMENT_TYPES, partyBalances, type Party, type PaymentAllocation, type PaymentType } from "./api"

// Record a payment, refund or credit and split it over the party's open
// orders in the same currency (spec 0013 AC-1, AC-2). The split and the
// payment save as one document.

export function PaymentDialog({
  lookups,
  party: initialParty,
  partyId: initialPartyId,
  currencyCode: initialCurrency,
  preset,
  onClose,
  onSaved,
}: {
  lookups: OrderLookups
  party?: Party
  partyId?: string
  currencyCode?: string
  preset?: PaymentAllocation
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useCurrentUser()
  const [postingKey] = React.useState(() => crypto.randomUUID())
  const [party, setParty] = React.useState<Party>(initialParty ?? "customer")
  const [partyId, setPartyId] = React.useState(initialPartyId ?? "")
  const [type, setType] = React.useState<PaymentType>("payment")
  const [currencyCode, setCurrency] = React.useState(initialCurrency ?? lookups.homeCurrency)
  const [amount, setAmount] = React.useState(preset ? String(preset.amount) : "")
  const [paidOn, setPaidOn] = React.useState(new Date().toISOString().slice(0, 10))
  const [methodId, setMethod] = React.useState("")
  const [reference, setReference] = React.useState("")
  const [remarks, setRemarks] = React.useState("")
  const [split, setSplit] = React.useState<Record<string, string>>(preset ? { [preset.orderId]: String(preset.amount) } : {})
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string>()

  const open = useResource(async () => {
    if (!partyId) return { orders: [], credit: 0 }
    const filter = { isQuote: false, isCancelled: { $ne: true }, currencyCode }
    const rows =
      party === "customer"
        ? (await salesOrders.list({ filter: { ...filter, customerId: partyId }, sort: { orderDate: 1 }, pageSize: 500 })).items.map((order) => ({ ...order, orderType: "sales" as const }))
        : (await purchaseOrders.list({ filter: { ...filter, vendorId: partyId }, sort: { orderDate: 1 }, pageSize: 500 })).items.map((order) => ({ ...order, orderType: "purchase" as const }))
    const balance = (await partyBalances.list({ filter: { party, partyId, currencyCode }, pageSize: 1 })).items[0]
    return { orders: rows, credit: Number(balance?.storeCredit ?? 0) }
  }, [party, partyId, currencyCode])

  const orders = (open.data?.orders ?? []).filter((order) => {
    const due = Number(order.total ?? 0) - Number(order.amountPaid ?? 0)
    // Refunds and credit conversion work on overpaid orders; the rest on orders with money due.
    return type === "refund" || type === "convert_to_credit" ? due < -0.005 || order.ItemId === preset?.orderId || split[order.ItemId] : due > 0.005 || order.ItemId === preset?.orderId
  })
  const allocations: PaymentAllocation[] = Object.entries(split)
    .filter(([, value]) => Number(value) > 0)
    .map(([orderId, value]) => {
      const order = open.data?.orders.find((item) => item.ItemId === orderId)
      return { orderType: order?.orderType ?? preset?.orderType ?? "sales", orderId, orderNumber: order?.number ?? preset?.orderNumber ?? null, amount: Number(value) }
    })
  const noMoney = type === "apply_credit" || type === "convert_to_credit"
  const input: PaymentInput = {
    party,
    partyId,
    type,
    methodId: methodId || null,
    reference,
    amount: noMoney ? allocations.reduce((sum, item) => sum + item.amount, 0) : Number(amount) || 0,
    currencyCode,
    paidOn: new Date(`${paidOn}T12:00:00Z`).toISOString(),
    remarks,
    allocations,
    postingKey,
  }
  const problem = partyId ? checkPayment(input, open.data?.credit ?? 0) : "Choose who paid."

  function autoSplit() {
    let left = Number(amount) || 0
    const next: Record<string, string> = {}
    for (const order of orders) {
      const due = Number(order.total ?? 0) - Number(order.amountPaid ?? 0)
      if (left <= 0 || due <= 0) continue
      const take = Math.min(left, due)
      next[order.ItemId] = String(Math.round(take * 100) / 100)
      left -= take
    }
    setSplit(next)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (problem) return setError(problem)
    setSaving(true)
    setError(undefined)
    try {
      const saved = await recordPayment(input, user?.email ?? "unknown")
      toast.success(`${saved.number} recorded`)
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const parties = (party === "customer" ? lookups.customers : lookups.vendors).map((row) => ({ value: row.ItemId, label: row.name }))
  return (
    <Dialog open onOpenChange={(value) => !value && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record a {party === "customer" ? "customer" : "vendor"} payment</DialogTitle>
          <DialogDescription>What you do not split onto orders becomes store credit. Saving twice records it once.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4">
          {error ? <ErrorBanner message={error} /> : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {!initialPartyId ? (
              <SelectField
                id="pay-party-kind"
                label="From"
                options={[
                  { value: "customer", label: "A customer (money in)" },
                  { value: "vendor", label: "To a vendor (money out)" },
                ]}
                value={party}
                onChange={(value) => {
                  setParty(value as Party)
                  setPartyId("")
                  setSplit({})
                }}
              />
            ) : null}
            <SelectField id="pay-party" label={party === "customer" ? "Customer" : "Vendor"} required options={parties} value={partyId} onChange={(value) => { setPartyId(value); setSplit({}) }} disabled={Boolean(initialPartyId)} />
            <SelectField id="pay-type" label="Type" options={PAYMENT_TYPES.map((row) => ({ value: row.value, label: row.label }))} value={type} onChange={(value) => { setType(value as PaymentType); setSplit({}) }} />
            <SelectField id="pay-currency" label="Currency" options={lookups.currencies.map((code) => ({ value: code, label: code }))} value={currencyCode} onChange={(value) => { setCurrency(value); setSplit({}) }} disabled={Boolean(initialCurrency)} />
            {!noMoney ? <TextField id="pay-amount" label="Amount" type="number" step="any" required value={amount} onChange={setAmount} /> : null}
            <TextField id="pay-date" label="Date" type="date" value={paidOn} onChange={setPaidOn} />
            {!noMoney ? (
              <SelectField id="pay-method" label="Method" options={lookups.methods.filter((row) => row.isActive !== false).map((row) => ({ value: row.ItemId, label: row.name }))} value={methodId} onChange={setMethod} allowNone />
            ) : null}
            {!noMoney ? <TextField id="pay-reference" label="Reference" value={reference} onChange={setReference} mono /> : null}
          </div>
          {type === "apply_credit" ? <p className="text-sm text-muted-foreground">Store credit available: {formatMoney(open.data?.credit ?? 0, currencyCode)}</p> : null}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Split over orders</h3>
              {!noMoney && type !== "refund" ? (
                <Button type="button" size="sm" variant="ghost" onClick={autoSplit} disabled={!orders.length}>
                  Oldest first
                </Button>
              ) : null}
            </div>
            {open.loading && !open.data ? <LoadingRows rows={2} /> : null}
            {partyId && open.data && orders.length === 0 ? <p className="text-sm text-muted-foreground">No orders to split onto in {currencyCode}.</p> : null}
            {orders.map((order) => {
              const due = Number(order.total ?? 0) - Number(order.amountPaid ?? 0)
              return (
                <label key={order.ItemId} className="flex items-center gap-3 text-sm">
                  <span className="flex-1">
                    <span className="font-mono">{order.number}</span> · {formatDate(order.orderDate)}
                  </span>
                  <span className="text-xs text-muted-foreground num">{due < 0 ? `${formatMoney(-due, currencyCode)} overpaid` : `${formatMoney(due, currencyCode)} due`}</span>
                  <Input aria-label={`Amount for ${order.number}`} type="number" step="any" min={0} className="h-8 w-28 text-right num" value={split[order.ItemId] ?? ""} onChange={(event) => setSplit((current) => ({ ...current, [order.ItemId]: event.target.value }))} />
                </label>
              )
            })}
          </section>
          <TextAreaField id="pay-remarks" label="Remarks" value={remarks} onChange={setRemarks} />
          {problem && partyId ? <p className="text-sm text-destructive-text">{problem}</p> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || Boolean(problem)} className="min-w-24">
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
