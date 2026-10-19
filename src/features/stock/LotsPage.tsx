import * as React from "react"
import { Ban, CircleAlert, CircleCheck, Search, Waypoints } from "lucide-react"

import { formatDateTime } from "@/components/app/audit"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useResource } from "@/hooks/use-resource"
import { formatDate, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { posting, type Lot } from "./api"
import { SOURCE_LABELS, useStockLookups, type StockLookups } from "./lookups"
import type { Movement } from "./posting.ts"

// Lots with expiry, and forward and backward trace from the ledger
// (spec 0009 AC-1, AC-6, AC-7). Expiry emails (AC-5) wait for a schedule workflow.

const headClass = "h-9 text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase"
const DAY = 86_400_000

export function LotsPage() {
  const lookups = useStockLookups()
  const [query, setQuery] = React.useState("")
  const [serialQuery, setSerialQuery] = React.useState("")
  const [trace, setTrace] = React.useState<{ title: string; filter: Record<string, unknown> }>()
  const stock = useResource(async () => {
    const { items } = await posting.balances({ lotId: { $ne: null } }, { pageSize: 5000 })
    const totals = new Map<string, number>()
    for (const balance of items) if (balance.lotId) totals.set(balance.lotId, (totals.get(balance.lotId) ?? 0) + balance.onHand)
    return totals
  }, [])

  const data = lookups.data
  const needle = query.trim().toLowerCase()
  const rows = (data?.lots ?? [])
    .map((lot) => ({ lot, product: data?.product(lot.productId), onHand: stock.data?.get(lot.ItemId) ?? 0 }))
    .filter(({ lot, product }) => !needle || lot.lotNumber.toLowerCase().includes(needle) || product?.name.toLowerCase().includes(needle) || product?.sku.toLowerCase().includes(needle))
    .sort((a, b) => (a.lot.expiresOn ?? "9999").localeCompare(b.lot.expiresOn ?? "9999"))

  function expiry(lot: Lot, noticeDays?: number | null) {
    if (!lot.expiresOn) return <span className="text-muted-foreground">No expiry</span>
    const days = Math.floor((new Date(lot.expiresOn).getTime() - Date.now()) / DAY)
    const label = formatDate(lot.expiresOn)
    if (days < 0) {
      return (
        <Badge variant="destructive">
          <CircleAlert aria-hidden /> Expired {label}
        </Badge>
      )
    }
    if (days <= (noticeDays ?? 30)) {
      return (
        <Badge variant="warning">
          <CircleAlert aria-hidden /> {label} · {days} days
        </Badge>
      )
    }
    return (
      <Badge variant="success">
        <CircleCheck aria-hidden /> {label}
      </Badge>
    )
  }

  return (
    <>
      <PageHeader title="Lots and serials" description="Lots by expiry, and where any lot or serial came from and went." />
      {lookups.error ? <ErrorBanner message={lookups.error} onRetry={lookups.reload} /> : null}
      <SectionCard title="Trace a serial number" className="mb-6">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            const serial = serialQuery.trim()
            if (serial) setTrace({ title: `Serial ${serial}`, filter: { serial } })
          }}
        >
          <Input aria-label="Serial number" placeholder="Scan or type a serial number" className="font-mono sm:max-w-sm" value={serialQuery} onChange={(event) => setSerialQuery(event.target.value)} />
          <Button type="submit" variant="secondary">
            <Waypoints aria-hidden /> Trace
          </Button>
        </form>
      </SectionCard>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" aria-label="Filter lots" placeholder="Filter by lot number or product" className="h-10 rounded-full pl-10" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <SectionCard className="p-0 md:p-0">
        {!data ? (
          <div className="p-4">
            <LoadingRows />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Ban} message="No lots yet. They are created when lot tracked stock is received or adjusted in." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className={headClass}>Lot</TableHead>
                  <TableHead className={headClass}>Product</TableHead>
                  <TableHead className={headClass}>Expires</TableHead>
                  <TableHead className={cn(headClass, "text-right")}>On hand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ lot, product, onHand }) => (
                  <TableRow
                    key={lot.ItemId}
                    className="h-11 cursor-pointer"
                    onClick={() => setTrace({ title: `Lot ${lot.lotNumber} · ${product?.name ?? ""}`, filter: { lotId: lot.ItemId } })}
                  >
                    <TableCell className="font-mono text-[13px]">{lot.lotNumber}</TableCell>
                    <TableCell>
                      <span className="block">{product?.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{product?.sku}</span>
                    </TableCell>
                    <TableCell>{expiry(lot, product?.expiryNoticeDays)}</TableCell>
                    <TableCell className="text-right num">
                      {formatNumber(onHand)} <span className="text-xs text-muted-foreground">{product?.standardUom}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
      {trace && data ? <TraceDialog title={trace.title} filter={trace.filter} lookups={data} onClose={() => setTrace(undefined)} /> : null}
    </>
  )
}

function TraceDialog({ title, filter, lookups, onClose }: { title: string; filter: Record<string, unknown>; lookups: StockLookups; onClose: () => void }) {
  const { data, error, loading } = useResource(
    async () => (await posting.movements({ ...filter, status: "posted" }, { sort: { effectiveAt: 1 }, pageSize: 2000 })).items,
    [JSON.stringify(filter)]
  )
  const movements = data ?? []
  // Backward: where it came from. Forward: where it went. Moves between our own
  // locations show in both, which is the full path.
  const cameIn = movements.filter((movement) => movement.qtyDelta > 0)
  const wentOut = movements.filter((movement) => movement.qtyDelta < 0)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Every posted movement, oldest first. Sales and purchase documents appear here once those features exist.</DialogDescription>
        </DialogHeader>
        {error ? <ErrorBanner message={error} /> : null}
        {loading && !data ? (
          <LoadingRows />
        ) : movements.length === 0 ? (
          <EmptyState icon={Waypoints} message="No movements found." />
        ) : (
          <div className="flex flex-col gap-6">
            <TraceTable title="Came in (backward trace)" rows={cameIn} lookups={lookups} />
            <TraceTable title="Went out (forward trace)" rows={wentOut} lookups={lookups} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TraceTable({ title, rows, lookups }: { title: string; rows: Movement[]; lookups: StockLookups }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">None.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className={headClass}>When</TableHead>
                <TableHead className={headClass}>Document</TableHead>
                <TableHead className={headClass}>Where</TableHead>
                <TableHead className={cn(headClass, "text-right")}>Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((movement) => (
                <TableRow key={movement.ItemId} className="h-11">
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(movement.effectiveAt)}</TableCell>
                  <TableCell>
                    <span className="block">{SOURCE_LABELS[movement.sourceType] ?? movement.sourceType}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{movement.sourceNumber}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {[lookups.locationName(movement.locationId), lookups.binCode(movement.sublocationId)].filter(Boolean).join(" · ")}
                  </TableCell>
                  <TableCell className="text-right num">{formatNumber(Math.abs(movement.qtyDelta))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
