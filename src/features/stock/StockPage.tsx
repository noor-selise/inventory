import * as React from "react"
import { Boxes, History, Search } from "lucide-react"

import { useNavigation } from "@/app/router/navigation"
import { formatDateTime, useUserName } from "@/components/app/audit"
import { SelectField } from "@/components/app/form"
import { DateField } from "@/components/app/date-picker"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { tableCellClass, tableCol, tableFixed, tableHeadClass } from "@/components/app/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useResource } from "@/hooks/use-resource"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { locationFilter, seesLocation, useLocationScope } from "@/features/team/location-scope"
import { posting, quantitiesFor, repairIfDue } from "./api"
import { SOURCE_LABELS, useStockLookups, type StockLookups } from "./lookups"
import type { Movement } from "./posting.ts"

// Current stock and its history (spec 0007 AC-1, AC-2, AC-6, AC-9).

export function StockPage() {
  const lookups = useStockLookups()
  // A product's "View history" link opens here as ?tab=product&product=<id> (spec 0029).
  const { search } = useNavigation()
  const query = new URLSearchParams(search)
  const [productId, setProductId] = React.useState(query.get("product") ?? "")
  const [tab, setTab] = React.useState(query.get("tab") === "product" ? "product" : "on-hand")

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
          <TabsList aria-label="Stock views">
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
  const scope = useLocationScope()
  const { data, error, loading, reload } = useResource(
    () => posting.balances({ ...locationFilter(scope, "locationId", locationId), onHand: { $ne: 0 } }, { pageSize: 2000 }),
    [locationId, scope.key]
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
          options={lookups.locations.filter((location) => seesLocation(scope, location.ItemId)).map((location) => ({ value: location.ItemId, label: location.name }))}
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
            <Table className={tableFixed}>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className={tableHeadClass(tableCol.product)}>Product</TableHead>
                  <TableHead className={tableHeadClass(tableCol.location)}>Location</TableHead>
                  <TableHead className={tableHeadClass(tableCol.bin)}>Bin</TableHead>
                  <TableHead className={tableHeadClass(tableCol.mono)}>Lot or serial</TableHead>
                  <TableHead className={tableHeadClass(tableCol.numWide)}>On hand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ balance, product }) => (
                  <TableRow key={balance.ItemId} className="h-11 cursor-pointer" onClick={() => onOpenProduct(balance.productId)}>
                    <TableCell className={tableCellClass(tableCol.product)}>
                      <span className="block truncate font-medium">{product?.name ?? "Unknown product"}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">{product?.sku}</span>
                    </TableCell>
                    <TableCell className={tableCellClass(tableCol.location, "truncate")}>{lookups.locationName(balance.locationId)}</TableCell>
                    <TableCell className={tableCellClass(tableCol.bin)}>{lookups.binCode(balance.sublocationId)}</TableCell>
                    <TableCell className={tableCellClass(tableCol.mono, "truncate")}>{balance.serial ?? lookups.lotNumber(balance.lotId)}</TableCell>
                    <TableCell className={tableCellClass(tableCol.numWide, balance.onHand < 0 && "text-destructive-text")}>
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
  const scope = useLocationScope()
  // Per location rows: only allowed locations (spec 0003 Location limits).
  const quantities = useResource(async () => (productId ? (await quantitiesFor(productId)).filter((row) => seesLocation(scope, row.locationId)) : []), [productId, scope.key])
  const [asOf, setAsOf] = React.useState("")
  const history = useResource(
    async () => (productId ? (await posting.movements({ productId, status: "posted", ...locationFilter(scope, "locationId") }, { sort: { effectiveAt: 1 }, pageSize: 2000 })).items : []),
    [productId, scope.key]
  )

  const totals = (quantities.data ?? []).reduce(
    (sum, row) => ({
      onHand: sum.onHand + row.onHand,
      picked: sum.picked + row.picked,
      reserved: sum.reserved + row.reserved,
      available: sum.available + row.available,
      onOrder: sum.onOrder + row.onOrder,
      inTransit: sum.inTransit + row.inTransit,
      anticipated: sum.anticipated + row.anticipated,
    }),
    { onHand: 0, picked: 0, reserved: 0, available: 0, onOrder: 0, inTransit: 0, anticipated: 0 }
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
          <SectionCard title="Quantities" description="Picked stock has already left on hand. Available = on hand − reserved. Anticipated = on hand − reserved + on order.">
            {quantities.error ? <ErrorBanner message={quantities.error} /> : null}
            <div className="overflow-x-auto">
              <Table className={tableFixed}>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className={tableHeadClass(tableCol.location)}>Location</TableHead>
                    {["On hand", "Picked", "Reserved", "Available", "On order", "In transit", "Anticipated"].map((label) => (
                      <TableHead key={label} className={tableHeadClass(tableCol.num)}>
                        {label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(quantities.data ?? []).map((row) => (
                    <TableRow key={row.locationId} className="h-11">
                      <TableCell className={tableCellClass(tableCol.location, "truncate")}>{lookups.locationName(row.locationId)}</TableCell>
                      {[row.onHand, row.picked, row.reserved, row.available, row.onOrder, row.inTransit, row.anticipated].map((value, index) => (
                        <TableCell key={index} className={tableCellClass(tableCol.num, value < 0 && "text-destructive-text")}>
                          {formatNumber(value)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  <TableRow className="h-11 font-semibold">
                    <TableCell className={tableCellClass(tableCol.location)}>All locations</TableCell>
                    {[totals.onHand, totals.picked, totals.reserved, totals.available, totals.onOrder, totals.inTransit, totals.anticipated].map((value, index) => (
                      <TableCell key={index} className={tableCellClass(tableCol.num)}>
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
            actions={<DateField id="stock-as-of" label="As of" value={asOf} onChange={setAsOf} className="w-full sm:w-48" />}
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
                  <Table className={cn(tableFixed, "min-w-[640px]")}>
                    <TableHeader className="sticky top-0 z-10">
                      <TableRow className="bg-muted hover:bg-muted">
                        <TableHead className={tableHeadClass(tableCol.when)}>When</TableHead>
                        <TableHead className={tableHeadClass(tableCol.primary)}>What</TableHead>
                        <TableHead className={tableHeadClass(tableCol.trail)}>Where</TableHead>
                        <TableHead className={tableHeadClass(tableCol.person)}>By</TableHead>
                        <TableHead className={tableHeadClass(tableCol.delta)}>Change</TableHead>
                        <TableHead className={tableHeadClass(tableCol.num)}>Running</TableHead>
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
  const byLabel = movement.LastUpdatedBy ? by ?? "…" : "—"
  const where = [lookups.locationName(movement.locationId), lookups.binCode(movement.sublocationId), movement.serial ?? lookups.lotNumber(movement.lotId)]
    .filter(Boolean)
    .join(" · ")
  return (
    <TableRow className="h-11">
      <TableCell className={tableCellClass(tableCol.when, "text-muted-foreground")}>{formatDateTime(movement.effectiveAt)}</TableCell>
      <TableCell className={tableCellClass(tableCol.primary)}>
        <span className="block truncate">{SOURCE_LABELS[movement.sourceType] ?? movement.sourceType}</span>
        <span className="block truncate font-mono text-xs text-muted-foreground">{movement.sourceNumber}</span>
      </TableCell>
      <TableCell className={tableCellClass(tableCol.trail, "whitespace-normal text-sm leading-snug")}>
        <span className="line-clamp-2">{where || "—"}</span>
      </TableCell>
      <TableCell className={tableCellClass(tableCol.person, "text-muted-foreground")} title={byLabel}>
        {byLabel}
      </TableCell>
      <TableCell className={tableCellClass(tableCol.delta)}>
        <Badge variant={movement.qtyDelta >= 0 ? "success" : "warning"} className="tabular-nums">
          {movement.qtyDelta >= 0 ? "+" : ""}
          {formatNumber(movement.qtyDelta)}
        </Badge>
      </TableCell>
      <TableCell className={tableCellClass(tableCol.num)}>{formatNumber(running)}</TableCell>
    </TableRow>
  )
}
