import * as React from "react"
import { FileText, Plus, Receipt, ShoppingCart, Wallet } from "lucide-react"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { KpiCard, KpiRow, RecordCard } from "@/components/app/data"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { repairIfDue } from "@/features/stock/api"
import { useResource } from "@/hooks/use-resource"
import { formatDate, formatMoney, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { salesOrders, type SalesOrder } from "./api"
import { toHome } from "./order-math"
import { FulfillmentQueue } from "./FulfillmentQueue"
import { SALES_EDITORS } from "@/features/team/roles"
import { locationFilter, useLocationScope } from "@/features/team/location-scope"
import { useOrderLookups } from "./lookups"
import { InventoryBadge, PaymentBadge, headClass } from "./OrderBits"
import { SalesOrderDetail } from "./SalesOrderDetail"
import { SalesOrderEditor } from "./SalesOrderEditor"

// Sales quotes and orders (spec 0011).

const VIEWS = {
  open: { label: "Open", test: (order: SalesOrder) => !order.isQuote && !order.isCancelled && order.inventoryStatus !== "fulfilled" },
  quotes: { label: "Quotes", test: (order: SalesOrder) => Boolean(order.isQuote) && !order.isCancelled },
  fulfilled: { label: "Fulfilled", test: (order: SalesOrder) => order.inventoryStatus === "fulfilled" },
  cancelled: { label: "Cancelled", test: (order: SalesOrder) => Boolean(order.isCancelled) },
  all: { label: "All", test: () => true },
  queue: { label: "Fulfillment queue", test: () => true },
} as const

export function SalesOrdersPage() {
  const { hasRole, profile, user } = useCurrentUser()
  const canEdit = hasRole(...SALES_EDITORS)
  const lookups = useOrderLookups()
  // A rep limited to their own customers sees only orders where they are the rep (spec 0011 AC-8).
  const ownOnly = profile?.ownCustomersOnly ? String(user?.itemId ?? "none") : null
  const scope = useLocationScope()
  const list = useResource(
    () => salesOrders.list({ filter: { ...(ownOnly ? { salesRepUserId: ownOnly } : {}), ...locationFilter(scope, "locationId") }, sort: { CreatedDate: -1 }, pageSize: 300 }),
    [ownOnly, scope.key]
  )
  const [view, setView] = React.useState<keyof typeof VIEWS>("open")
  const [editing, setEditing] = React.useState<{ order?: SalesOrder; isQuote: boolean }>()
  const [viewing, setViewing] = React.useState<string>()

  React.useEffect(() => {
    void repairIfDue()
  }, [])

  const data = lookups.data
  const rows = (list.data?.items ?? []).filter(VIEWS[view].test)
  return (
    <>
      <PageHeader
        title="Sales orders"
        description="Quotes and orders, from pick and pack to ship and payment. Statuses are worked out from the lines, never set by hand."
        actions={
          canEdit ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditing({ isQuote: true })} disabled={!data}>
                <FileText aria-hidden /> New quote
              </Button>
              <Button onClick={() => setEditing({ isQuote: false })} disabled={!data}>
                <Plus aria-hidden /> New order
              </Button>
            </div>
          ) : null
        }
      />
      {list.error ? <ErrorBanner message={list.error} onRetry={list.reload} /> : null}
      {lookups.error ? <ErrorBanner message={lookups.error} onRetry={lookups.reload} /> : null}
      {list.data ? <SalesKpis orders={list.data.items} home={data?.homeCurrency ?? "USD"} view={view} onView={setView} /> : null}
      <Tabs value={view} onValueChange={(value) => setView(value as keyof typeof VIEWS)} className="mb-4">
        <TabsList className="mb-4" aria-label="Order views">
          {Object.entries(VIEWS).map(([key, entry]) => (
            <TabsTrigger key={key} value={key}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {view === "queue" && data && list.data ? (
        <FulfillmentQueue orders={list.data.items} lookups={data} onOpen={setViewing} onChanged={() => void list.reload()} />
      ) : (
        <SectionCard className="p-0 md:p-0">
          {(list.loading && !list.data) || !data ? (
            <div className="p-4">
              <LoadingRows />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              message={(list.data?.items ?? []).length ? "Nothing in this view." : "No sales orders yet."}
              action={
                canEdit && !(list.data?.items ?? []).length ? (
                  <Button onClick={() => setEditing({ isQuote: false })}>
                    <Plus aria-hidden /> New order
                  </Button>
                ) : null
              }
            />
          ) : (
            <>
            <ul className="md:hidden" aria-label="Sales orders">
              {rows.map((order) => (
                <RecordCard
                  key={order.ItemId}
                  onClick={() => setViewing(order.ItemId)}
                  title={<><span className="font-mono text-[13px]">{order.number}</span> · {data.customerOf(order.customerId)?.name}</>}
                  value={formatMoney(Number(order.total ?? 0), order.currencyCode)}
                  badges={<><InventoryBadge status={order.inventoryStatus} /><PaymentBadge status={order.paymentStatus} /></>}
                  meta={formatDate(order.orderDate)}
                />
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className={headClass}>Number</TableHead>
                    <TableHead className={headClass}>Customer</TableHead>
                    <TableHead className={cn(headClass, "hidden md:table-cell")}>Date</TableHead>
                    <TableHead className={cn(headClass, "text-right")}>Total</TableHead>
                    <TableHead className={headClass}>Inventory</TableHead>
                    <TableHead className={cn(headClass, "hidden sm:table-cell")}>Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((order) => (
                    <TableRow
                      key={order.ItemId}
                      tabIndex={0}
                      className="h-11 cursor-pointer focus-visible:bg-accent focus-visible:outline-none"
                      onClick={() => setViewing(order.ItemId)}
                      onKeyDown={(event) => event.key === "Enter" && setViewing(order.ItemId)}
                    >
                      <TableCell className="font-mono text-[13px]">{order.number}</TableCell>
                      <TableCell>{data.customerOf(order.customerId)?.name}</TableCell>
                      <TableCell className="hidden text-sm md:table-cell">{formatDate(order.orderDate)}</TableCell>
                      <TableCell className="text-right num">{formatMoney(Number(order.total ?? 0), order.currencyCode)}</TableCell>
                      <TableCell>
                        <InventoryBadge status={order.inventoryStatus} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <PaymentBadge status={order.paymentStatus} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </SectionCard>
      )}
      {editing && data ? (
        <SalesOrderEditor
          lookups={data}
          order={editing.order}
          isQuote={editing.isQuote}
          onClose={() => setEditing(undefined)}
          onSaved={(order) => {
            setEditing(undefined)
            void list.reload()
            setViewing(order.ItemId)
          }}
        />
      ) : null}
      {viewing && data && !editing ? (
        <SalesOrderDetail
          orderId={viewing}
          lookups={data}
          onClose={() => setViewing(undefined)}
          onEdit={(order) => setEditing({ order, isQuote: Boolean(order.isQuote) })}
          onChanged={() => void list.reload()}
        />
      ) : null}
    </>
  )
}

/** Open orders, quotes, orders to invoice and what customers owe (DESIGN.md §6.4). Cards switch the view. */
function SalesKpis({ orders, home, view, onView }: { orders: SalesOrder[]; home: string; view: keyof typeof VIEWS; onView: (view: keyof typeof VIEWS) => void }) {
  const live = orders.filter((order) => !order.isQuote && !order.isCancelled)
  const open = live.filter((order) => order.inventoryStatus !== "fulfilled")
  const value = open.reduce((sum, order) => sum + toHome(Number(order.total ?? 0), order.exchangeRate), 0)
  const quotes = orders.filter((order) => order.isQuote && !order.isCancelled).length
  const toInvoice = live.filter((order) => !order.invoicedOn && (order.inventoryStatus === "fulfilled" || order.inventoryStatus === "started")).length
  const owed = live.filter((order) => order.invoicedOn).reduce((sum, order) => sum + Math.max(0, toHome(Number(order.total ?? 0) - Number(order.amountPaid ?? 0), order.exchangeRate)), 0)
  return (
    <KpiRow>
      <KpiCard label="Open orders" value={formatNumber(open.length)} hint={`${formatMoney(value, home)} to fulfill`} icon={ShoppingCart} active={view === "open"} onClick={() => onView("open")} />
      <KpiCard label="Quotes" value={formatNumber(quotes)} hint="Waiting to become orders" icon={FileText} active={view === "quotes"} onClick={() => onView("quotes")} />
      <KpiCard label="To invoice" value={formatNumber(toInvoice)} hint="Shipped or started, not invoiced" icon={Receipt} tone={toInvoice ? "info" : "default"} />
      <KpiCard label="Customers owe you" value={formatMoney(owed, home)} hint="Invoiced, not yet paid" icon={Wallet} tone={owed > 0.005 ? "warning" : "default"} />
    </KpiRow>
  )
}
