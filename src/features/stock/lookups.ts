import { locations, sublocations, type Location, type Sublocation } from "@/features/locations/api"
import { products, type Product } from "@/features/products/api"
import { adjustmentReasons, type SimpleLookup } from "@/features/settings/api"
import { useResource } from "@/hooks/use-resource"
import { lots, type Lot } from "./api"

// Reference data the stock screens show names for. Loaded once per screen.

export type StockLookups = {
  locations: Location[]
  bins: Sublocation[]
  products: Product[]
  reasons: SimpleLookup[]
  lots: Lot[]
  locationName: (id?: string | null) => string
  binCode: (id?: string | null) => string
  product: (id?: string | null) => Product | undefined
  lotNumber: (id?: string | null) => string
}

export function useStockLookups() {
  return useResource(async (): Promise<StockLookups> => {
    const [locationRows, binRows, productRows, reasonRows, lotRows] = await Promise.all([
      locations.list({ sort: { name: 1 }, pageSize: 500 }),
      sublocations.list({ sort: { code: 1 }, pageSize: 2000 }),
      products.list({ sort: { name: 1 }, pageSize: 1000 }),
      adjustmentReasons.list({ sort: { name: 1 }, pageSize: 200 }),
      lots.list({ sort: { lotNumber: 1 }, pageSize: 2000 }),
    ])
    return {
      locations: locationRows.items,
      bins: binRows.items,
      products: productRows.items,
      reasons: reasonRows.items,
      lots: lotRows.items,
      locationName: (id) => locationRows.items.find((item) => item.ItemId === id)?.name ?? "",
      binCode: (id) => binRows.items.find((item) => item.ItemId === id)?.code ?? "",
      product: (id) => productRows.items.find((item) => item.ItemId === id),
      lotNumber: (id) => lotRows.items.find((item) => item.ItemId === id)?.lotNumber ?? "",
    }
  }, [])
}

export const SOURCE_LABELS: Record<string, string> = {
  adjustment: "Adjustment",
  adjustment_reversal: "Adjustment cancelled",
  transfer_send: "Transfer sent",
  transfer_receive: "Transfer received",
  transfer_reversal: "Transfer cancelled",
  purchase_receive: "Purchase received",
  sales_pick: "Sales pick",
  sales_restock: "Sales restock",
  mo_pick: "Manufacture pick",
  mo_put: "Manufacture put away",
  rollback: "Undo of a failed posting",
}
