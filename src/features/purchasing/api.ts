import { collection } from "@/lib/blocks/data"
import type { Address, Contact } from "@/features/partners/api"
import { ORDER_BASE_FIELDS, type DiscountType, type OrderBase } from "@/features/sales/api"

// Purchase quotes and orders (spec 0012). Same shape as sales orders: one
// document holds the lines, receipts (stock steps) and history.

export type PurchaseLine = {
  lineId: string
  productId: string
  vendorItemCode?: string | null
  description?: string | null
  /** Entered quantity in `uom`. Negative means a return to the vendor. */
  qty: number
  uom?: string | null
  /** The same quantity in the product's standard unit (signed). */
  stdQty: number
  /** Vendor price per entered unit, before the line discount. */
  unitPrice: number
  discountType?: DiscountType | null
  discount?: number | null
  taxCodeId?: string | null
  /** Received so far in standard units; negative on return lines (unstocked). */
  receivedQty?: number | null
}

export type ExtraCost = { name: string; type: "pct" | "fixed"; amount: number }

export type PurchaseOrder = OrderBase & {
  vendorId: string
  contact?: Contact | null
  vendorAddress?: Address | null
  shipToName?: string | null
  shipToAddress?: Address | null
  dropshipSalesOrderId?: string | null
  receiveLocationId: string
  carrierId?: string | null
  vendorOrderNumber?: string | null
  nonVendorCosts?: ExtraCost[] | null
  allocationMethod?: "value" | "weight" | "volume" | null
  approvedBy?: string | null
  approvedAt?: string | null
  lines: PurchaseLine[]
}

const ADDRESS = "{ line1 line2 city region postalCode country }"

export const purchaseOrders = collection<PurchaseOrder>("PurchaseOrder", [
  ...ORDER_BASE_FIELDS,
  "vendorId",
  "contact { name email phone role }",
  `vendorAddress ${ADDRESS}`,
  "shipToName",
  `shipToAddress ${ADDRESS}`,
  "dropshipSalesOrderId",
  "receiveLocationId",
  "carrierId",
  "vendorOrderNumber",
  "nonVendorCosts { name type amount }",
  "allocationMethod",
  "approvedBy",
  "approvedAt",
  "lines { lineId productId vendorItemCode description qty uom stdQty unitPrice discountType discount taxCodeId receivedQty }",
])

export const OPEN_PO_FILTER = {
  isQuote: false,
  isCancelled: { $ne: true },
  inventoryStatus: { $in: ["unapproved", "unfulfilled", "started"] },
}
