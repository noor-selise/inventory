import { BlocksDataError, collection, type Entity } from "@/lib/blocks/data"

// Schemas from spec 0006.

export const LOCATION_KINDS = [
  { value: "warehouse", label: "Warehouse" },
  { value: "store", label: "Store" },
  { value: "truck", label: "Truck or van" },
  { value: "site", label: "Site" },
] as const

export type Location = Entity & {
  name: string
  address?: string | null
  kind?: string | null
  isDefault?: boolean | null
  isActive?: boolean | null
}

export type Sublocation = Entity & {
  locationId: string
  code: string
  isActive?: boolean | null
}

export const locations = collection<Location>("Location", ["name", "address", "kind", "isDefault", "isActive"])
export const sublocations = collection<Sublocation>("Sublocation", ["locationId", "code", "isActive"])

export function normalizeBinCode(code: string) {
  return code.trim().toUpperCase()
}

/**
 * Finds a bin by code in a location, creating it when it does not exist yet
 * (spec 0006 AC-3). The unique index on (locationId, code) keeps two people
 * typing the same new code from making two bins.
 */
export async function resolveBin(locationId: string, rawCode: string): Promise<string | null> {
  const code = normalizeBinCode(rawCode)
  if (!code) return null
  const find = async () => (await sublocations.list({ filter: { locationId, code }, pageSize: 1 })).items[0]
  const existing = await find()
  if (existing) {
    if (existing.isActive === false) throw new Error(`Bin ${code} is deactivated. Reactivate it under Locations first.`)
    return existing.ItemId
  }
  try {
    return await sublocations.create({ locationId, code, isActive: true })
  } catch (error) {
    if (error instanceof BlocksDataError && error.isDuplicate) {
      const again = await find()
      if (again) return again.ItemId
    }
    throw error
  }
}
