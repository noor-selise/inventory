import { collection, type Entity } from "@/lib/blocks/data"
import type { Address, Contact } from "@/features/partners/api"

// Sales quotes and orders (spec 0011). One document holds the lines, packages,
// shipments, stock steps and history, so every order change is one atomic
// write. No stock imports here, so the stock screens can read orders without
// an import loop.

export type DiscountType = "percent" | "fixed"

export type SalesLine = {
  lineId: string
  productId: string
  description?: string | null
  /** Entered quantity in `uom`. Negative means a return. */
  qty: number
  uom?: string | null
  /** The same quantity in the product's standard unit (signed). */
  stdQty: number
  unitPrice: number
  discountType?: DiscountType | null
  discount?: number | null
  taxCodeId?: string | null
  serviceDone?: boolean | null
  /** Return lines only: put back into stock, or throw away. */
  returnAction?: "restock" | "discard" | null
  /** Progress, in standard units. */
  pickedQty?: number | null
  packedQty?: number | null
  shippedQty?: number | null
  restockedQty?: number | null
}

export type PackageLine = { lineId: string; qty: number }

export type SalesPackage = {
  number: string
  packedAt: string
  shipmentId?: string | null
  lines: PackageLine[]
}

export type SalesShipment = {
  shipmentId: string
  carrierId?: string | null
  trackingNumber?: string | null
  shippedAt: string
  packageNumbers: string[]
}

export type StockStepLine = {
  lineId: string
  qty: number
  sublocationId?: string | null
  lotId?: string | null
  serial?: string | null
  unitCost?: number | null
}

/**
 * A pick, a restock or a receipt. Written to the order before any stock moves
 * (status `posting`), then marked `posted` or `failed`, so a closed browser
 * leaves a step that can be finished.
 */
export type StockStep = {
  stepId: string
  kind: "pick" | "restock" | "receive" | "unstock"
  at: string
  by?: string | null
  status: "posting" | "posted" | "failed"
  lines: StockStepLine[]
}

export type OrderEvent = { at: string; by?: string | null; action: string; details?: string | null }

export type InventoryStatus = "quote" | "unconfirmed" | "unapproved" | "unfulfilled" | "started" | "fulfilled" | "cancelled"
export type PaymentStatus = "quote" | "unconfirmed" | "unapproved" | "uninvoiced" | "invoiced" | "unpaid" | "partial" | "paid" | "owing" | "cancelled"

/** Header fields sales and purchase orders share. */
export type OrderBase = Entity & {
  number: string
  isQuote: boolean
  orderDate: string
  dueDate?: string | null
  requestedShipDate?: string | null
  currencyCode: string
  exchangeRate: number
  taxingSchemeId?: string | null
  paymentTermId?: string | null
  freight?: number | null
  subtotal?: number | null
  taxTotal?: number | null
  total?: number | null
  /** Kept up to date from payments (spec 0013), by the app and by a workflow. */
  amountPaid?: number | null
  inventoryStatus?: InventoryStatus | null
  paymentStatus?: PaymentStatus | null
  isCancelled?: boolean | null
  cancelledAt?: string | null
  remarks?: string | null
  /** Bumped on every save; the compare and set guard (spec 0026). */
  revision?: number | null
  history?: OrderEvent[] | null
  stockSteps?: StockStep[] | null
}

export type SalesOrder = OrderBase & {
  customerId: string
  contact?: Contact | null
  billingAddress?: Address | null
  shippingAddress?: Address | null
  locationId: string
  pricingSchemeId?: string | null
  salesRepUserId?: string | null
  assignedUserId?: string | null
  customerPoNumber?: string | null
  externalId?: string | null
  source?: string | null
  priority?: number | null
  needsConfirmation?: boolean | null
  confirmedBy?: string | null
  /** Picking session lock (spec 0011 AC-11): who and since when. */
  pickingLockedBy?: string | null
  pickingLockedAt?: string | null
  invoicedOn?: string | null
  shipRemarks?: string | null
  cogs?: number | null
  nonCustomerCosts?: number | null
  lines: SalesLine[]
  packages?: SalesPackage[] | null
  shipments?: SalesShipment[] | null
}

const ADDRESS = "{ line1 line2 city region postalCode country }"
export const STEP_SELECTION = "stockSteps { stepId kind at by status lines { lineId qty sublocationId lotId serial unitCost } }"
export const HISTORY_SELECTION = "history { at by action details }"
export const ORDER_BASE_FIELDS = [
  "number",
  "isQuote",
  "orderDate",
  "dueDate",
  "requestedShipDate",
  "currencyCode",
  "exchangeRate",
  "taxingSchemeId",
  "paymentTermId",
  "freight",
  "subtotal",
  "taxTotal",
  "total",
  "amountPaid",
  "inventoryStatus",
  "paymentStatus",
  "isCancelled",
  "cancelledAt",
  "remarks",
  "revision",
  HISTORY_SELECTION,
  STEP_SELECTION,
] as const

export const salesOrders = collection<SalesOrder>("SalesOrder", [
  ...ORDER_BASE_FIELDS,
  "customerId",
  "contact { name email phone role }",
  `billingAddress ${ADDRESS}`,
  `shippingAddress ${ADDRESS}`,
  "locationId",
  "pricingSchemeId",
  "salesRepUserId",
  "assignedUserId",
  "customerPoNumber",
  "externalId",
  "source",
  "priority",
  "needsConfirmation",
  "confirmedBy",
  "pickingLockedBy",
  "pickingLockedAt",
  "invoicedOn",
  "shipRemarks",
  "cogs",
  "nonCustomerCosts",
  "lines { lineId productId description qty uom stdQty unitPrice discountType discount taxCodeId serviceDone returnAction pickedQty packedQty shippedQty restockedQty }",
  "packages { number packedAt shipmentId lines { lineId qty } }",
  "shipments { shipmentId carrierId trackingNumber shippedAt packageNumbers }",
])

/** Orders that still hold or wait for stock: not quotes, not cancelled, not fulfilled. */
export const OPEN_ORDER_FILTER = {
  isQuote: false,
  isCancelled: { $ne: true },
  inventoryStatus: { $in: ["unconfirmed", "unapproved", "unfulfilled", "started"] },
}
