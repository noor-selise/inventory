import * as React from "react"
import { ArrowDownLeft, ArrowUpRight, Ban, Plus, RefreshCw, Users, Wallet } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { KpiCard, KpiRow, RecordCard } from "@/components/app/data"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard, TablePagination } from "@/components/app/page"
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
const BALANCE_PAGE_SIZE = 25

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
            <Button className="w-full min-h-11 sm:min-h-9 sm:w-auto" onClick={() => setCreating(true)} disabled={!data}>
              <Plus aria-hidden /> Record payment
            </Button>
          ) : null
        }
      />
      {list.error ? <ErrorBanner message={list.error} onRetry={list.reload} /> : null}
      {list.data && balances.data && data ? <PaymentKpis rows={list.data.items} balances={balances.data.items} home={data.homeCurrency} /> : null}
      <Tabs defaultValue="payments">
        <TabsList
          className="mb-4 -mx-1 flex snap-x snap-mandatory flex-nowrap gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible"
          aria-label="Payment views"
        >
          <TabsTrigger value="payments" className="min-h-11 snap-start sm:min-h-8">Payments</TabsTrigger>
          <TabsTrigger value="customers" className="min-h-11 snap-start sm:min-h-8">
            <span className="sm:hidden">Customers</span>
            <span className="hidden sm:inline">Customer balances</span>
          </TabsTrigger>
          <TabsTrigger value="vendors" className="min-h-11 snap-start sm:min-h-8">
            <span className="sm:hidden">Vendors</span>
            <span className="hidden sm:inline">Vendor balances</span>
          </TabsTrigger>
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
              <ul className="lg:hidden" aria-label="Payments">
                {(list.data?.items ?? []).map((payment) => (
                  <RecordCard
                    key={payment.ItemId}
                    title={
                      <span className={cn(payment.isVoided && "text-muted-foreground line-through")}>
                        <span className="font-mono text-[13px]">{payment.number}</span> ·{" "}
                        {payment.party === "customer" ? data.customerOf(payment.partyId)?.name : data.vendorOf(payment.partyId)?.name}
                      </span>
                    }
                    value={formatMoney(payment.amount, payment.currencyCode)}
                    badges={
                      <>
                        <Badge variant={payment.party === "customer" ? "success" : "info"}>
                          {payment.party === "customer" ? <ArrowDownLeft aria-hidden /> : <ArrowUpRight aria-hidden />}{" "}
                          {payment.party === "customer" ? "Received" : "Paid out"}
                        </Badge>
                        {payment.isVoided ? (
                          <Badge variant="muted">
                            <Ban aria-hidden /> Voided
                          </Badge>
                        ) : null}
                      </>
                    }
                    meta={`${formatDate(payment.paidOn)} · ${PAYMENT_TYPES.find((type) => type.value === payment.type)?.label ?? ""}`}
                    footer={
                      canEdit && !payment.isVoided ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="min-h-11 w-full justify-center sm:min-h-9"
                          disabled={busy === payment.ItemId}
                          onClick={() => void onVoid(payment)}
                        >
                          Void payment
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </ul>
              <div className="hidden overflow-x-auto lg:block">
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

type AgingBucket = { current: number; d30: number; d60: number; older: number }

function BalanceAgingSection({
  currencyCode,
  bucket,
  loading,
}: {
  currencyCode: string
  bucket?: AgingBucket
  loading?: boolean
}) {
  const rows = [
    { label: "Current", value: bucket?.current ?? 0 },
    { label: "1–30 days", value: bucket?.d30 ?? 0 },
    { label: "31–60 days", value: bucket?.d60 ?? 0 },
    { label: "61+ days", value: bucket?.older ?? 0 },
  ] as const

  return (
    <div className="border-t border-border pt-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">Aging · days past due</p>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading aging…</p>
      ) : (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {rows.map(({ label, value }) => (
            <div key={label} className="rounded-md bg-muted/50 px-2.5 py-2 sm:px-3">
              <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-base font-semibold num tabular-nums sm:text-sm">{formatMoney(value, currencyCode)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function Balances({ party, lookups, rows, onRefreshed }: { party: Party; lookups: OrderLookups; rows: Awaited<ReturnType<typeof partyBalances.list>>["items"]; onRefreshed: () => void }) {
  const { user } = useCurrentUser()
  const [busy, setBusy] = React.useState(false)
  const [page, setPage] = React.useState(1)
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
  const total = mine.length
  const pages = Math.max(1, Math.ceil(total / BALANCE_PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), pages)
  const paged = mine.slice((safePage - 1) * BALANCE_PAGE_SIZE, safePage * BALANCE_PAGE_SIZE)
  const name = (id: string) => (party === "customer" ? lookups.customerOf(id)?.name : lookups.vendorOf(id)?.name) ?? ""

  React.useEffect(() => setPage(1), [party, total])

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

  const th = cn(headClass, "px-3 py-2")
  const td = "px-3 py-2.5"
  const money = "text-right num tabular-nums"
  const agingEdge = "border-l border-border"

  return (
    <SectionCard
      className="overflow-hidden p-0 md:p-0 [&>div:first-child]:flex-col [&>div:first-child]:items-stretch [&>div:first-child]:gap-3 [&>div:first-child]:border-b [&>div:first-child]:border-border [&>div:first-child]:px-4 [&>div:first-child]:py-4 sm:[&>div:first-child]:flex-row sm:[&>div:first-child]:items-start md:[&>div:first-child]:px-6"
      title={party === "customer" ? "What customers owe you" : "What you owe vendors"}
      description="Per currency. Store credit is money received or paid that is not on any order."
      actions={
        <Button
          size="sm"
          variant="secondary"
          className="min-h-11 w-full justify-center sm:min-h-9 sm:w-auto"
          onClick={() => void refreshAll()}
          disabled={busy}
        >
          <RefreshCw aria-hidden /> {busy ? "Recomputing…" : "Recompute"}
        </Button>
      }
    >
      {mine.length === 0 ? (
        <EmptyState icon={Wallet} message="Nothing open." />
      ) : (
        <>
          <ul className="divide-y lg:hidden" aria-label={party === "customer" ? "Customer balances" : "Vendor balances"}>
            {paged.map((row) => {
              const bucket = aging.data?.get(`${row.partyId}|${row.currencyCode}`)
              return (
                <li key={row.ItemId} className="flex flex-col gap-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug">{name(row.partyId)}</h3>
                    <Badge variant="muted" className="shrink-0 font-mono text-xs">{row.currencyCode}</Badge>
                  </div>
                  <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5">
                      <dt className="text-xs text-muted-foreground">Open balance</dt>
                      <dd className="mt-0.5 text-base font-semibold num tabular-nums">{formatMoney(row.openBalance, row.currencyCode)}</dd>
                    </div>
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5">
                      <dt className="text-xs text-muted-foreground">Store credit</dt>
                      <dd className="mt-0.5 text-base font-semibold num tabular-nums">{formatMoney(row.storeCredit, row.currencyCode)}</dd>
                    </div>
                  </dl>
                  <BalanceAgingSection currencyCode={row.currencyCode} bucket={bucket} loading={aging.loading && !aging.data} />
                </li>
              )
            })}
          </ul>
          <div className="hidden lg:block">
            <Table className="w-full border-separate border-spacing-0">
              <TableHeader className="bg-muted">
                <TableRow className="border-b-0 bg-muted hover:bg-muted">
                  <TableHead rowSpan={2} className={cn(th, "w-[1%] max-w-[16rem] align-bottom")}>
                    {party === "customer" ? "Customer" : "Vendor"}
                  </TableHead>
                  <TableHead rowSpan={2} className={cn(th, "w-[1%] align-bottom")}>Curr.</TableHead>
                  <TableHead rowSpan={2} className={cn(th, "w-[1%] align-bottom text-right")}>Open</TableHead>
                  <TableHead rowSpan={2} className={cn(th, "w-[1%] align-bottom pr-4 text-right")}>Credit</TableHead>
                  <TableHead
                    colSpan={4}
                    className={cn(th, agingEdge, "border-b border-border pb-1 text-center normal-case tracking-normal")}
                  >
                    <span className="label-overline">Aging · days past due</span>
                  </TableHead>
                </TableRow>
                <TableRow className="border-b border-border bg-muted hover:bg-muted">
                  <TableHead className={cn(th, agingEdge, "h-8 pt-0 text-right")}>Current</TableHead>
                  <TableHead className={cn(th, "h-8 pt-0 text-right")}>1–30</TableHead>
                  <TableHead className={cn(th, "h-8 pt-0 text-right")}>31–60</TableHead>
                  <TableHead className={cn(th, "pr-4 h-8 pt-0 text-right")}>61+</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((row) => {
                  const bucket = aging.data?.get(`${row.partyId}|${row.currencyCode}`)
                  return (
                    <TableRow key={row.ItemId} className="h-11">
                      <TableCell className={cn(td, "max-w-[16rem] truncate font-medium")}>{name(row.partyId)}</TableCell>
                      <TableCell className={cn(td, "text-muted-foreground")}>{row.currencyCode}</TableCell>
                      <TableCell className={cn(td, money)}>{formatMoney(row.openBalance, row.currencyCode)}</TableCell>
                      <TableCell className={cn(td, money, "pr-4")}>{formatMoney(row.storeCredit, row.currencyCode)}</TableCell>
                      {[bucket?.current, bucket?.d30, bucket?.d60, bucket?.older].map((value, index) => (
                        <TableCell
                          key={index}
                          className={cn(td, money, index === 0 && agingEdge, index === 3 && "pr-4")}
                        >
                          {formatMoney(value ?? 0, row.currencyCode)}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            page={safePage}
            pageSize={BALANCE_PAGE_SIZE}
            total={total}
            summary={`${total} open balance${total === 1 ? "" : "s"}`}
            onPageChange={setPage}
          />
        </>
      )}
    </SectionCard>
  )
}
