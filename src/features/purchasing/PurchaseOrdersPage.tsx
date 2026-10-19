import * as React from "react"
import { CircleAlert, FileText, PackageCheck, Plus, Truck, Wallet } from "lucide-react"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { KpiCard, KpiRow, RecordCard } from "@/components/app/data"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PURCHASE_EDITORS, useOrderLookups } from "@/features/sales/lookups"
import { InventoryBadge, PaymentBadge, headClass } from "@/features/sales/OrderBits"
import { repairIfDue } from "@/features/stock/api"
import { useResource } from "@/hooks/use-resource"
import { formatDate, formatMoney, formatNumber } from "@/lib/format"
import { toHome } from "@/features/sales/order-math"
import { cn } from "@/lib/utils"
import { purchaseOrders, type PurchaseOrder } from "./api"
import { PurchaseOrderDetail } from "./PurchaseOrderDetail"
import { PurchaseOrderEditor } from "./PurchaseOrderEditor"

// Purchase quotes and orders (spec 0012).

const VIEWS = {
  open: { label: "Open", test: (order: PurchaseOrder) => !order.isQuote && !order.isCancelled && order.inventoryStatus !== "fulfilled" },
  quotes: { label: "Quotes", test: (order: PurchaseOrder) => Boolean(order.isQuote) && !order.isCancelled },
  fulfilled: { label: "Received", test: (order: PurchaseOrder) => order.inventoryStatus === "fulfilled" },
  cancelled: { label: "Cancelled", test: (order: PurchaseOrder) => Boolean(order.isCancelled) },
  all: { label: "All", test: () => true },
} as const

export function PurchaseOrdersPage() {
  const canEdit = useCurrentUser().hasRole(...PURCHASE_EDITORS)
  const lookups = useOrderLookups()
  const list = useResource(() => purchaseOrders.list({ sort: { CreatedDate: -1 }, pageSize: 300 }), [])
  const [view, setView] = React.useState<keyof typeof VIEWS>("open")
  const [editing, setEditing] = React.useState<{ order?: PurchaseOrder; isQuote: boolean }>()
  const [viewing, setViewing] = React.useState<string>()

  React.useEffect(() => {
    void repairIfDue()
  }, [])

  const data = lookups.data
  const rows = (list.data?.items ?? []).filter(VIEWS[view].test)
  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Quotes and orders to your vendors. Receive in parts into bins with lots and serials; freight and extra costs flow into product cost."
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
      {list.data ? <PurchaseKpis orders={list.data.items} home={data?.homeCurrency ?? "USD"} view={view} onView={setView} /> : null}
      <Tabs value={view} onValueChange={(value) => setView(value as keyof typeof VIEWS)} className="mb-4">
        <TabsList className="mb-4" aria-label="Order views">
          {Object.entries(VIEWS).map(([key, entry]) => (
            <TabsTrigger key={key} value={key}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <SectionCard className="p-0 md:p-0">
        {(list.loading && !list.data) || !data ? (
          <div className="p-4">
            <LoadingRows />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Truck}
            message={(list.data?.items ?? []).length ? "Nothing in this view." : "No purchase orders yet."}
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
            <ul className="md:hidden" aria-label="Purchase orders">
              {rows.map((order) => (
                <RecordCard
                  key={order.ItemId}
                  onClick={() => setViewing(order.ItemId)}
                  title={
                    <>
                      <span className="font-mono text-[13px]">{order.number}</span> · {data.vendorOf(order.vendorId)?.name}
                    </>
                  }
                  value={formatMoney(Number(order.total ?? 0), order.currencyCode)}
                  badges={
                    <>
                      <InventoryBadge status={order.inventoryStatus} />
                      <PaymentBadge status={order.paymentStatus} />
                    </>
                  }
                  meta={formatDate(order.orderDate)}
                />
              ))}
            </ul>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className={headClass}>Number</TableHead>
                  <TableHead className={headClass}>Vendor</TableHead>
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
                    <TableCell>{data.vendorOf(order.vendorId)?.name}</TableCell>
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
      {editing && data ? (
        <PurchaseOrderEditor
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
        <PurchaseOrderDetail
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

/** Open orders, approvals, receiving and what you owe vendors (DESIGN.md §6.4). Cards switch the view. */
function PurchaseKpis({ orders, home, view, onView }: { orders: PurchaseOrder[]; home: string; view: keyof typeof VIEWS; onView: (view: keyof typeof VIEWS) => void }) {
  const live = orders.filter((order) => !order.isQuote && !order.isCancelled)
  const open = live.filter((order) => order.inventoryStatus !== "fulfilled")
  const value = open.reduce((sum, order) => sum + toHome(Number(order.total ?? 0), order.exchangeRate), 0)
  const unapproved = live.filter((order) => order.inventoryStatus === "unapproved").length
  const receiving = live.filter((order) => order.inventoryStatus === "started").length
  const owed = live.reduce((sum, order) => sum + Math.max(0, toHome(Number(order.total ?? 0) - Number(order.amountPaid ?? 0), order.exchangeRate)), 0)
  return (
    <KpiRow>
      <KpiCard label="Open orders" value={formatNumber(open.length)} hint={`${formatMoney(value, home)} on order`} icon={Truck} active={view === "open"} onClick={() => onView("open")} />
      <KpiCard label="Waiting for approval" value={formatNumber(unapproved)} hint="Need someone's limit to cover them" icon={CircleAlert} tone={unapproved ? "warning" : "default"} />
      <KpiCard label="Being received" value={formatNumber(receiving)} hint="Part received" icon={PackageCheck} tone={receiving ? "info" : "default"} />
      <KpiCard label="You owe vendors" value={formatMoney(owed, home)} hint="Not yet paid, home currency" icon={Wallet} tone={owed > 0.005 ? "warning" : "default"} />
    </KpiRow>
  )
}
