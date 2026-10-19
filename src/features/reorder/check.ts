// The reorder check (spec 0014 AC-2, AC-4): which product and location pairs
// have an anticipated quantity below their reorder point, how much to order,
// and which need an alert. An alert goes out once per breach and is armed
// again only after the pair is back at or above its point (restocked).
// One self contained function with no imports and no outside references: the
// app's "Check now" button calls it, and scripts/workflows/build.mjs copies its
// source into the nightly reorder check workflow.

export type ReorderSettingRow = {
  ItemId: string
  productId: string
  locationId: string
  reorderPoint: number
  reorderQty?: number | null
  method?: string | null
  vendorId?: string | null
  sourceLocationId?: string | null
  isAlerting?: boolean | null
}

export type ReorderOutcome = {
  suggestions: {
    productId: string
    locationId: string
    onHand: number
    reserved: number
    onOrder: number
    anticipated: number
    reorderPoint: number
    suggestedQty: number
    method: string
    vendorId: string | null
    sourceLocationId: string | null
  }[]
  /** Settings whose alert flag changes: true = alert now, false = re armed after restock. */
  alerts: { settingId: string; productId: string; locationId: string; alerting: boolean }[]
}

export function computeReorder(
  settings: ReorderSettingRow[],
  quantities: { productId: string; locationId: string; onHand: number; reserved: number; onOrder: number; anticipated: number }[]
): ReorderOutcome {
  const byKey = new Map(quantities.map((row) => [`${row.productId}|${row.locationId}`, row]))
  const outcome: ReorderOutcome = { suggestions: [], alerts: [] }
  for (const setting of settings) {
    const point = Number(setting.reorderPoint ?? 0)
    const q = byKey.get(`${setting.productId}|${setting.locationId}`) ?? { onHand: 0, reserved: 0, onOrder: 0, anticipated: 0 }
    const below = q.anticipated < point
    if (below) {
      // Order the reorder quantity, or at least enough to get back to the point.
      const suggestedQty = Math.max(Number(setting.reorderQty ?? 0), point - q.anticipated)
      outcome.suggestions.push({
        productId: setting.productId,
        locationId: setting.locationId,
        onHand: q.onHand,
        reserved: q.reserved,
        onOrder: q.onOrder,
        anticipated: q.anticipated,
        reorderPoint: point,
        suggestedQty,
        method: setting.method || "purchase",
        vendorId: setting.vendorId ?? null,
        sourceLocationId: setting.sourceLocationId ?? null,
      })
    }
    if (below && !setting.isAlerting) outcome.alerts.push({ settingId: setting.ItemId, productId: setting.productId, locationId: setting.locationId, alerting: true })
    if (!below && setting.isAlerting) outcome.alerts.push({ settingId: setting.ItemId, productId: setting.productId, locationId: setting.locationId, alerting: false })
  }
  return outcome
}
