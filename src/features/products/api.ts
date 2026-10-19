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
  /** Written only by stock posting (spec 0007, 0026). */
  averageCost?: number | null
  /** The vendor of the latest purchase receipt (spec 0012 AC-7). */
  lastVendorId?: string | null
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
export const products = collection<Product>("Product", [...PRODUCT_FIELDS, "averageCost", "lastVendorId"])
export const productBarcodes = collection<ProductBarcode>("ProductBarcode", ["barcode", "productId"])

export type VendorItem = Entity & {
  vendorId: string
  productId: string
  vendorItemCode?: string | null
  unitCost?: number | null
  currencyCode?: string | null
  leadTimeDays?: number | null
  preference?: number | null
}

export const vendorItems = collection<VendorItem>("VendorItem", [
  "vendorId",
  "productId",
  "vendorItemCode",
  "unitCost",
  "currencyCode",
  "leadTimeDays",
  "preference",
])

/** Converts an entered quantity in one of the product's units to its standard unit. */
export function toStandardQty(product: Pick<Product, "standardUom" | "purchaseUom" | "purchaseUomRatio" | "salesUom" | "salesUomRatio">, qty: number, uom: string) {
  if (uom && uom === product.purchaseUom && product.purchaseUomRatio) return qty * product.purchaseUomRatio
  if (uom && uom === product.salesUom && product.salesUomRatio) return qty * product.salesUomRatio
  return qty
}

export function unitOptions(product: Pick<Product, "standardUom" | "purchaseUom" | "purchaseUomRatio" | "salesUom" | "salesUomRatio">) {
  const options = [{ value: product.standardUom, label: product.standardUom }]
  if (product.purchaseUom && product.purchaseUomRatio) {
    options.push({ value: product.purchaseUom, label: `${product.purchaseUom} (${product.purchaseUomRatio} ${product.standardUom})` })
  }
  if (product.salesUom && product.salesUomRatio && product.salesUom !== product.purchaseUom) {
    options.push({ value: product.salesUom, label: `${product.salesUom} (${product.salesUomRatio} ${product.standardUom})` })
  }
  return options
}

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
