// Suggested reorder point (spec 0014 AC-5, spec 0027): the daily sales rate
// over the last 90 days times the preferred vendor's lead time, plus the
// setting's safety stock. Pure, so Node checks can run it.

export const SALES_WINDOW_DAYS = 90

export type PickMovement = { productId: string; locationId: string; qtyDelta: number; sourceType: string }

/**
 * Units sold per product and location in the window: picks are negative
 * movements; a cancel writes a positive `sales_reversal` that takes them back.
 * Negative `sales_reversal` rows undo restocks and are not sales.
 */
export function unitsSold(movements: PickMovement[]) {
  const sold = new Map<string, number>()
  for (const movement of movements) {
    const key = `${movement.productId}|${movement.locationId}`
    if (movement.sourceType === "sales_pick") sold.set(key, (sold.get(key) ?? 0) - Number(movement.qtyDelta))
    if (movement.sourceType === "sales_reversal" && movement.qtyDelta > 0) sold.set(key, (sold.get(key) ?? 0) - Number(movement.qtyDelta))
  }
  return sold
}

export function suggestedPoint(sold: number, leadTimeDays: number | null | undefined, safetyStock: number | null | undefined, windowDays = SALES_WINDOW_DAYS) {
  const rate = Math.max(0, sold) / windowDays
  const lead = Math.max(0, Number(leadTimeDays ?? 0))
  return { rate, lead, point: Math.ceil(rate * lead + Math.max(0, Number(safetyStock ?? 0))) }
}
