import * as React from "react"
import { BellRing, ListChecks, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { RecordList } from "@/components/app/record-list"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createPurchaseOrder } from "@/features/purchasing/actions"
import { PURCHASE_EDITORS, useOrderLookups, type OrderLookups } from "@/features/sales/lookups"
import { headClass } from "@/features/sales/OrderBits"
import { createTransfer } from "@/features/stock/actions"
import { useStockLookups } from "@/features/stock/lookups"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatDateTime } from "@/components/app/audit"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { REORDER_METHODS, reorderSettings, reorderSuggestions, runReorderCheck, sendLowStockAlerts, suggestedPoints, type ReorderSetting, type ReorderSuggestion } from "./api"

// Reorder points, the reorder list and one click drafts (spec 0014). The list
// is rebuilt once a day by the first person signed in (spec 0027); "Check now"
// does the same work right away. Both send low stock alerts for new breaches.

export function ReorderPage() {
  const { hasRole, user } = useCurrentUser()
  const canEdit = hasRole(...PURCHASE_EDITORS)
  const lookups = useOrderLookups()
  const stockLookups = useStockLookups()
  const list = useResource(() => reorderSuggestions.list({ pageSize: 2000 }), [])
  const settings = useResource(() => reorderSettings.list({ pageSize: 5000 }), [])
  const suggested = useResource(async () => (settings.data ? suggestedPoints(settings.data.items) : undefined), [settings.data])
  const [checking, setChecking] = React.useState(false)
  const [chosen, setChosen] = React.useState<string[]>([])
  const [drafting, setDrafting] = React.useState(false)
  // RecordList keeps its own rows; a new key reloads it after a point is applied here.
  const [listVersion, setListVersion] = React.useState(0)
  const data = lookups.data

  async function check() {
    setChecking(true)
    try {
      const outcome = await runReorderCheck()
      const alerts = await sendLowStockAlerts(outcome)
      toast.success(`${outcome.suggestions.length} below their reorder point${alerts.count ? `, ${alerts.count} new alert${alerts.count === 1 ? "" : "s"} (in app ${alerts.inApp}, email ${alerts.email})` : ""}`)
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
    const rows = (list.data?.items ?? []).filter((row) => chosen.includes(row.ItemId))
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

  const rows = list.data?.items ?? []
  const computedAt = rows.reduce((latest, row) => (row.computedAt > latest ? row.computedAt : latest), "")
  const productOptions = (data?.products ?? []).filter((product) => product.itemType === "stocked").map((product) => ({ value: product.ItemId, label: `${product.name} (${product.sku})` }))
  const locationOptions = (data?.locations ?? []).map((location) => ({ value: location.ItemId, label: location.name }))
  const vendorOptions = (data?.vendors ?? []).map((vendor) => ({ value: vendor.ItemId, label: vendor.name }))

  return (
    <>
      <PageHeader
        title="Reordering"
        description="Products whose anticipated quantity (on hand − reserved + on order) is below their reorder point, and one click to order or move them."
        actions={
          canEdit ? (
            <Button variant="secondary" onClick={() => void check()} disabled={checking}>
              <RefreshCw aria-hidden /> {checking ? "Checking…" : "Check now"}
            </Button>
          ) : null
        }
      />
      {list.error ? <ErrorBanner message={list.error} onRetry={list.reload} /> : null}
      <Tabs defaultValue="list">
        <TabsList className="mb-4">
          <TabsTrigger value="list">Reorder list</TabsTrigger>
          <TabsTrigger value="settings">Reorder points</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <SectionCard
            className="p-0 md:p-0"
            title="Below reorder point"
            description={computedAt ? `Checked ${formatDateTime(computedAt)}.` : "Not checked yet. Press Check now."}
            actions={
              canEdit ? (
                <Button size="sm" onClick={() => void draft()} disabled={!chosen.length || drafting}>
                  {drafting ? "Creating…" : `Create drafts (${chosen.length})`}
                </Button>
              ) : null
            }
          >
            {(list.loading && !list.data) || !data ? (
              <div className="p-4">
                <LoadingRows />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState icon={ListChecks} message="Nothing to reorder." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                      <TableHead className="w-10">
                        <Checkbox aria-label="Choose all" checked={chosen.length === rows.length} onCheckedChange={(value) => setChosen(value === true ? rows.map((row) => row.ItemId) : [])} />
                      </TableHead>
                      <TableHead className={headClass}>Product</TableHead>
                      <TableHead className={headClass}>Location</TableHead>
                      <TableHead className={cn(headClass, "text-right")}>Anticipated</TableHead>
                      <TableHead className={cn(headClass, "text-right")}>Point</TableHead>
                      <TableHead className={cn(headClass, "text-right")}>Suggested</TableHead>
                      <TableHead className={headClass}>How</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const setting = settings.data?.items.find((item) => item.productId === row.productId && item.locationId === row.locationId)
                      return (
                        <TableRow key={row.ItemId} className="h-11">
                          <TableCell>
                            <Checkbox aria-label="Choose" checked={chosen.includes(row.ItemId)} onCheckedChange={(value) => setChosen((current) => (value === true ? [...current, row.ItemId] : current.filter((id) => id !== row.ItemId)))} />
                          </TableCell>
                          <TableCell>
                            {data.productOf(row.productId)?.name}
                            {setting?.isAlerting ? (
                              <Badge variant="warning" className="ml-2">
                                <BellRing aria-hidden /> Alerted
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell>{data.locationName(row.locationId)}</TableCell>
                          <TableCell className="text-right num">{formatNumber(row.anticipated)}</TableCell>
                          <TableCell className="text-right num">{formatNumber(row.reorderPoint)}</TableCell>
                          <TableCell className="text-right num font-semibold">{formatNumber(row.suggestedQty)}</TableCell>
                          <TableCell className="text-sm">
                            {REORDER_METHODS.find((method) => method.value === row.method)?.label}
                            {row.vendorId ? ` · ${data.vendorOf(row.vendorId)?.name}` : row.sourceLocationId ? ` · from ${data.locationName(row.sourceLocationId)}` : ""}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
          <p className="mt-3 text-sm text-muted-foreground">
            Purchase lines become one purchase order per vendor, transfers one transfer per source location. Manufacture orders arrive with the manufacturing feature (spec 0020).
          </p>
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
                { name: "sourceLocationId", label: "Move from", type: "select", options: locationOptions, allowNone: true, visible: (values) => values.method === "transfer" },
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
      })),
    })
    made.push(transfer.number)
  }
  return made
}
