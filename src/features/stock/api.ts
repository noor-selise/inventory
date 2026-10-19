import { blocksClient } from "@/lib/blocks/client"
import { collection, type Entity } from "@/lib/blocks/data"
import { createPosting } from "./posting.ts"

// Stock documents (spec 0008), lots (spec 0009) and the shared posting step
// (spec 0007, decision in spec 0026).

export const posting = createPosting(blocksClient)

export type AdjustmentLine = {
  lineId: string
  productId: string
  sublocationId?: string | null
  lotId?: string | null
  serial?: string | null
  qtyDelta: number
  enteredQty?: number | null
  uom?: string | null
}

export type StockAdjustment = Entity & {
  number: string
  locationId: string
  reasonId: string
  adjustedAt: string
  status: "posting" | "posted" | "failed" | "cancelling" | "cancelled"
  remarks?: string | null
  lines: AdjustmentLine[]
}

export type TransferLine = {
  lineId: string
  productId: string
  fromSublocationId?: string | null
  toSublocationId?: string | null
  lotId?: string | null
  serial?: string | null
  qty: number
  enteredQty?: number | null
  uom?: string | null
}

export type StockTransfer = Entity & {
  number: string
  fromLocationId: string
  toLocationId: string
  status: "open" | "sending" | "in_transit" | "receiving" | "cancelling" | "completed" | "cancelled"
  sentAt?: string | null
  receivedAt?: string | null
  remarks?: string | null
  lines: TransferLine[]
}

export type CountLine = {
  lineId: string
  productId: string
  sublocationId?: string | null
  lotId?: string | null
  serial?: string | null
  expectedQty?: number | null
  countedQty?: number | null
}

export type CountSheet = {
  sheetId: string
  name: string
  assigneeId?: string | null
  status: "open" | "counting" | "submitted"
  lines: CountLine[]
}

export type StockCount = Entity & {
  number: string
  locationId: string
  status: "open" | "in_progress" | "in_review" | "completing" | "completed" | "cancelled"
  startedAt?: string | null
  completedAt?: string | null
  adjustmentId?: string | null
  remarks?: string | null
  /** Bumped on every save; the compare and set guard for concurrent edits. */
  revision?: number | null
  sheets: CountSheet[]
}

export type Lot = Entity & {
  productId: string
  lotNumber: string
  madeOn?: string | null
  expiresOn?: string | null
  sellBy?: string | null
}

export const stockAdjustments = collection<StockAdjustment>("StockAdjustment", [
  "number",
  "locationId",
  "reasonId",
  "adjustedAt",
  "status",
  "remarks",
  "lines { lineId productId sublocationId lotId serial qtyDelta enteredQty uom }",
])

export const stockTransfers = collection<StockTransfer>("StockTransfer", [
  "number",
  "fromLocationId",
  "toLocationId",
  "status",
  "sentAt",
  "receivedAt",
  "remarks",
  "lines { lineId productId fromSublocationId toSublocationId lotId serial qty enteredQty uom }",
])

export const stockCounts = collection<StockCount>("StockCount", [
  "number",
  "locationId",
  "status",
  "startedAt",
  "completedAt",
  "adjustmentId",
  "remarks",
  "revision",
  "sheets { sheetId name assigneeId status lines { lineId productId sublocationId lotId serial expectedQty countedQty } }",
])

export const lots = collection<Lot>("Lot", ["productId", "lotNumber", "madeOn", "expiresOn", "sellBy"])

export function newLineId() {
  return crypto.randomUUID()
}

/** Finds a product's lot by number, or creates it (default expiry from shelf life, spec 0009 AC-1). */
export async function resolveLot(
  productId: string,
  lotNumber: string,
  details: { expiresOn?: string | null; madeOn?: string | null; shelfLifeDays?: number | null; receivedOn?: string }
): Promise<string> {
  const number = lotNumber.trim()
  const existing = (await lots.list({ filter: { productId, lotNumber: number }, pageSize: 1 })).items[0]
  if (existing) return existing.ItemId
  let expiresOn = details.expiresOn ?? null
  if (!expiresOn && details.shelfLifeDays) {
    const base = new Date(details.receivedOn ?? new Date().toISOString())
    base.setUTCDate(base.getUTCDate() + details.shelfLifeDays)
    expiresOn = base.toISOString()
  }
  return lots.create({ productId, lotNumber: number, expiresOn, madeOn: details.madeOn ?? null })
}

/**
 * Lots with stock at a location, earliest expiry first, expired lots left out
 * (spec 0009 AC-4).
 */
export async function allocateLots(productId: string, locationId: string, today = new Date()) {
  const { items: balances } = await posting.balances({ productId, locationId, onHand: { $gt: 0 } }, { pageSize: 200 })
  const lotIds = [...new Set(balances.map((balance) => balance.lotId).filter((id): id is string => Boolean(id)))]
  if (!lotIds.length) return []
  const { items: lotRows } = await lots.list({ filter: { ItemId: { $in: lotIds } }, pageSize: 200 })
  return lotRows
    .filter((lot) => !lot.expiresOn || new Date(lot.expiresOn) >= today)
    .map((lot) => ({
      lot,
      onHand: balances.filter((balance) => balance.lotId === lot.ItemId).reduce((sum, balance) => sum + balance.onHand, 0),
    }))
    .sort((a, b) => (a.lot.expiresOn ?? "9999").localeCompare(b.lot.expiresOn ?? "9999"))
}

export type QuantitySummary = {
  locationId: string
  onHand: number
  picked: number
  reserved: number
  available: number
  onOrder: number
  inTransit: number
}

/**
 * The PRD §5.3 quantities for one product, per location. Reserved and on order
 * come from sales and purchase orders (specs 0011, 0012), not built yet, so
 * they are 0 for now. In transit is stock sent on open transfers.
 */
export async function quantitiesFor(productId: string): Promise<QuantitySummary[]> {
  const [{ items: balances }, { items: transfers }] = await Promise.all([
    posting.balances({ productId }, { pageSize: 500 }),
    stockTransfers.list({ filter: { status: "in_transit" }, pageSize: 200 }),
  ])
  const byLocation = new Map<string, QuantitySummary>()
  const row = (locationId: string) => {
    let summary = byLocation.get(locationId)
    if (!summary) {
      summary = { locationId, onHand: 0, picked: 0, reserved: 0, available: 0, onOrder: 0, inTransit: 0 }
      byLocation.set(locationId, summary)
    }
    return summary
  }
  for (const balance of balances) {
    const summary = row(balance.locationId)
    summary.onHand += Number(balance.onHand ?? 0)
    summary.picked += Number(balance.picked ?? 0)
  }
  for (const transfer of transfers) {
    for (const line of transfer.lines ?? []) {
      if (line.productId === productId) row(transfer.toLocationId).inTransit += Number(line.qty ?? 0)
    }
  }
  for (const summary of byLocation.values()) {
    summary.available = summary.onHand - summary.picked - summary.reserved
  }
  return [...byLocation.values()]
}

let lastRepair = 0

/** Runs the pending movement repair at most once a minute per browser tab. */
export async function repairIfDue() {
  if (Date.now() - lastRepair < 60_000) return
  lastRepair = Date.now()
  try {
    await posting.repairPending()
  } catch {
    // Repair is best effort; the next screen load tries again.
  }
}
