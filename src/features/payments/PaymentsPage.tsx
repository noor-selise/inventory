import * as React from "react"
import { ArrowDownLeft, ArrowUpRight, Ban, Plus, RefreshCw, Users, Wallet } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { KpiCard, KpiRow, RecordCard } from "@/components/app/data"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { purchaseOrders } from "@/features/purchasing/api"
import { salesOrders } from "@/features/sales/api"
import { useOrderLookups, type OrderLookups } from "@/features/sales/lookups"
import { PAYMENT_EDITORS } from "@/features/team/roles"
import { headClass } from "@/features/sales/OrderBits"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatDate, formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { refreshParty, voidPayment } from "./actions"
import { PAYMENT_TYPES, partyBalances, payments, type Party, type Payment } from "./api"
import { PaymentDialog } from "./PaymentDialog"

// Payments, balances per currency and aging (spec 0013 AC-1, AC-4, AC-5).

const DAY = 86_400_000

/** Money in and out this month and open balances, in home currency (DESIGN.md §6.4). */
function PaymentKpis({ rows, balances, home }: { rows: Payment[]; balances: { party: Party; currencyCode: string; openBalance: number }[]; home: string }) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const thisMonth = rows.filter((row) => !row.isVoided && row.paidOn >= monthStart && row.currencyCode === home)
  const received = thisMonth.filter((row) => row.party === "customer").reduce((sum, row) => sum + Number(row.amount), 0)
  const paid = thisMonth.filter((row) => row.party === "vendor").reduce((sum, row) => sum + Number(row.amount), 0)
  const open = (party: Party) => balances.filter((row) => row.party === party && row.currencyCode === home).reduce((sum, row) => sum + Math.max(0, Number(row.openBalance)), 0)
  return (
    <KpiRow>
      <KpiCard label="Received this month" value={formatMoney(received, home)} icon={ArrowDownLeft} tone="success" hint="From customers" />
      <KpiCard label="Paid this month" value={formatMoney(paid, home)} icon={ArrowUpRight} tone="info" hint="To vendors" />
      <KpiCard label="Customers owe you" value={formatMoney(open("customer"), home)} icon={Users} tone={open("customer") > 0.005 ? "warning" : "default"} hint={`Open balances in ${home}`} />
      <KpiCard label="You owe vendors" value={formatMoney(open("vendor"), home)} icon={Wallet} tone={open("vendor") > 0.005 ? "warning" : "default"} hint={`Open balances in ${home}`} />
    </KpiRow>
  )
}

export function PaymentsPage() {
  const { hasRole, user } = useCurrentUser()
  const canEdit = hasRole(...PAYMENT_EDITORS)
  const lookups = useOrderLookups()
  const list = useResource(() => payments.list({ sort: { paidOn: -1 }, pageSize: 300 }), [])
  const balances = useResource(() => partyBalances.list({ pageSize: 2000 }), [])
  const [creating, setCreating] = React.useState(false)
  const [busy, setBusy] = React.useState<string>()
  const data = lookups.data

  async function onVoid(payment: Payment) {
    setBusy(payment.ItemId)
    try {
      await voidPayment(payment, user?.email ?? "unknown")
      toast.success(`${payment.number} voided`)
      void list.reload()
      void balances.reload()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <>
      <PageHeader
        title="Payments"
        description="Money in from customers and out to vendors, split over orders. Balances update right after each payment and again on the server."
        actions={
          canEdit ? (
            <Button onClick={() => setCreating(true)} disabled={!data}>
              <Plus aria-hidden /> Record payment
            </Button>
          ) : null
        }
      />
      {list.error ? <ErrorBanner message={list.error} onRetry={list.reload} /> : null}
      {list.data && balances.data && data ? <PaymentKpis rows={list.data.items} balances={balances.data.items} home={data.homeCurrency} /> : null}
      <Tabs defaultValue="payments">
        <TabsList className="mb-4" aria-label="Payment views">
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="customers">Customer balances</TabsTrigger>
          <TabsTrigger value="vendors">Vendor balances</TabsTrigger>
        </TabsList>
        <TabsContent value="payments">
          <SectionCard className="p-0 md:p-0">
            {(list.loading && !list.data) || !data ? (
              <div className="p-4">
                <LoadingRows />
              </div>
            ) : (list.data?.items ?? []).length === 0 ? (
              <EmptyState
                icon={Wallet}
                message="No payments yet."
                action={
                  canEdit ? (
                    <Button onClick={() => setCreating(true)}>
                      <Plus aria-hidden /> Record payment
                    </Button>
                  ) : null
                }
              />
            ) : (
              <>
              <ul className="md:hidden" aria-label="Payments">
                {(list.data?.items ?? []).map((payment) => (
                  <RecordCard
                    key={payment.ItemId}
                    title={
                      <span className={cn(payment.isVoided && "text-muted-foreground line-through")}>
                        <span className="font-mono text-[13px]">{payment.number}</span> · {payment.party === "customer" ? data.customerOf(payment.partyId)?.name : data.vendorOf(payment.partyId)?.name}
                      </span>
                    }
                    value={formatMoney(payment.amount, payment.currencyCode)}
                    badges={
                      <>
                        <Badge variant={payment.party === "customer" ? "success" : "info"}>
                          {payment.party === "customer" ? <ArrowDownLeft aria-hidden /> : <ArrowUpRight aria-hidden />} {payment.party === "customer" ? "Received" : "Paid out"}
                        </Badge>
                        {payment.isVoided ? (
                          <Badge variant="muted">
                            <Ban aria-hidden /> Voided
                          </Badge>
                        ) : null}
                      </>
                    }
                    meta={`${formatDate(payment.paidOn)} · ${PAYMENT_TYPES.find((type) => type.value === payment.type)?.label ?? ""}`}
                  />
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                      <TableHead className={headClass}>Number</TableHead>
                      <TableHead className={headClass}>Who</TableHead>
                      <TableHead className={cn(headClass, "hidden md:table-cell")}>Date</TableHead>
                      <TableHead className={cn(headClass, "hidden md:table-cell")}>Type</TableHead>
                      <TableHead className={cn(headClass, "text-right")}>Amount</TableHead>
                      <TableHead className={cn(headClass, "hidden lg:table-cell")}>Split</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(list.data?.items ?? []).map((payment) => (
                      <TableRow key={payment.ItemId} className={cn("h-11", payment.isVoided && "text-muted-foreground line-through")}>
                        <TableCell className="font-mono text-[13px]">{payment.number}</TableCell>
                        <TableCell>{payment.party === "customer" ? data.customerOf(payment.partyId)?.name : data.vendorOf(payment.partyId)?.name}</TableCell>
                        <TableCell className="hidden text-sm md:table-cell">{formatDate(payment.paidOn)}</TableCell>
                        <TableCell className="hidden text-sm md:table-cell">{PAYMENT_TYPES.find((type) => type.value === payment.type)?.label}</TableCell>
                        <TableCell className="text-right num">{formatMoney(payment.amount, payment.currencyCode)}</TableCell>
                        <TableCell className="hidden text-xs lg:table-cell">{payment.allocations.map((item) => `${item.orderNumber ?? ""} ${formatMoney(item.amount, payment.currencyCode)}`).join(", ") || "Store credit"}</TableCell>
                        <TableCell>
                          {canEdit && !payment.isVoided ? (
                            <Button size="sm" variant="ghost" disabled={busy === payment.ItemId} onClick={() => void onVoid(payment)}>
                              Void
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              </>
            )}
          </SectionCard>
        </TabsContent>
        <TabsContent value="customers">{data ? <Balances party="customer" lookups={data} rows={balances.data?.items ?? []} onRefreshed={balances.reload} /> : <LoadingRows />}</TabsContent>
        <TabsContent value="vendors">{data ? <Balances party="vendor" lookups={data} rows={balances.data?.items ?? []} onRefreshed={balances.reload} /> : <LoadingRows />}</TabsContent>
      </Tabs>
      {creating && data ? (
        <PaymentDialog
          lookups={data}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            void list.reload()
            void balances.reload()
          }}
        />
      ) : null}
    </>
  )
}

function Balances({ party, lookups, rows, onRefreshed }: { party: Party; lookups: OrderLookups; rows: Awaited<ReturnType<typeof partyBalances.list>>["items"]; onRefreshed: () => void }) {
  const { user } = useCurrentUser()
  const [busy, setBusy] = React.useState(false)
  // Aging over orders with money still due, by days past their due date (spec 0013 AC-5).
  const aging = useResource(async () => {
    const filter = { isQuote: false, isCancelled: { $ne: true } }
    const orders =
      party === "customer"
        ? (await salesOrders.list({ filter: { ...filter, invoicedOn: { $ne: null } }, pageSize: 3000 })).items.map((order) => ({ partyId: order.customerId, order }))
        : (await purchaseOrders.list({ filter, pageSize: 3000 })).items.map((order) => ({ partyId: order.vendorId, order }))
    const buckets = new Map<string, { current: number; d30: number; d60: number; older: number }>()
    const now = Date.now()
    for (const { partyId, order } of orders) {
      const due = Number(order.total ?? 0) - Number(order.amountPaid ?? 0)
      if (due <= 0.005) continue
      const key = `${partyId}|${order.currencyCode}`
      const entry = buckets.get(key) ?? { current: 0, d30: 0, d60: 0, older: 0 }
      const late = order.dueDate ? Math.floor((now - new Date(order.dueDate).getTime()) / DAY) : 0
      if (late <= 0) entry.current += due
      else if (late <= 30) entry.d30 += due
      else if (late <= 60) entry.d60 += due
      else entry.older += due
      buckets.set(key, entry)
    }
    return buckets
  }, [party])

  const mine = rows.filter((row) => row.party === party && (Math.abs(row.openBalance) > 0.005 || Math.abs(row.storeCredit) > 0.005))
  const name = (id: string) => (party === "customer" ? lookups.customerOf(id)?.name : lookups.vendorOf(id)?.name) ?? ""

  async function refreshAll() {
    setBusy(true)
    try {
      const ids = new Set((party === "customer" ? lookups.customers : lookups.vendors).map((row) => row.ItemId))
      for (const id of ids) await refreshParty(party, id, user?.email ?? "unknown")
      toast.success("Balances recomputed from all payments")
      onRefreshed()
      void aging.reload()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard
      className="p-0 md:p-0"
      title={party === "customer" ? "What customers owe you" : "What you owe vendors"}
      description="Per currency. Store credit is money received or paid that is not on any order."
      actions={
        <Button size="sm" variant="secondary" onClick={() => void refreshAll()} disabled={busy}>
          <RefreshCw aria-hidden /> {busy ? "Recomputing…" : "Recompute"}
        </Button>
      }
    >
      {mine.length === 0 ? (
        <EmptyState icon={Wallet} message="Nothing open." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className={headClass}>{party === "customer" ? "Customer" : "Vendor"}</TableHead>
                <TableHead className={headClass}>Currency</TableHead>
                <TableHead className={cn(headClass, "text-right")}>Open balance</TableHead>
                <TableHead className={cn(headClass, "text-right")}>Store credit</TableHead>
                <TableHead className={cn(headClass, "hidden text-right md:table-cell")}>Current</TableHead>
                <TableHead className={cn(headClass, "hidden text-right md:table-cell")}>1 to 30</TableHead>
                <TableHead className={cn(headClass, "hidden text-right md:table-cell")}>31 to 60</TableHead>
                <TableHead className={cn(headClass, "hidden text-right md:table-cell")}>61+</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mine.map((row) => {
                const bucket = aging.data?.get(`${row.partyId}|${row.currencyCode}`)
                return (
                  <TableRow key={row.ItemId} className="h-11">
                    <TableCell>{name(row.partyId)}</TableCell>
                    <TableCell>{row.currencyCode}</TableCell>
                    <TableCell className="text-right num">{formatMoney(row.openBalance, row.currencyCode)}</TableCell>
                    <TableCell className="text-right num">{formatMoney(row.storeCredit, row.currencyCode)}</TableCell>
                    {[bucket?.current, bucket?.d30, bucket?.d60, bucket?.older].map((value, index) => (
                      <TableCell key={index} className="hidden text-right num md:table-cell">
                        {formatMoney(value ?? 0, row.currencyCode)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  )
}
