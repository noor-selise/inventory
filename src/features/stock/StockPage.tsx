import * as React from "react"
import { Boxes, History, Search } from "lucide-react"

import { formatDateTime, useUserName } from "@/components/app/audit"
import { SelectField, TextField } from "@/components/app/form"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useResource } from "@/hooks/use-resource"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { posting, quantitiesFor, repairIfDue } from "./api"
import { SOURCE_LABELS, useStockLookups, type StockLookups } from "./lookups"
import type { Movement } from "./posting.ts"

// Current stock and its history (spec 0007 AC-1, AC-2, AC-6, AC-9).

const headClass = "h-9 text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase"

export function StockPage() {
  const lookups = useStockLookups()
  const [productId, setProductId] = React.useState("")
  const [tab, setTab] = React.useState("on-hand")

  React.useEffect(() => {
    void repairIfDue()
  }, [])

  return (
    <>
      <PageHeader title="Stock" description="What is on hand where, and every change that got it there." />
      {lookups.error ? <ErrorBanner message={lookups.error} onRetry={lookups.reload} /> : null}
      {!lookups.data ? (
        <LoadingRows rows={6} />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="on-hand">On hand</TabsTrigger>
            <TabsTrigger value="product">By product</TabsTrigger>
          </TabsList>
          <TabsContent value="on-hand" className="mt-4">
            <OnHand
              lookups={lookups.data}
              onOpenProduct={(id) => {
                setProductId(id)
                setTab("product")
              }}
            />
          </TabsContent>
          <TabsContent value="product" className="mt-4">
            <ProductStock lookups={lookups.data} productId={productId} onProductChange={setProductId} />
          </TabsContent>
        </Tabs>
      )}
    </>
  )
}

function OnHand({ lookups, onOpenProduct }: { lookups: StockLookups; onOpenProduct: (productId: string) => void }) {
  const [locationId, setLocationId] = React.useState("")
  const [query, setQuery] = React.useState("")
  const { data, error, loading, reload } = useResource(
    () => posting.balances(locationId ? { locationId, onHand: { $ne: 0 } } : { onHand: { $ne: 0 } }, { pageSize: 2000 }),
    [locationId]
  )
  const needle = query.trim().toLowerCase()
  const rows = (data?.items ?? [])
    .map((balance) => ({ balance, product: lookups.product(balance.productId) }))
    .filter(({ product }) => !needle || product?.name.toLowerCase().includes(needle) || product?.sku.toLowerCase().includes(needle))
    .sort((a, b) => (a.product?.name ?? "").localeCompare(b.product?.name ?? ""))

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
        <SelectField
          id="stock-location"
          label="Location"
          allowNone
          placeholder="All locations"
          options={lookups.locations.map((location) => ({ value: location.ItemId, label: location.name }))}
          value={locationId}
          onChange={setLocationId}
          className="md:w-64"
        />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" aria-label="Filter by product" placeholder="Filter by product name or SKU" className="h-10 rounded-full pl-10" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>
      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}
      <SectionCard className="p-0 md:p-0">
        {loading && !data ? (
          <div className="p-4">
            <LoadingRows />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Boxes} message="No stock here yet. Post an adjustment to add opening stock." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className={headClass}>Product</TableHead>
                  <TableHead className={headClass}>Location</TableHead>
                  <TableHead className={headClass}>Bin</TableHead>
                  <TableHead className={cn(headClass, "hidden md:table-cell")}>Lot or serial</TableHead>
                  <TableHead className={cn(headClass, "text-right")}>On hand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ balance, product }) => (
                  <TableRow key={balance.ItemId} className="h-11 cursor-pointer" onClick={() => onOpenProduct(balance.productId)}>
                    <TableCell>
                      <span className="block font-medium">{product?.name ?? "Unknown product"}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{product?.sku}</span>
                    </TableCell>
                    <TableCell>{lookups.locationName(balance.locationId)}</TableCell>
                    <TableCell className="font-mono text-[13px]">{lookups.binCode(balance.sublocationId)}</TableCell>
                    <TableCell className="hidden font-mono text-[13px] md:table-cell">{balance.serial ?? lookups.lotNumber(balance.lotId)}</TableCell>
                    <TableCell className={cn("text-right num", balance.onHand < 0 && "text-destructive-text")}>
                      {formatNumber(balance.onHand)} <span className="text-xs text-muted-foreground">{product?.standardUom}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </>
  )
}

function ProductStock({ lookups, productId, onProductChange }: { lookups: StockLookups; productId: string; onProductChange: (id: string) => void }) {
  const product = lookups.product(productId)
  const quantities = useResource(async () => (productId ? quantitiesFor(productId) : []), [productId])
  const [asOf, setAsOf] = React.useState("")
  const history = useResource(
    async () => (productId ? (await posting.movements({ productId, status: "posted" }, { sort: { effectiveAt: 1 }, pageSize: 2000 })).items : []),
    [productId]
  )

  const totals = (quantities.data ?? []).reduce(
    (sum, row) => ({
      onHand: sum.onHand + row.onHand,
      picked: sum.picked + row.picked,
      reserved: sum.reserved + row.reserved,
      available: sum.available + row.available,
      onOrder: sum.onOrder + row.onOrder,
      inTransit: sum.inTransit + row.inTransit,
    }),
    { onHand: 0, picked: 0, reserved: 0, available: 0, onOrder: 0, inTransit: 0 }
  )

  // Running balance from the ledger; as of a date it rebuilds past stock (AC-9).
  const cutoff = asOf ? new Date(`${asOf}T23:59:59.999`).getTime() : Infinity
  let running = 0
  const historyRows = (history.data ?? [])
    .filter((movement) => new Date(movement.effectiveAt).getTime() <= cutoff)
    .map((movement) => {
      running += movement.qtyDelta
      return { movement, running }
    })
    .reverse()

  return (
    <div className="flex flex-col gap-6">
      <SelectField
        id="stock-product"
        label="Product"
        options={lookups.products.filter((item) => item.itemType === "stocked").map((item) => ({ value: item.ItemId, label: `${item.name} (${item.sku})` }))}
        value={productId}
        onChange={onProductChange}
        className="max-w-xl"
      />
      {!product ? (
        <EmptyState icon={Boxes} message="Choose a product to see its quantities and history." />
      ) : (
        <>
          <SectionCard title="Quantities" description="Available = on hand − picked − reserved. Reserved and on order arrive with sales and purchase orders.">
            {quantities.error ? <ErrorBanner message={quantities.error} /> : null}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    {["Location", "On hand", "Picked", "Reserved", "Available", "On order", "In transit"].map((label, index) => (
                      <TableHead key={label} className={cn(headClass, index > 0 && "text-right")}>
                        {label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(quantities.data ?? []).map((row) => (
                    <TableRow key={row.locationId} className="h-11">
                      <TableCell>{lookups.locationName(row.locationId)}</TableCell>
                      {[row.onHand, row.picked, row.reserved, row.available, row.onOrder, row.inTransit].map((value, index) => (
                        <TableCell key={index} className={cn("text-right num", value < 0 && "text-destructive-text")}>
                          {formatNumber(value)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  <TableRow className="h-11 font-semibold">
                    <TableCell>All locations</TableCell>
                    {[totals.onHand, totals.picked, totals.reserved, totals.available, totals.onOrder, totals.inTransit].map((value, index) => (
                      <TableCell key={index} className="text-right num">
                        {formatNumber(value)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </SectionCard>
          <SectionCard
            title="History"
            description="Every posted change, newest first. Pick a date to see what was on hand at the end of that day, across all locations."
            actions={<TextField id="stock-as-of" label="As of" type="date" value={asOf} onChange={setAsOf} className="w-44" />}
          >
            {history.error ? <ErrorBanner message={history.error} /> : null}
            {historyRows.length === 0 ? (
              <EmptyState icon={History} message="No movements yet." />
            ) : (
              <>
                {asOf ? (
                  <p className="mb-3 text-sm">
                    On hand at the end of {asOf}: <span className="font-semibold num">{formatNumber(historyRows[0]?.running ?? 0)}</span> {product.standardUom}
                  </p>
                ) : null}
                <div className="max-h-[480px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10">
                      <TableRow className="bg-muted hover:bg-muted">
                        <TableHead className={headClass}>When</TableHead>
                        <TableHead className={headClass}>What</TableHead>
                        <TableHead className={cn(headClass, "hidden lg:table-cell")}>Where</TableHead>
                        <TableHead className={cn(headClass, "hidden xl:table-cell")}>By</TableHead>
                        <TableHead className={cn(headClass, "text-right")}>Change</TableHead>
                        <TableHead className={cn(headClass, "text-right")}>Running</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyRows.map(({ movement, running: total }) => (
                        <HistoryRow key={movement.ItemId} movement={movement} running={total} lookups={lookups} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}

function HistoryRow({ movement, running, lookups }: { movement: Movement; running: number; lookups: StockLookups }) {
  const by = useUserName(movement.LastUpdatedBy)
  const where = [lookups.locationName(movement.locationId), lookups.binCode(movement.sublocationId), movement.serial ?? lookups.lotNumber(movement.lotId)]
    .filter(Boolean)
    .join(" · ")
  return (
    <TableRow className="h-11">
      <TableCell className="text-xs text-muted-foreground">{formatDateTime(movement.effectiveAt)}</TableCell>
      <TableCell>
        <span className="block">{SOURCE_LABELS[movement.sourceType] ?? movement.sourceType}</span>
        <span className="block font-mono text-xs text-muted-foreground">{movement.sourceNumber}</span>
      </TableCell>
      <TableCell className="hidden text-sm lg:table-cell">{where}</TableCell>
      <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">{by}</TableCell>
      <TableCell className="text-right num">
        <Badge variant={movement.qtyDelta >= 0 ? "success" : "warning"}>
          {movement.qtyDelta >= 0 ? "+" : ""}
          {formatNumber(movement.qtyDelta)}
        </Badge>
      </TableCell>
      <TableCell className="text-right num">{formatNumber(running)}</TableCell>
    </TableRow>
  )
}
