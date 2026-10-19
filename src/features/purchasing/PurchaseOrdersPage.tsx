import * as React from "react"
import { FileText, Plus, Truck } from "lucide-react"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PURCHASE_EDITORS, useOrderLookups } from "@/features/sales/lookups"
import { InventoryBadge, PaymentBadge, headClass } from "@/features/sales/OrderBits"
import { repairIfDue } from "@/features/stock/api"
import { useResource } from "@/hooks/use-resource"
import { formatDate, formatMoney } from "@/lib/format"
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
      <Tabs value={view} onValueChange={(value) => setView(value as keyof typeof VIEWS)} className="mb-4">
        <TabsList>
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
          <EmptyState icon={Truck} message="Nothing here yet." />
        ) : (
          <div className="overflow-x-auto">
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
                  <TableRow key={order.ItemId} className="h-11 cursor-pointer" onClick={() => setViewing(order.ItemId)}>
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
