import { collection, type Entity, type ListResult } from "@/lib/blocks/data"
import type { CalcAsset, CalcEntry } from "./calc"

// Schemas from spec 0028. Field names match blocks/data/schemas/*.json.

export type DepreciationClass = Entity & {
  code: string
  name: string
  method: "wdv"
  ratePercent: number
  presetId?: string | null
  isActive?: boolean | null
}

export type FixedAsset = Entity &
  CalcAsset & {
    assetNumber: string
    /** receipt:<stepId>:<row>:<unit> or manual:<uuid>; unique, never null. */
    unitKey: string
    productId: string
    locationId?: string | null
    purchaseOrderId?: string | null
    source: "receipt" | "manual"
    serialNumber?: string | null
    status: "active" | "disposed"
    disposalType?: "sold" | "scrapped" | null
  }

export type DepreciationEntry = Entity & CalcEntry & { incomeYear: string; runId?: string | null }

export type DepreciationRun = Entity & {
  action: "close" | "reopen"
  period: string
  runId: string
  by: string
  at: string
  assetCount?: number | null
  total?: number | null
}

export const depreciationClasses = collection<DepreciationClass>("DepreciationClass", ["code", "name", "method", "ratePercent", "presetId", "isActive"])

export const fixedAssets = collection<FixedAsset>("FixedAsset", [
  "assetNumber",
  "unitKey",
  "productId",
  "classId",
  "locationId",
  "purchaseOrderId",
  "source",
  "serialNumber",
  "inServiceDate",
  "cost",
  "openingWdv",
  "status",
  "disposalType",
  "disposalDate",
  "disposalAmount",
])

export const depreciationEntries = collection<DepreciationEntry>("DepreciationEntry", [
  "assetId",
  "period",
  "incomeYear",
  "classId",
  "ratePercent",
  "base",
  "amount",
  "closingWdv",
  "runId",
])

export const depreciationRuns = collection<DepreciationRun>("DepreciationRun", ["action", "period", "runId", "by", "at", "assetCount", "total"])

const PAGE = 1000

/** Reads every page (1000 rows each, at most 50 pages), like the reports do. */
export async function allPages<T>(fetch: (pageNo: number, pageSize: number) => Promise<ListResult<T>>): Promise<T[]> {
  const rows: T[] = []
  for (let page = 1; page <= 50; page++) {
    const { items, totalCount } = await fetch(page, PAGE)
    rows.push(...items)
    if (rows.length >= totalCount || items.length < PAGE) break
  }
  return rows
}

/** Every class, active or not (inactive classes keep depreciating their assets). */
export const listClasses = () => depreciationClasses.list({ sort: { code: 1 }, pageSize: 500 }).then((result) => result.items)

/** Entries with `from <= period <= to`, optionally for some assets only. */
export function listEntries(range: { from?: string; to: string; assetIds?: string[] }) {
  const period: Record<string, string> = { $lte: range.to }
  if (range.from) period.$gte = range.from
  return allPages((pageNo, pageSize) =>
    depreciationEntries.list({
      filter: { period, ...(range.assetIds ? { assetId: { $in: range.assetIds } } : {}) },
      sort: { period: 1 },
      pageNo,
      pageSize,
    })
  )
}
