import type { SimpleLookup } from "@/features/settings/api"

// The one place that knows which adjustment reason means opening stock
// (spec 0029). Starter settings seed it as a system reason, so it cannot be
// renamed or deactivated from the lists page.

export const OPENING_STOCK_REASON = "Opening stock"

export const MISSING_OPENING_REASON = "Run starter settings first: the Opening stock reason is missing."

export function openingStockReason(reasons: SimpleLookup[]): SimpleLookup | undefined {
  return reasons.find(
    (reason) => reason.isSystem === true && reason.isActive !== false && reason.name.trim().toLowerCase() === OPENING_STOCK_REASON.toLowerCase()
  )
}

export function isOpeningStock(reasonId: string | null | undefined, reasons: SimpleLookup[]) {
  return Boolean(reasonId) && openingStockReason(reasons)?.ItemId === reasonId
}
