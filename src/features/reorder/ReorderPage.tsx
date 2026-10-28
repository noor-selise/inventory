import * as React from "react"
import { BellRing, CircleAlert, Factory, ListChecks, PackageX, RefreshCw, ShoppingCart, TriangleAlert, Truck } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { formatDateTime } from "@/components/app/audit"
import { BulkActionBar, FilterChips, KpiCard, KpiRow, RecordCard, StockMeter } from "@/components/app/data"
import { SelectField } from "@/components/app/form"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { tableCellClass, tableCol, tableFixed, tableHeadClass } from "@/components/app/table"
import { RecordList } from "@/components/app/record-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createPurchaseOrder } from "@/features/purchasing/actions"
import { useOrderLookups, type OrderLookups } from "@/features/sales/lookups"
import { PURCHASE_EDITORS } from "@/features/team/roles"
import { createTransfer } from "@/features/stock/actions"
import { useStockLookups } from "@/features/stock/lookups"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { locationFilter, seesLocation, useLocationScope } from "@/features/team/location-scope"
import { REORDER_METHODS, reorderSettings, reorderSuggestions, runReorderCheck, sendLowStockAlerts, suggestedPoints, type ReorderSetting, type ReorderSuggestion } from "./api"

// Reorder points, the reorder list and one click drafts (spec 0014). The list
// is rebuilt once a day by the first person signed in (spec 0027); "Check now"
// does the same work right away. Both send low stock alerts for new breaches.

type MethodFilter = "all" | "purchase" | "transfer" | "manufacture"
type Focus = "all" | "out" | "alerted"

const METHOD_ICON = { purchase: ShoppingCart, transfer: Truck, manufacture: Factory } as const

/** Status per DESIGN.md §2.3: out of stock is destructive, below the point is low stock. */
function StockStatus({ row, alerted }: { row: ReorderSuggestion; alerted?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {row.anticipated <= 0 ? (
        <Badge variant="destructive">
          <CircleAlert aria-hidden /> Out of stock
        </Badge>
      ) : (
        <Badge variant="warning">
          <TriangleAlert aria-hidden /> Low stock
        </Badge>
      )}
      {alerted ? (
        <Badge variant="neutral">
          <BellRing aria-hidden /> Alerted
        </Badge>
      ) : null}
    </span>
  )
}

export function ReorderPage() {
  const { hasRole, user } = useCurrentUser()
  const canEdit = hasRole(...PURCHASE_EDITORS)
  const lookups = useOrderLookups()
  const stockLookups = useStockLookups()
  const scope = useLocationScope()
  const list = useResource(() => reorderSuggestions.list({ filter: locationFilter(scope, "locationId"), pageSize: 2000 }), [scope.key])
  const settings = useResource(() => reorderSettings.list({ pageSize: 5000 }), [])
  const suggested = useResource(async () => (settings.data ? suggestedPoints(settings.data.items) : undefined), [settings.data])
  const [checking, setChecking] = React.useState(false)
  const [chosen, setChosen] = React.useState<string[]>([])
  const [drafting, setDrafting] = React.useState(false)
  const [method, setMethod] = React.useState<MethodFilter>("all")
  const [focus, setFocus] = React.useState<Focus>("all")
  const [locationId, setLocationId] = React.useState("")
  // RecordList keeps its own rows; a new key reloads it after a point is applied here.
  const [listVersion, setListVersion] = React.useState(0)
  const data = lookups.data

  async function check() {
    setChecking(true)
    try {
      const outcome = await runReorderCheck()
      const alerts = await sendLowStockAlerts(outcome)
      toast.success(`${outcome.suggestions.length} below their reorder point${alerts.count ? `, ${alerts.count} new alert${alerts.count === 1 ? "" : "s"} (email ${alerts.email})` : ""}`)
      void list.reload()
      void settings.reload()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setChecking(false)
    }
  }

  async function applyPoint(setting: ReorderSetting, point: number) {
    try {
      await reorderSettings.update(setting.ItemId, { reorderPoint: point })
      toast.success(`Reorder point set to ${formatNumber(point)}`)
      setListVersion((value) => value + 1)
      void settings.reload()
    } catch (caught) {
      toast.error(errorMessage(caught))
    }
  }

  async function draft() {
    if (!data || !stockLookups.data) return
    const rows = all.filter((row) => chosen.includes(row.ItemId))
    setDrafting(true)
    try {
      const made = await createDrafts(rows, data, stockLookups.data, user?.email ?? "unknown")
      toast.success(made.length ? `Created ${made.join(", ")}` : "Nothing to create")
      setChosen([])
      void list.reload()
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setDrafting(false)
    }
  }

  const all = list.data?.items ?? []
  const settingOf = (row: ReorderSuggestion) => settings.data?.items.find((item) => item.productId === row.productId && item.locationId === row.locationId)
  const rows = all
    .filter((row) => method === "all" || row.method === method)
    .filter((row) => !locationId || row.locationId === locationId)
    .filter((row) => (focus === "out" ? row.anticipated <= 0 : focus === "alerted" ? settingOf(row)?.isAlerting : true))
    .sort((a, b) => a.anticipated / Math.max(a.reorderPoint, 1) - b.anticipated / Math.max(b.reorderPoint, 1))
  const computedAt = all.reduce((latest, row) => (row.computedAt > latest ? row.computedAt : latest), "")
  const vendorsToOrder = new Set(all.filter((row) => row.method === "purchase").map((row) => row.vendorId ?? "none")).size
  const transferRoutes = new Set(all.filter((row) => row.method === "transfer").map((row) => `${row.sourceLocationId}|${row.locationId}`)).size
  const outCount = all.filter((row) => row.anticipated <= 0).length
  const alertedCount = all.filter((row) => settingOf(row)?.isAlerting).length
  const draftable = rows.filter((row) => row.method !== "manufacture")
  const productOptions = (data?.products ?? []).filter((product) => product.itemType === "stocked").map((product) => ({ value: product.ItemId, label: `${product.name} (${product.sku})` }))
  const allLocationOptions = (data?.locations ?? []).map((location) => ({ value: location.ItemId, label: location.name }))
  const locationOptions = allLocationOptions.filter((option) => seesLocation(scope, option.value))
  const vendorOptions = (data?.vendors ?? []).map((vendor) => ({ value: vendor.ItemId, label: vendor.name }))
  const unit = (productId: string) => data?.productOf(productId)?.standardUom ?? ""
  const how = (row: ReorderSuggestion) =>
    `${REORDER_METHODS.find((item) => item.value === row.method)?.label ?? ""}${row.vendorId ? ` · ${data?.vendorOf(row.vendorId)?.name ?? ""}` : row.sourceLocationId ? ` · from ${data?.locationName(row.sourceLocationId)}` : ""}`
  const toggle = (id: string, on: boolean) => setChosen((current) => (on ? [...new Set([...current, id])] : current.filter((item) => item !== id)))
  const allChosen = draftable.length > 0 && draftable.every((row) => chosen.includes(row.ItemId))

  return (
    <>
      <PageHeader
        title="Reordering"
        description="What to order or move before you run out. Anticipated stock is on hand, minus reserved, plus on order."
        actions={
          canEdit ? (
            <Button variant="secondary" onClick={() => void check()} disabled={checking}>
              <RefreshCw aria-hidden className={cn(checking && "animate-spin")} /> {checking ? "Checking…" : "Check now"}
            </Button>
          ) : null
        }
      />
      {list.error ? <ErrorBanner message={list.error} onRetry={list.reload} /> : null}
      <KpiRow>
        <KpiCard label="Below reorder point" value={formatNumber(all.length)} icon={TriangleAlert} tone={all.length ? "warning" : "default"} hint={computedAt ? `Checked ${formatDateTime(computedAt)}` : "Not checked yet"} active={focus === "all"} onClick={() => setFocus("all")} />
        <KpiCard label="Out of stock" value={formatNumber(outCount)} icon={PackageX} tone={outCount ? "destructive" : "default"} hint="Nothing left to sell" active={focus === "out"} onClick={() => setFocus(focus === "out" ? "all" : "out")} />
        <KpiCard label="Alerted" value={formatNumber(alertedCount)} icon={BellRing} hint="Until restocked" active={focus === "alerted"} onClick={() => setFocus(focus === "alerted" ? "all" : "alerted")} />
        <KpiCard label="Drafts to make" value={formatNumber(vendorsToOrder + transferRoutes)} icon={ShoppingCart} hint={`${vendorsToOrder} purchase · ${transferRoutes} transfer`} />
      </KpiRow>
      <Tabs defaultValue="list">
        <TabsList className="mb-4" aria-label="Reorder views">
          <TabsTrigger value="list">Reorder list</TabsTrigger>
          <TabsTrigger value="settings">Reorder points</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <SectionCard className="p-0 md:p-0">
            <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-end md:justify-between">
              <FilterChips<MethodFilter>
                label="How to restock"
                value={method}
                onChange={setMethod}
                options={[
                  { value: "all", label: "All", count: all.length },
                  { value: "purchase", label: "Purchase", count: all.filter((row) => row.method === "purchase").length },
                  { value: "transfer", label: "Transfer", count: all.filter((row) => row.method === "transfer").length },
                  { value: "manufacture", label: "Manufacture", count: all.filter((row) => row.method === "manufacture").length },
                ]}
              />
              <SelectField id="reorder-location" label="Location" options={locationOptions} value={locationId} onChange={setLocationId} allowNone placeholder="All locations" className="md:w-56" />
            </div>
            {(list.loading && !list.data) || !data ? (
              <div className="p-4">
                <LoadingRows />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                message={all.length ? "Nothing matches these filters." : "Everything is above its reorder point."}
                action={
                  canEdit && !all.length ? (
                    <Button variant="secondary" onClick={() => void check()} disabled={checking}>
                      <RefreshCw aria-hidden /> Check now
                    </Button>
                  ) : null
                }
              />
            ) : (
              <>
                <ul className="md:hidden" aria-label="Below reorder point">
                  {rows.map((row) => {
                    const selectable = canEdit && row.method !== "manufacture"
                    return (
                      <RecordCard
                        key={row.ItemId}
                        selected={chosen.includes(row.ItemId)}
                        leading={selectable ? <Checkbox className="mt-1" aria-label={`Choose ${data.productOf(row.productId)?.name}`} checked={chosen.includes(row.ItemId)} onCheckedChange={(value) => toggle(row.ItemId, value === true)} /> : null}
                        title={data.productOf(row.productId)?.name}
                        value={`+${formatNumber(row.suggestedQty)} ${unit(row.productId)}`}
                        badges={<StockStatus row={row} alerted={settingOf(row)?.isAlerting ?? false} />}
                        meta={`${data.locationName(row.locationId)} · ${formatNumber(row.anticipated)} of ${formatNumber(row.reorderPoint)} · ${how(row)}`}
                      />
                    )
                  })}
                </ul>
                <div className="hidden overflow-x-auto md:block">
                  <Table className={tableFixed}>
                    <TableHeader>
                      <TableRow className="bg-muted hover:bg-muted">
                        <TableHead className={tableHeadClass(tableCol.select)}>
                          {canEdit ? <Checkbox aria-label="Choose all" checked={allChosen} onCheckedChange={(value) => setChosen(value === true ? draftable.map((row) => row.ItemId) : [])} /> : null}
                        </TableHead>
                        <TableHead className={tableHeadClass(tableCol.product)}>Product</TableHead>
                        <TableHead className={tableHeadClass(tableCol.location)}>Location</TableHead>
                        <TableHead className={tableHeadClass(tableCol.stockVs)}>Stock vs point</TableHead>
                        <TableHead className={tableHeadClass(tableCol.suggested)}>Suggested</TableHead>
                        <TableHead className={tableHeadClass(tableCol.how)}>How</TableHead>
                        <TableHead className={tableHeadClass(tableCol.status)}>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => {
                        const product = data.productOf(row.productId)
                        const picked = chosen.includes(row.ItemId)
                        const Icon = METHOD_ICON[row.method as keyof typeof METHOD_ICON] ?? ShoppingCart
                        return (
                          <TableRow key={row.ItemId} data-state={picked ? "selected" : undefined} className={cn("h-14", picked && "bg-primary/10 shadow-[inset_2px_0_0_var(--primary)] hover:bg-primary/10")}>
                            <TableCell className={tableCellClass(tableCol.select)}>
                              {canEdit && row.method !== "manufacture" ? (
                                <Checkbox aria-label={`Choose ${product?.name}`} checked={picked} onCheckedChange={(value) => toggle(row.ItemId, value === true)} />
                              ) : null}
                            </TableCell>
                            <TableCell className={tableCellClass(tableCol.product)}>
                              <span className="block truncate font-medium">{product?.name}</span>
                              <span className="block truncate font-mono text-xs text-muted-foreground">{product?.sku}</span>
                            </TableCell>
                            <TableCell className={tableCellClass(tableCol.location, "truncate text-sm")}>{data.locationName(row.locationId)}</TableCell>
                            <TableCell className={tableCellClass(tableCol.stockVs)}>
                              <StockMeter value={row.anticipated} target={row.reorderPoint} unit={unit(row.productId)} />
                            </TableCell>
                            <TableCell className={tableCellClass(tableCol.suggested)}>
                              <span className="font-semibold num">{formatNumber(row.suggestedQty)}</span> <span className="text-xs text-muted-foreground">{unit(row.productId)}</span>
                            </TableCell>
                            <TableCell className={tableCellClass(tableCol.how, "text-sm")}>
                              <span className="flex items-center gap-2">
                                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                <span className="truncate">{how(row)}</span>
                              </span>
                            </TableCell>
                            <TableCell className={tableCellClass(tableCol.status)}>
                              <StockStatus row={row} alerted={settingOf(row)?.isAlerting ?? false} />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </SectionCard>
          <p className="mt-3 text-xs text-muted-foreground">
            Purchase lines become one purchase order per vendor, transfers one transfer per source location. Manufacture orders arrive with the manufacturing feature (spec 0020).
          </p>
          {chosen.length ? <div className="h-20" aria-hidden /> : null}
          <BulkActionBar count={chosen.length} noun="product" onClear={() => setChosen([])}>
            <Button onClick={() => void draft()} disabled={drafting}>
              {drafting ? "Creating…" : "Create drafts"}
            </Button>
          </BulkActionBar>
        </TabsContent>
        <TabsContent value="settings">
          {data ? (
            <RecordList<ReorderSetting>
              key={listVersion}
              collection={reorderSettings}
              noun="Reorder point"
              canEdit={canEdit}
              emptyMessage="No reorder points yet."
              onChanged={() => void settings.reload()}
              fields={[
                { name: "productId", label: "Product", type: "select", required: true, options: productOptions },
                { name: "locationId", label: "Location", type: "select", required: true, options: locationOptions },
                { name: "reorderPoint", label: "Reorder point", type: "number", required: true, min: 0, helper: "Reorder when anticipated stock falls below this." },
                { name: "reorderQty", label: "Reorder quantity", type: "number", min: 0, helper: "How much to order each time." },
                { name: "safetyStock", label: "Safety stock", type: "number", min: 0, helper: "Extra units on top of lead time demand, used for the suggested point." },
                { name: "method", label: "How", type: "select", required: true, options: REORDER_METHODS.map((method) => ({ value: method.value, label: method.label })) },
                { name: "vendorId", label: "Vendor", type: "select", options: vendorOptions, allowNone: true, visible: (values) => values.method === "purchase" },
                { name: "sourceLocationId", label: "Move from", type: "select", options: allLocationOptions, allowNone: true, visible: (values) => values.method === "transfer" },
              ]}
              defaults={{ method: "purchase" }}
              validate={(values, items, editing) => {
                const clash = items.find((item) => item.productId === values.productId && item.locationId === values.locationId && item.ItemId !== editing?.ItemId)
                if (clash) return "This product already has a reorder point at this location."
                if (values.method === "transfer" && values.sourceLocationId === values.locationId) return "Move from a different location."
                return undefined
              }}
              columns={[
                { label: "Product", render: (row) => data.productOf(row.productId)?.name },
                { label: "Location", render: (row) => data.locationName(row.locationId) },
                { label: "Point", render: (row) => formatNumber(row.reorderPoint), numeric: true },
                { label: "Quantity", render: (row) => formatNumber(row.reorderQty ?? 0), numeric: true },
                {
                  label: "Suggested point",
                  render: (row) => {
                    const hint = suggested.data?.get(row.ItemId)
                    if (!hint) return null
                    const title = `${formatNumber(hint.sold)} sold in 90 days (${formatNumber(Math.round(hint.rate * 100) / 100)} a day) × ${formatNumber(hint.lead)} days lead time + ${formatNumber(row.safetyStock ?? 0)} safety stock`
                    return (
                      <span className="inline-flex items-center gap-2" title={title}>
                        <span className="num">{formatNumber(hint.point)}</span>
                        {canEdit && hint.point !== Number(row.reorderPoint) ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(event) => {
                              event.stopPropagation()
                              void applyPoint(row, hint.point)
                            }}
                          >
                            Use
                          </Button>
                        ) : null}
                      </span>
                    )
                  },
                },
                { label: "How", render: (row) => REORDER_METHODS.find((method) => method.value === row.method)?.label },
                { label: "Alert", render: (row) => (row.isAlerting ? <Badge variant="warning">Alerted</Badge> : null) },
              ]}
            />
          ) : (
            <LoadingRows />
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}

/** One purchase order per vendor, one transfer per source location (spec 0014 AC-3). */
async function createDrafts(rows: ReorderSuggestion[], lookups: OrderLookups, stockLookups: NonNullable<ReturnType<typeof useStockLookups>["data"]>, by: string) {
  const made: string[] = []
  const purchase = rows.filter((row) => row.method === "purchase")
  const missingVendor = purchase.filter((row) => !row.vendorId)
  if (missingVendor.length) throw new Error(`${lookups.productOf(missingVendor[0].productId)?.name}: choose a vendor on its reorder point first.`)
  const byVendor = new Map<string, ReorderSuggestion[]>()
  for (const row of purchase) byVendor.set(`${row.vendorId}|${row.locationId}`, [...(byVendor.get(`${row.vendorId}|${row.locationId}`) ?? []), row])
  for (const [key, group] of byVendor) {
    const [vendorId, locationId] = key.split("|")
    const vendor = lookups.vendorOf(vendorId)
    const currencyCode = vendor?.currencyCode || lookups.homeCurrency
    const exchangeRate = lookups.rateFor(currencyCode)
    const order = await createPurchaseOrder(
      {
        isQuote: false,
        vendorId,
        contact: vendor?.contacts?.[0] ?? null,
        vendorAddress: vendor?.address ?? null,
        receiveLocationId: locationId,
        orderDate: new Date().toISOString(),
        currencyCode,
        exchangeRate,
        paymentTermId: vendor?.paymentTermId ?? null,
        taxingSchemeId: lookups.taxSchemes.find((scheme) => scheme.isDefault)?.ItemId ?? null,
        freight: 0,
        allocationMethod: "value",
        remarks: "Drafted from the reorder list",
        lines: group.map((row) => {
          const product = lookups.productOf(row.productId)
          const item = lookups.vendorItems.find((entry) => entry.vendorId === vendorId && entry.productId === row.productId)
          const from = item?.currencyCode || lookups.homeCurrency
          const price = item?.unitCost ? (from === currencyCode ? item.unitCost : (item.unitCost / lookups.rateFor(from)) * exchangeRate) : 0
          return {
            lineId: crypto.randomUUID(),
            productId: row.productId,
            vendorItemCode: item?.vendorItemCode ?? null,
            qty: row.suggestedQty,
            uom: product?.standardUom ?? null,
            stdQty: row.suggestedQty,
            unitPrice: Math.round(price * 10000) / 10000,
            receivedQty: 0,
          }
        }),
      },
      lookups,
      by
    )
    made.push(order.number)
  }
  const transfers = rows.filter((row) => row.method === "transfer")
  const missingSource = transfers.filter((row) => !row.sourceLocationId)
  if (missingSource.length) throw new Error(`${lookups.productOf(missingSource[0].productId)?.name}: choose where to move it from on its reorder point first.`)
  const byRoute = new Map<string, ReorderSuggestion[]>()
  for (const row of transfers) byRoute.set(`${row.sourceLocationId}|${row.locationId}`, [...(byRoute.get(`${row.sourceLocationId}|${row.locationId}`) ?? []), row])
  for (const [key, group] of byRoute) {
    const [fromLocationId, toLocationId] = key.split("|")
    const transfer = await createTransfer({
      fromLocationId,
      toLocationId,
      remarks: "Drafted from the reorder list",
      lookups: stockLookups,
      lines: group.map((row) => ({
        key: crypto.randomUUID(),
        productId: row.productId,
        uom: lookups.productOf(row.productId)?.standardUom ?? "",
        qty: String(row.suggestedQty),
        direction: "out" as const,
        binCode: "",
        toBinCode: "",
        lotNumber: "",
        lotExpiresOn: "",
        serial: "",
        unitCost: "",
      })),
    })
    made.push(transfer.number)
  }
  return made
}
