import { CostNotAppliedError, createAdjustment, owesCost } from "@/features/stock/actions"
import { posting, stockAdjustments, type StockAdjustment } from "@/features/stock/api"
import { emptyLine, type LineDraft } from "@/features/stock/LineEditor"
import type { StockLookups } from "@/features/stock/lookups"
import { MISSING_OPENING_REASON, isOpeningStock, openingStockReason } from "@/features/stock/reasons"
import type { Product } from "./api"

// Stock from the product dialog (spec 0029). Nothing here writes stock itself:
// every change becomes an ordinary adjustment through createAdjustment, so it
// posts, retries, cancels and shows in the history like any other.

/** True once the product has any posted movement. Drives the unit lock and the Stock tab. */
export async function hasStockHistory(productId: string) {
  const { items } = await posting.movements({ productId, status: "posted" }, { pageSize: 1 })
  return items.length > 0
}

export type OpeningRow = {
  key: string
  locationId: string
  binCode: string
  qty: string
  uom: string
  /** Cost per chosen unit. */
  unitCost: string
  lotNumber: string
  lotExpiresOn: string
  /** Serial tracked products: one serial per line; the quantity is their count. */
  serials: string
}

export function emptyOpeningRow(locationId: string, uom: string): OpeningRow {
  return { key: crypto.randomUUID(), locationId, binCode: "", qty: "", uom, unitCost: "", lotNumber: "", lotExpiresOn: "", serials: "" }
}

export function serialList(row: Pick<OpeningRow, "serials">) {
  return row.serials
    .split(/[\n,]+/)
    .map((serial) => serial.trim())
    .filter(Boolean)
}

type TrackingFlags = Pick<Product, "trackLots" | "trackSerials">

/** Problems per row key, or an empty object when every row can post. */
export function openingRowProblems(rows: OpeningRow[], product: TrackingFlags): Record<string, string> {
  const problems: Record<string, string> = {}
  const seen = new Set<string>()
  const serialsSeen = new Set<string>()
  for (const row of rows) {
    const serials = serialList(row)
    let problem: string | undefined
    if (!row.locationId) problem = "Choose a location."
    else if (product.trackSerials && !serials.length) problem = "Enter at least one serial number."
    else if (!product.trackSerials && !(Number(row.qty) > 0)) problem = "Enter a quantity above 0."
    else if (product.trackLots && !row.lotNumber.trim()) problem = "Enter a lot number."
    else if (!(row.unitCost.trim() !== "" && Number(row.unitCost) >= 0)) problem = "Enter a unit cost of 0 or more."
    const place = `${row.locationId}|${row.binCode.trim().toUpperCase()}|${row.lotNumber.trim()}`
    if (!problem && !product.trackSerials && seen.has(place)) problem = "This location, bin and lot is already on another row."
    if (!problem) {
      const repeated = serials.find((serial) => serialsSeen.has(serial) || serials.indexOf(serial) !== serials.lastIndexOf(serial))
      if (repeated) problem = `Serial ${repeated} is entered twice.`
    }
    seen.add(place)
    serials.forEach((serial) => serialsSeen.add(serial))
    if (problem) problems[row.key] = problem
  }
  return problems
}

function toLineDrafts(product: Product, rows: OpeningRow[]): LineDraft[] {
  return rows.flatMap((row) => {
    const base = {
      ...emptyLine(),
      productId: product.ItemId,
      direction: "in" as const,
      binCode: row.binCode,
      lotNumber: row.lotNumber,
      lotExpiresOn: row.lotExpiresOn,
      unitCost: row.unitCost,
    }
    if (product.trackSerials) {
      // A serial line moves exactly 1, in the standard unit; the cost is per standard unit too.
      return serialList(row).map((serial) => ({ ...base, key: crypto.randomUUID(), qty: "1", uom: product.standardUom, serial }))
    }
    return [{ ...base, qty: row.qty, uom: row.uom || product.standardUom }]
  })
}

export type OpeningResult = {
  locationId: string
  status: "posted" | "failed" | "refused"
  rows: OpeningRow[]
  adjustment?: StockAdjustment
  error?: string
  /** Posted, but the moving average cost step is still owed. */
  costPending?: boolean
}

/**
 * Posts opening stock as one "Opening stock" adjustment per location. Refused
 * when the product already has stock history, checked once before the first
 * location so the later locations of the same save are not refused.
 */
export async function postOpening(product: Product, rows: OpeningRow[], lookups: StockLookups): Promise<OpeningResult[]> {
  const reason = openingStockReason(lookups.reasons)
  if (!reason) throw new Error(MISSING_OPENING_REASON)
  const groups = new Map<string, OpeningRow[]>()
  for (const row of rows) groups.set(row.locationId, [...(groups.get(row.locationId) ?? []), row])
  if (await hasStockHistory(product.ItemId)) {
    return [...groups].map(([locationId, group]) => ({
      locationId,
      rows: group,
      status: "refused",
      error: "Stock was added to this product meanwhile. Use Adjust stock.",
    }))
  }
  const results: OpeningResult[] = []
  for (const [locationId, group] of groups) {
    try {
      const adjustment = await createAdjustment({
        locationId,
        reasonId: reason.ItemId,
        adjustedAt: new Date().toISOString(),
        remarks: "Opening stock from product",
        lines: toLineDrafts(product, group),
        lookups: { ...lookups, product: (id) => (id === product.ItemId ? product : lookups.product(id)) },
        allowNegative: false,
      })
      results.push({ locationId, rows: group, status: "posted", adjustment })
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught)
      if (caught instanceof CostNotAppliedError) {
        results.push({ locationId, rows: group, status: "posted", costPending: true, error })
      } else {
        results.push({ locationId, rows: group, status: "failed", error })
      }
    }
  }
  return results
}

/** This product's opening stock adjustments that failed to post or still owe their cost step. */
export async function openingIssues(productId: string, lookups: Pick<StockLookups, "reasons">) {
  const { items } = await stockAdjustments.list({
    filter: { status: { $in: ["failed", "posted"] }, "lines.productId": productId },
    sort: { adjustedAt: -1 },
    pageSize: 50,
  })
  return items.filter((doc) => isOpeningStock(doc.reasonId, lookups.reasons) && (doc.status === "failed" || owesCost(doc)))
}

/** The product's posted on hand at one place (location, bin, lot, serial). Reads fresh, never cached. */
export async function onHandAt(product: Product, place: { locationId: string; sublocationId: string | null; lotId: string | null; serial: string | null }) {
  const { items } = await posting.balances({ productId: product.ItemId, locationId: place.locationId }, { pageSize: 500 })
  return items
    .filter(
      (balance) =>
        (balance.sublocationId || null) === place.sublocationId &&
        (balance.lotId || null) === place.lotId &&
        (balance.serial?.trim() || null) === place.serial
    )
    .reduce((sum, balance) => sum + Number(balance.onHand ?? 0), 0)
}

export type PlaceInput = { locationId: string; binCode: string; lotNumber: string; serial: string }

/**
 * Posted on hand at a place typed as codes (bin code, lot number). A bin or lot
 * that does not exist yet holds nothing.
 */
export async function currentOnHand(product: Product, place: PlaceInput, lookups: Pick<StockLookups, "bins" | "lots">) {
  const binCode = place.binCode.trim().toUpperCase()
  const lotNumber = place.lotNumber.trim()
  const sublocationId = binCode ? lookups.bins.find((bin) => bin.locationId === place.locationId && bin.code.toUpperCase() === binCode)?.ItemId : null
  const lotId = lotNumber ? lookups.lots.find((lot) => lot.productId === product.ItemId && lot.lotNumber === lotNumber)?.ItemId : null
  if (sublocationId === undefined || lotId === undefined) return 0
  return onHandAt(product, { locationId: place.locationId, sublocationId, lotId, serial: place.serial.trim() || null })
}

/**
 * Sets stock at one place to a new total: reads on hand fresh, then posts the
 * difference as one adjustment line in the standard unit.
 */
export async function adjustTo(
  input: PlaceInput & { product: Product; newTotal: number; reasonId: string; adjustedAt: string; remarks: string },
  lookups: StockLookups,
  allowNegative: boolean
) {
  const { product } = input
  const delta = input.newTotal - (await currentOnHand(product, input, lookups))
  if (delta === 0) throw new Error("Nothing to change: stock is already at that total.")
  const line: LineDraft = {
    ...emptyLine(),
    productId: product.ItemId,
    direction: delta > 0 ? "in" : "out",
    qty: String(Math.abs(delta)),
    uom: product.standardUom,
    binCode: input.binCode.trim().toUpperCase(),
    lotNumber: input.lotNumber.trim(),
    serial: input.serial.trim(),
  }
  const doc = await createAdjustment({
    locationId: input.locationId,
    reasonId: input.reasonId,
    adjustedAt: input.adjustedAt,
    remarks: input.remarks,
    lines: [line],
    lookups,
    allowNegative,
  })
  return { doc, delta }
}
