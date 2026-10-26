import * as React from "react"
import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, ListOrdered, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { RecordCard } from "@/components/app/data"
import { EmptyState, ErrorBanner, LoadingRows, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { lots, posting } from "@/features/stock/api"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatDate, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { buildQueue, setPriority, type QueueRow } from "./actions"
import { type SalesOrder } from "./api"
import { SALES_EDITORS } from "@/features/team/roles"
import { locationFilter, useLocationScope } from "@/features/team/location-scope"
import { type OrderLookups } from "./lookups"
import { InventoryBadge, headClass } from "./OrderBits"

// The fulfillment queue (spec 0011 AC-10): open orders by priority, each
// marked "can ship now" or "needs stock" after stock goes to higher priority
// orders first. Up and down change the order (the keyboard friendly form of
// dragging).

export function FulfillmentQueue({ orders, lookups, onOpen, onChanged }: { orders: SalesOrder[]; lookups: OrderLookups; onOpen: (orderId: string) => void; onChanged: () => void }) {
  const { hasRole, user } = useCurrentUser()
  const canPrioritize = hasRole(...SALES_EDITORS)
  const [busy, setBusy] = React.useState(false)
  const scope = useLocationScope()
  const stock = useResource(async () => {
    const { items: balances } = await posting.balances({ onHand: { $gt: 0 }, ...locationFilter(scope, "locationId") }, { pageSize: 5000 })
    const lotIds = [...new Set(balances.map((row) => row.lotId).filter(Boolean) as string[])]
    const lotRows = lotIds.length ? (await lots.list({ filter: { ItemId: { $in: lotIds } }, pageSize: lotIds.length })).items : []
    return { balances, lotRows }
  }, [orders, scope.key])

  const open = orders.filter((order) => !order.isQuote && !order.isCancelled && ["unconfirmed", "unfulfilled", "started"].includes(String(order.inventoryStatus)))
  const now = new Date().toISOString()
  const rows = stock.data
    ? buildQueue(open, stock.data.balances, lookups, (lotId) => {
        const expires = stock.data?.lotRows.find((lot) => lot.ItemId === lotId)?.expiresOn
        return Boolean(expires && expires < now)
      })
    : []

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= rows.length) return
    const ordered = rows.map((row) => row.order)
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    setBusy(true)
    try {
      // Number the whole queue again from the top so every priority is distinct.
      for (const [position, order] of ordered.entries()) await setPriority(order, ordered.length - position, user?.email ?? "unknown")
      onChanged()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard className="p-0 md:p-0" title="Fulfillment queue" description="Stock goes to the orders at the top first. Move an order up to ship it sooner.">
      {stock.error ? <ErrorBanner message={stock.error} onRetry={stock.reload} /> : null}
      {!stock.data ? (
        <div className="p-4">
          <LoadingRows />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ListOrdered} message="No open orders." />
      ) : (
        <>
        <ul className="md:hidden" aria-label="Fulfillment queue">
          {rows.map((row, index) => (
            <RecordCard
              key={row.order.ItemId}
              onClick={() => onOpen(row.order.ItemId)}
              leading={<span className="mt-0.5 w-5 shrink-0 text-right text-sm text-muted-foreground num">{index + 1}</span>}
              title={
                <>
                  <span className="font-mono text-[13px]">{row.order.number}</span> · {lookups.customerOf(row.order.customerId)?.name}
                </>
              }
              badges={<QueueStatus row={row} />}
              meta={row.short.length ? `Short: ${row.short.map((item) => `${lookups.productOf(item.productId)?.name} ${formatNumber(item.missing)}`).join(", ")}` : formatDate(row.order.orderDate)}
            />
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className={cn(headClass, "w-12")}>#</TableHead>
                <TableHead className={headClass}>Order</TableHead>
                <TableHead className={headClass}>Customer</TableHead>
                <TableHead className={cn(headClass, "hidden md:table-cell")}>Date</TableHead>
                <TableHead className={headClass}>Stock</TableHead>
                <TableHead className={cn(headClass, "hidden sm:table-cell")}>Inventory</TableHead>
                {canPrioritize ? <TableHead className="w-24" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.order.ItemId} className="h-11">
                  <TableCell className="num text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <button type="button" className="font-mono text-[13px] text-primary underline-offset-2 hover:underline" onClick={() => onOpen(row.order.ItemId)}>
                      {row.order.number}
                    </button>
                  </TableCell>
                  <TableCell>{lookups.customerOf(row.order.customerId)?.name}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{formatDate(row.order.orderDate)}</TableCell>
                  <TableCell>
                    <span className="flex flex-col gap-0.5">
                      <QueueStatus row={row} />
                      {row.short.length && !row.held ? (
                        <span className="text-xs text-muted-foreground">{row.short.map((item) => `${lookups.productOf(item.productId)?.name} ${formatNumber(item.missing)}`).join(", ")}</span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <InventoryBadge status={row.order.inventoryStatus} />
                  </TableCell>
                  {canPrioritize ? (
                    <TableCell className="whitespace-nowrap text-right">
                      <Button size="icon" variant="ghost" aria-label={`Move ${row.order.number} up`} disabled={busy || index === 0} onClick={() => void move(index, -1)}>
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Move ${row.order.number} down`} disabled={busy || index === rows.length - 1} onClick={() => void move(index, 1)}>
                        <ArrowDown aria-hidden />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}
    </SectionCard>
  )
}

/** Status with an icon, never color alone (DESIGN.md §1, §2.3). */
function QueueStatus({ row }: { row: QueueRow }) {
  if (row.held)
    return (
      <Badge variant="warning">
        <TriangleAlert aria-hidden /> Waits for confirmation
      </Badge>
    )
  if (row.canShipNow)
    return (
      <Badge variant="success">
        <CircleCheck aria-hidden /> Can ship now
      </Badge>
    )
  return (
    <Badge variant="destructive">
      <CircleAlert aria-hidden /> Needs stock
    </Badge>
  )
}
