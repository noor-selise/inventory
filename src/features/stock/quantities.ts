// The PRD §5.3 quantities per product and location (spec 0007 AC-6):
//   on hand     balances (picked stock has already left on hand)
//   picked      picked on open sales orders, not shipped yet
//   reserved    open sales lines not picked yet + open transfers not sent yet
//   on order    open purchase lines not received + transfers coming in
//   in transit  sent on a transfer, not received yet
//   available   on hand − reserved
//   anticipated on hand − reserved + on order (drives reordering)
// One self contained function with no imports and no outside references: the
// app calls it, and scripts/workflows/build.mjs copies its source into the
// reorder check workflow, so the screen and the nightly list agree.

export type QuantityRow = {
  productId: string
  locationId: string
  onHand: number
  picked: number
  reserved: number
  available: number
  onOrder: number
  inTransit: number
  anticipated: number
}

export function computeQuantities(input: {
  balances: { productId: string; locationId: string; onHand?: number | null }[]
  salesOrders: { locationId: string; lines?: { productId: string; stdQty: number; pickedQty?: number | null; shippedQty?: number | null }[] | null }[]
  purchaseOrders: { receiveLocationId: string; lines?: { productId: string; stdQty: number; receivedQty?: number | null }[] | null }[]
  transfers: { fromLocationId: string; toLocationId: string; status: string; lines?: { productId: string; qty: number }[] | null }[]
  productIds?: string[] | null
}): QuantityRow[] {
  const wanted = input.productIds ? new Set(input.productIds) : null
  const rows = new Map<string, QuantityRow>()
  const row = (productId: string, locationId: string) => {
    const key = `${productId}|${locationId}`
    let entry = rows.get(key)
    if (!entry) {
      entry = { productId, locationId, onHand: 0, picked: 0, reserved: 0, available: 0, onOrder: 0, inTransit: 0, anticipated: 0 }
      rows.set(key, entry)
    }
    return entry
  }
  const keep = (productId: string) => !wanted || wanted.has(productId)
  const num = (value: unknown) => Number(value ?? 0) || 0

  for (const balance of input.balances) {
    if (keep(balance.productId)) row(balance.productId, balance.locationId).onHand += num(balance.onHand)
  }
  for (const order of input.salesOrders) {
    for (const line of order.lines ?? []) {
      if (!keep(line.productId) || num(line.stdQty) <= 0) continue
      const entry = row(line.productId, order.locationId)
      entry.reserved += Math.max(0, num(line.stdQty) - num(line.pickedQty))
      entry.picked += Math.max(0, num(line.pickedQty) - num(line.shippedQty))
    }
  }
  for (const order of input.purchaseOrders) {
    for (const line of order.lines ?? []) {
      if (!keep(line.productId) || num(line.stdQty) <= 0) continue
      row(line.productId, order.receiveLocationId).onOrder += Math.max(0, num(line.stdQty) - num(line.receivedQty))
    }
  }
  for (const transfer of input.transfers) {
    for (const line of transfer.lines ?? []) {
      if (!keep(line.productId)) continue
      if (transfer.status === "open") {
        row(line.productId, transfer.fromLocationId).reserved += num(line.qty)
        row(line.productId, transfer.toLocationId).onOrder += num(line.qty)
      } else if (transfer.status === "in_transit") {
        const entry = row(line.productId, transfer.toLocationId)
        entry.inTransit += num(line.qty)
        entry.onOrder += num(line.qty)
      }
    }
  }
  const result: QuantityRow[] = []
  for (const entry of rows.values()) {
    entry.available = entry.onHand - entry.reserved
    entry.anticipated = entry.onHand - entry.reserved + entry.onOrder
    result.push(entry)
  }
  return result
}
