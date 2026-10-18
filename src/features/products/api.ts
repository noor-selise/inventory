import { collection, type Entity } from "@/lib/blocks/data"

// Schemas from spec 0005. Field names match blocks/data/schemas/*.json.

export const ITEM_TYPES = [
  { value: "stocked", label: "Stocked product" },
  { value: "non_stocked", label: "Non stocked product" },
  { value: "service", label: "Service" },
] as const

export type ItemType = (typeof ITEM_TYPES)[number]["value"]

export type Category = Entity & {
  name: string
  parentId?: string | null
  isDefault?: boolean | null
}

export type Product = Entity & {
  name: string
  sku: string
  itemType: ItemType
  standardUom: string
  purchaseUom?: string | null
  purchaseUomRatio?: number | null
  salesUom?: string | null
  salesUomRatio?: number | null
  categoryId?: string | null
  description?: string | null
  length?: number | null
  width?: number | null
  height?: number | null
  weight?: number | null
  remarks?: string | null
  trackLots?: boolean | null
  trackSerials?: boolean | null
  trackExpiry?: boolean | null
  shelfLifeDays?: number | null
  sellBeforeExpiryDays?: number | null
  expiryNoticeDays?: number | null
  isActive?: boolean | null
}

export type ProductBarcode = Entity & {
  barcode: string
  productId: string
}

export const PRODUCT_FIELDS = [
  "name",
  "sku",
  "itemType",
  "standardUom",
  "purchaseUom",
  "purchaseUomRatio",
  "salesUom",
  "salesUomRatio",
  "categoryId",
  "description",
  "length",
  "width",
  "height",
  "weight",
  "remarks",
  "trackLots",
  "trackSerials",
  "trackExpiry",
  "shelfLifeDays",
  "sellBeforeExpiryDays",
  "expiryNoticeDays",
  "isActive",
] as const satisfies readonly (keyof Product)[]

export const categories = collection<Category>("Category", ["name", "parentId", "isDefault"])
export const products = collection<Product>("Product", PRODUCT_FIELDS)
export const productBarcodes = collection<ProductBarcode>("ProductBarcode", ["barcode", "productId"])

/** "Parent / Child" labels for every category, in tree order. */
export function categoryPaths(items: Category[]): { value: string; label: string }[] {
  const byId = new Map(items.map((item) => [item.ItemId, item]))
  const label = (item: Category, seen = new Set<string>()): string => {
    const parent = item.parentId ? byId.get(item.parentId) : undefined
    if (!parent || seen.has(parent.ItemId)) return item.name
    seen.add(item.ItemId)
    return `${label(parent, seen)} / ${item.name}`
  }
  return items
    .map((item) => ({ value: item.ItemId, label: label(item) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** True when making `parentId` the parent of `id` would create a loop. */
export function createsCycle(items: Category[], id: string | undefined, parentId: string): boolean {
  if (!id) return false
  const byId = new Map(items.map((item) => [item.ItemId, item]))
  let current: string | null | undefined = parentId
  const seen = new Set<string>()
  while (current) {
    if (current === id) return true
    if (seen.has(current)) return true
    seen.add(current)
    current = byId.get(current)?.parentId
  }
  return false
}
