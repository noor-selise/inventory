import { collection, type Entity } from "@/lib/blocks/data"
import { OPEN_PO_FILTER, purchaseOrders } from "@/features/purchasing/api"
import { OPEN_ORDER_FILTER, salesOrders } from "@/features/sales/api"
import { posting, stockTransfers } from "@/features/stock/api"
import { computeQuantities } from "@/features/stock/quantities"
import { computeReorder, type ReorderOutcome } from "./check"

// Reorder settings and the reorder list (spec 0014). The list is rebuilt every
// night by the `reorder-check` workflow; "Check now" runs the same function in
// the browser and writes the same records.

export const REORDER_METHODS = [
  { value: "purchase", label: "Purchase order" },
  { value: "transfer", label: "Stock transfer" },
  { value: "manufacture", label: "Manufacture order" },
] as const

export type ReorderSetting = Entity & {
  productId: string
  locationId: string
  reorderPoint: number
  reorderQty?: number | null
  method: (typeof REORDER_METHODS)[number]["value"]
  vendorId?: string | null
  sourceLocationId?: string | null
  sublocationId?: string | null
  isAlerting?: boolean | null
  lastAlertedAt?: string | null
}

export type ReorderSuggestion = Entity & ReorderOutcome["suggestions"][number] & { computedAt: string }

export const reorderSettings = collection<ReorderSetting>("ReorderSetting", [
  "productId",
  "locationId",
  "reorderPoint",
  "reorderQty",
  "method",
  "vendorId",
  "sourceLocationId",
  "sublocationId",
  "isAlerting",
  "lastAlertedAt",
])

export const reorderSuggestions = collection<ReorderSuggestion>("ReorderSuggestion", [
  "productId",
  "locationId",
  "onHand",
  "reserved",
  "onOrder",
  "anticipated",
  "reorderPoint",
  "suggestedQty",
  "method",
  "vendorId",
  "sourceLocationId",
  "computedAt",
])

/** Runs the reorder check now and replaces the list (the same work as the nightly workflow). */
export async function runReorderCheck(): Promise<ReorderOutcome> {
  const [settings, balances, transfers, sales, purchases] = await Promise.all([
    reorderSettings.list({ pageSize: 5000 }),
    posting.balances({}, { pageSize: 5000 }),
    stockTransfers.list({ filter: { status: { $in: ["open", "in_transit"] } }, pageSize: 1000 }),
    salesOrders.list({ filter: OPEN_ORDER_FILTER, pageSize: 2000 }),
    purchaseOrders.list({ filter: OPEN_PO_FILTER, pageSize: 2000 }),
  ])
  const quantities = computeQuantities({ balances: balances.items, transfers: transfers.items, salesOrders: sales.items, purchaseOrders: purchases.items })
  const outcome = computeReorder(settings.items, quantities)
  const computedAt = new Date().toISOString()

  const existing = (await reorderSuggestions.list({ pageSize: 5000 })).items
  const keyOf = (row: { productId: string; locationId: string }) => `${row.productId}|${row.locationId}`
  const wanted = new Map(outcome.suggestions.map((row) => [keyOf(row), row]))
  for (const row of existing) if (!wanted.has(keyOf(row))) await reorderSuggestions.remove(row.ItemId)
  for (const row of outcome.suggestions) {
    const current = existing.find((item) => keyOf(item) === keyOf(row))
    if (current) await reorderSuggestions.update(current.ItemId, { ...row, computedAt })
    else await reorderSuggestions.create({ ...row, computedAt })
  }
  for (const alert of outcome.alerts) {
    await reorderSettings.updateWhere(
      { ItemId: alert.settingId, isAlerting: alert.alerting ? { $ne: true } : true },
      alert.alerting ? { isAlerting: true, lastAlertedAt: computedAt } : { isAlerting: false }
    )
  }
  return outcome
}
