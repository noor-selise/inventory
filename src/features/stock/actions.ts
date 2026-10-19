import { resolveBin } from "@/features/locations/api"
import { toStandardQty } from "@/features/products/api"
import { withNextNumber } from "@/features/settings/numbering"
import {
  newLineId,
  posting,
  resolveLot,
  stockAdjustments,
  stockCounts,
  stockTransfers,
  type AdjustmentLine,
  type CountLine,
  type CountSheet,
  type StockAdjustment,
  type StockCount,
  type StockTransfer,
  type TransferLine,
} from "./api"
import type { LineDraft } from "./LineEditor"
import type { StockLookups } from "./lookups"
import type { PostingLine } from "./posting.ts"

// Stock document actions (spec 0008). Every status change is a compare and set
// on the old status (spec 0026), so two people pressing "Send" or "Complete" at
// the same time can never post twice. Stock moves only through posting.

async function claim<T extends { ItemId: string }>(
  source: { updateWhere(filter: Record<string, unknown>, payload: Record<string, unknown>): Promise<number> },
  record: T,
  from: string | string[],
  to: string
) {
  const changed = await source.updateWhere(
    { ItemId: record.ItemId, status: Array.isArray(from) ? { $in: from } : from },
    { status: to }
  )
  if (changed !== 1) throw new Error("Someone else changed this document. Reload it and try again.")
}

/** Turns editor lines into resolved ids: bins and lots are created when new. */
async function resolveLines(drafts: LineDraft[], lookups: StockLookups, locationId: string, toLocationId?: string) {
  const resolved = []
  for (const draft of drafts) {
    const product = lookups.product(draft.productId)
    if (!product) throw new Error("A line has no product.")
    const qty = toStandardQty(product, Number(draft.qty), draft.uom)
    const sublocationId = await resolveBin(locationId, draft.binCode)
    const toSublocationId = toLocationId ? await resolveBin(toLocationId, draft.toBinCode) : null
    let lotId: string | null = null
    if (product.trackLots && draft.lotNumber.trim()) {
      lotId = await resolveLot(product.ItemId, draft.lotNumber, {
        expiresOn: draft.lotExpiresOn ? new Date(`${draft.lotExpiresOn}T00:00:00Z`).toISOString() : null,
        shelfLifeDays: product.shelfLifeDays,
      })
    }
    resolved.push({
      draft,
      product,
      lineId: newLineId(),
      qty,
      sublocationId,
      toSublocationId,
      lotId,
      serial: product.trackSerials ? draft.serial.trim() : null,
    })
  }
  return resolved
}

function toPostingLines(doc: StockAdjustment, costOf: (productId: string) => number | null): PostingLine[] {
  return doc.lines.map((line) => ({
    lineId: line.lineId,
    productId: line.productId,
    locationId: doc.locationId,
    sublocationId: line.sublocationId,
    lotId: line.lotId,
    serial: line.serial,
    qtyDelta: line.qtyDelta,
    enteredQty: line.enteredQty,
    enteredUom: line.uom,
    // Adjustments value stock at the current average cost (spec 0008, PRD §5.4).
    unitCost: costOf(line.productId),
  }))
}

async function postAdjustment(doc: StockAdjustment, lookups: Pick<StockLookups, "product">, allowNegative: boolean) {
  try {
    await posting.postDocument(
      toPostingLines(doc, (id) => lookups.product(id)?.averageCost ?? null),
      { sourceType: "adjustment", sourceId: doc.ItemId, sourceNumber: doc.number, effectiveAt: doc.adjustedAt },
      { allowNegative }
    )
    await stockAdjustments.updateWhere({ ItemId: doc.ItemId, status: "posting" }, { status: "posted" })
  } catch (error) {
    await stockAdjustments.updateWhere({ ItemId: doc.ItemId, status: "posting" }, { status: "failed" })
    throw error
  }
}

export async function createAdjustment(input: {
  locationId: string
  reasonId: string
  adjustedAt: string
  remarks: string
  lines: LineDraft[]
  lookups: StockLookups
  allowNegative: boolean
}): Promise<StockAdjustment> {
  const resolved = await resolveLines(input.lines, input.lookups, input.locationId)
  const lines: AdjustmentLine[] = resolved.map((line) => {
    const sign = line.draft.direction === "out" ? -1 : 1
    return {
      lineId: line.lineId,
      productId: line.product.ItemId,
      sublocationId: line.sublocationId,
      lotId: line.lotId,
      serial: line.serial,
      qtyDelta: sign * line.qty,
      enteredQty: sign * Number(line.draft.qty),
      uom: line.draft.uom || line.product.standardUom,
    }
  })
  const base = {
    locationId: input.locationId,
    reasonId: input.reasonId,
    adjustedAt: input.adjustedAt,
    status: "posting" as const,
    remarks: input.remarks.trim() || null,
    lines,
  }
  const { number, result: itemId } = await withNextNumber("stock_adjustment", (value) => stockAdjustments.create({ ...base, number: value }))
  const doc: StockAdjustment = { ItemId: itemId, number, ...base }
  await postAdjustment(doc, input.lookups, input.allowNegative)
  return { ...doc, status: "posted" }
}

/** Posts an adjustment again after a failure. Lines already posted are skipped by their posting key. */
export async function retryAdjustment(doc: StockAdjustment, lookups: StockLookups, allowNegative: boolean) {
  await claim(stockAdjustments, doc, "failed", "posting")
  await postAdjustment({ ...doc, status: "posting" }, lookups, allowNegative)
}

export async function cancelAdjustment(doc: StockAdjustment) {
  await claim(stockAdjustments, doc, ["posted", "cancelling"], "cancelling")
  await posting.reverseSource("adjustment", doc.ItemId, "adjustment_reversal")
  await stockAdjustments.updateWhere({ ItemId: doc.ItemId, status: "cancelling" }, { status: "cancelled" })
}

export async function createTransfer(input: {
  fromLocationId: string
  toLocationId: string
  remarks: string
  lines: LineDraft[]
  lookups: StockLookups
}): Promise<StockTransfer> {
  const resolved = await resolveLines(input.lines, input.lookups, input.fromLocationId, input.toLocationId)
  const lines: TransferLine[] = resolved.map((line) => ({
    lineId: line.lineId,
    productId: line.product.ItemId,
    fromSublocationId: line.sublocationId,
    toSublocationId: line.toSublocationId,
    lotId: line.lotId,
    serial: line.serial,
    qty: line.qty,
    enteredQty: Number(line.draft.qty),
    uom: line.draft.uom || line.product.standardUom,
  }))
  const base = {
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    status: "open" as const,
    remarks: input.remarks.trim() || null,
    lines,
  }
  const { number, result: itemId } = await withNextNumber("stock_transfer", (value) => stockTransfers.create({ ...base, number: value }))
  return { ItemId: itemId, number, ...base }
}

/** Open → in transit: stock leaves the source location (spec 0008 AC-2). */
export async function sendTransfer(doc: StockTransfer, lookups: Pick<StockLookups, "product">) {
  await claim(stockTransfers, doc, "open", "sending")
  try {
    await posting.postDocument(
      doc.lines.map((line) => ({
        lineId: line.lineId,
        productId: line.productId,
        locationId: doc.fromLocationId,
        sublocationId: line.fromSublocationId,
        lotId: line.lotId,
        serial: line.serial,
        qtyDelta: -line.qty,
        enteredQty: line.enteredQty == null ? null : -line.enteredQty,
        enteredUom: line.uom,
        unitCost: lookups.product(line.productId)?.averageCost ?? null,
      })),
      { sourceType: "transfer_send", sourceId: doc.ItemId, sourceNumber: doc.number }
    )
  } catch (error) {
    await stockTransfers.updateWhere({ ItemId: doc.ItemId, status: "sending" }, { status: "open" })
    throw error
  }
  await stockTransfers.updateWhere({ ItemId: doc.ItemId, status: "sending" }, { status: "in_transit", sentAt: new Date().toISOString() })
}

/** In transit → completed: stock arrives at the destination. */
export async function receiveTransfer(doc: StockTransfer, lookups: Pick<StockLookups, "product">) {
  await claim(stockTransfers, doc, "in_transit", "receiving")
  try {
    await posting.postDocument(
      doc.lines.map((line) => ({
        lineId: line.lineId,
        productId: line.productId,
        locationId: doc.toLocationId,
        sublocationId: line.toSublocationId,
        lotId: line.lotId,
        serial: line.serial,
        qtyDelta: line.qty,
        enteredQty: line.enteredQty,
        enteredUom: line.uom,
        unitCost: lookups.product(line.productId)?.averageCost ?? null,
      })),
      { sourceType: "transfer_receive", sourceId: doc.ItemId, sourceNumber: doc.number }
    )
  } catch (error) {
    await stockTransfers.updateWhere({ ItemId: doc.ItemId, status: "receiving" }, { status: "in_transit" })
    throw error
  }
  await stockTransfers.updateWhere({ ItemId: doc.ItemId, status: "receiving" }, { status: "completed", receivedAt: new Date().toISOString() })
}

/** Open: just cancelled. In transit: the sent stock goes back to the source. */
export async function cancelTransfer(doc: StockTransfer) {
  if (doc.status === "open") {
    await claim(stockTransfers, doc, "open", "cancelled")
    return
  }
  await claim(stockTransfers, doc, ["in_transit", "cancelling"], "cancelling")
  await posting.reverseSource("transfer_send", doc.ItemId, "transfer_reversal")
  await stockTransfers.updateWhere({ ItemId: doc.ItemId, status: "cancelling" }, { status: "cancelled" })
}

/**
 * A count for one location, split into sheets. Each sheet lists the products
 * chosen for it, one line per bin, lot and serial that has stock now, plus one
 * empty line for products with no stock there yet.
 */
export async function createCount(input: {
  locationId: string
  remarks: string
  sheets: { name: string; assigneeId: string | null; productIds: string[] }[]
}): Promise<StockCount> {
  const { items: balances } = await posting.balances({ locationId: input.locationId }, { pageSize: 2000 })
  const sheets: CountSheet[] = input.sheets.map((sheet) => ({
    sheetId: crypto.randomUUID(),
    name: sheet.name,
    assigneeId: sheet.assigneeId,
    status: "open",
    lines: sheet.productIds.flatMap((productId): CountLine[] => {
      const rows = balances.filter((balance) => balance.productId === productId && balance.onHand !== 0)
      if (!rows.length) return [{ lineId: newLineId(), productId, sublocationId: null, lotId: null, serial: null, expectedQty: null, countedQty: null }]
      return rows.map((balance) => ({
        lineId: newLineId(),
        productId,
        sublocationId: balance.sublocationId,
        lotId: balance.lotId,
        serial: balance.serial,
        expectedQty: null,
        countedQty: null,
      }))
    }),
  }))
  const base = { locationId: input.locationId, status: "open" as const, remarks: input.remarks.trim() || null, revision: 0, sheets }
  const { number, result: itemId } = await withNextNumber("stock_count", (value) => stockCounts.create({ ...base, number: value }))
  return { ItemId: itemId, number, ...base }
}

/**
 * Saves the whole count, guarded by its revision number (compare and set,
 * spec 0026), so two people editing different sheets never overwrite each
 * other silently.
 */
async function saveCount(count: StockCount, patch: Partial<StockCount>) {
  const revision = count.revision ?? null
  const changed = await stockCounts.updateWhere({ ItemId: count.ItemId, revision }, { ...patch, revision: (revision ?? 0) + 1 })
  if (changed !== 1) throw new Error("Someone else saved this count a moment ago. Reload it and enter your numbers again.")
}

/** Starting a sheet captures the expected quantity of each line (spec 0008 AC-4). */
export async function startSheet(count: StockCount, sheetId: string) {
  const { items: balances } = await posting.balances({ locationId: count.locationId }, { pageSize: 2000 })
  const expected = (line: CountLine) =>
    balances
      .filter(
        (balance) =>
          balance.productId === line.productId &&
          (balance.sublocationId ?? null) === (line.sublocationId ?? null) &&
          (balance.lotId ?? null) === (line.lotId ?? null) &&
          (balance.serial ?? null) === (line.serial ?? null)
      )
      .reduce((sum, balance) => sum + balance.onHand, 0)
  const sheets = count.sheets.map((sheet) =>
    sheet.sheetId === sheetId && sheet.status === "open"
      ? { ...sheet, status: "counting" as const, lines: sheet.lines.map((line) => ({ ...line, expectedQty: expected(line) })) }
      : sheet
  )
  await saveCount(count, {
    sheets,
    status: count.status === "open" ? "in_progress" : count.status,
    startedAt: count.startedAt ?? new Date().toISOString(),
  })
}

export async function saveSheetCounts(count: StockCount, sheetId: string, counted: Record<string, number | null>, submit: boolean) {
  const sheets = count.sheets.map((sheet) =>
    sheet.sheetId === sheetId
      ? {
          ...sheet,
          status: submit ? ("submitted" as const) : sheet.status,
          lines: sheet.lines.map((line) => (line.lineId in counted ? { ...line, countedQty: counted[line.lineId] } : line)),
        }
      : sheet
  )
  const allSubmitted = sheets.every((sheet) => sheet.status === "submitted")
  await saveCount(count, { sheets, status: allSubmitted ? "in_review" : count.status })
}

export function countVariances(count: StockCount) {
  return count.sheets.flatMap((sheet) =>
    sheet.lines
      .filter((line) => line.countedQty != null && line.expectedQty != null && line.countedQty !== line.expectedQty)
      .map((line) => ({ line, variance: Number(line.countedQty) - Number(line.expectedQty) }))
  )
}

/** Completing posts one adjustment with a line per variance (spec 0008 AC-6), exactly once. */
export async function completeCount(count: StockCount, reasonId: string, lookups: StockLookups) {
  await claim(stockCounts, count, ["in_review", "completing"], "completing")
  const remarks = `Count ${count.number}`
  const existing = (await stockAdjustments.list({ filter: { remarks, locationId: count.locationId }, pageSize: 1 })).items[0]
  let adjustmentId = existing?.ItemId ?? null
  const variances = countVariances(count)
  if (!existing && variances.length) {
    const lines: AdjustmentLine[] = variances.map(({ line, variance }) => ({
      lineId: line.lineId,
      productId: line.productId,
      sublocationId: line.sublocationId,
      lotId: line.lotId,
      serial: line.serial,
      qtyDelta: variance,
      enteredQty: variance,
      uom: lookups.product(line.productId)?.standardUom ?? null,
    }))
    const base = { locationId: count.locationId, reasonId, adjustedAt: new Date().toISOString(), status: "posting" as const, remarks, lines }
    const { number, result: itemId } = await withNextNumber("stock_adjustment", (value) => stockAdjustments.create({ ...base, number: value }))
    adjustmentId = itemId
    // The count is the truth: variances post even if stock moved during the count.
    await postAdjustment({ ItemId: itemId, number, ...base }, lookups, true)
  } else if (existing && existing.status !== "posted") {
    await retryAdjustment(existing, lookups, true)
  }
  await stockCounts.updateWhere(
    { ItemId: count.ItemId, status: "completing" },
    { status: "completed", completedAt: new Date().toISOString(), adjustmentId }
  )
}

export async function cancelCount(count: StockCount) {
  await claim(stockCounts, count, ["open", "in_progress", "in_review"], "cancelled")
}
