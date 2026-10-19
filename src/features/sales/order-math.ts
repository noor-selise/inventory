// Order totals, derived statuses and landed cost for sales and purchase orders
// (spec 0011 AC-4, spec 0012 AC-5, AC-6). Pure functions with no app imports,
// so Node checks can run them.

import type { ItemType } from "@/features/products/api"
import type { InventoryStatus, PaymentStatus, SalesLine, SalesOrder } from "./api"
import type { PurchaseLine, PurchaseOrder } from "@/features/purchasing/api"

const EPSILON = 0.005

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Price after a line discount: percent off, or a fixed amount off each unit. */
export function discounted(unitPrice: number, type?: string | null, discount?: number | null) {
  const value = Math.max(Number(discount ?? 0), 0)
  if (type === "percent") return unitPrice * (1 - Math.min(value, 100) / 100)
  if (type === "fixed") return Math.max(0, unitPrice - value)
  return unitPrice
}

/**
 * A sales line's unitPrice is already the net price (spec 0010 resolves the
 * scheme, customer discount, line discount and breaks into one number), so the
 * amount is quantity times price. Negative for returns.
 */
export function salesLineAmount(line: Pick<SalesLine, "qty" | "unitPrice">) {
  return Number(line.qty) * Number(line.unitPrice ?? 0)
}

/** A purchase line's price is the vendor price before its discount. */
export function purchaseLineAmount(line: Pick<PurchaseLine, "qty" | "unitPrice" | "discountType" | "discount">) {
  return Number(line.qty) * discounted(Number(line.unitPrice ?? 0), line.discountType, line.discount)
}

/** Converts an order currency amount to home currency (rates are units of the order currency per one home unit). */
export function toHome(amount: number, exchangeRate?: number | null) {
  const rate = Number(exchangeRate ?? 1)
  return rate > 0 ? amount / rate : amount
}

// Sales progress, in standard units.

type ItemTypeOf = (productId: string) => ItemType | undefined

const progress = (value?: number | null) => Number(value ?? 0)
export const isReturn = (line: Pick<SalesLine, "stdQty">) => Number(line.stdQty) < 0

export function salesLineRemaining(line: SalesLine) {
  const ordered = Math.abs(Number(line.stdQty))
  return {
    toPick: isReturn(line) ? 0 : Math.max(0, ordered - progress(line.pickedQty)),
    toPack: isReturn(line) ? 0 : Math.max(0, progress(line.pickedQty) - progress(line.packedQty)),
    toShip: isReturn(line) ? 0 : Math.max(0, progress(line.packedQty) - progress(line.shippedQty)),
    toRestock: isReturn(line) ? Math.max(0, ordered - progress(line.restockedQty)) : 0,
  }
}

function salesLineDone(line: SalesLine, itemType: ItemType | undefined) {
  if (itemType === "service") return line.serviceDone === true
  if (isReturn(line)) return progress(line.restockedQty) >= Math.abs(Number(line.stdQty)) - 1e-9
  return progress(line.shippedQty) >= Number(line.stdQty) - 1e-9
}

function salesLineStarted(line: SalesLine) {
  return progress(line.pickedQty) > 0 || progress(line.restockedQty) > 0 || line.serviceDone === true
}

export function salesInventoryStatus(
  order: Pick<SalesOrder, "isQuote" | "isCancelled" | "needsConfirmation" | "confirmedBy" | "lines">,
  itemTypeOf: ItemTypeOf
): InventoryStatus {
  if (order.isCancelled) return "cancelled"
  if (order.isQuote) return "quote"
  if (order.needsConfirmation && !order.confirmedBy) return "unconfirmed"
  const lines = order.lines ?? []
  if (lines.length && lines.every((line) => salesLineDone(line, itemTypeOf(line.productId)))) return "fulfilled"
  if (lines.some(salesLineStarted)) return "started"
  return "unfulfilled"
}

export function salesPaymentStatus(
  order: Pick<SalesOrder, "isQuote" | "isCancelled" | "needsConfirmation" | "confirmedBy" | "invoicedOn" | "total" | "amountPaid">
): PaymentStatus {
  if (order.isCancelled) return "cancelled"
  if (order.isQuote) return "quote"
  if (order.needsConfirmation && !order.confirmedBy) return "unconfirmed"
  const total = Number(order.total ?? 0)
  const paid = Number(order.amountPaid ?? 0)
  if (paid > total + EPSILON) return "owing"
  if (paid > EPSILON && paid >= total - EPSILON) return "paid"
  if (paid > EPSILON) return "partial"
  return order.invoicedOn ? "invoiced" : "uninvoiced"
}

// Purchase progress.

function purchaseLineDone(line: PurchaseLine) {
  const ordered = Number(line.stdQty)
  const received = progress(line.receivedQty)
  return ordered < 0 ? received <= ordered + 1e-9 : received >= ordered - 1e-9
}

/** Waiting for approval (spec 0012 AC-3). A PO with stock already received counts as approved. */
function awaitingApproval(order: Pick<PurchaseOrder, "approvedBy" | "lines">) {
  return !order.approvedBy && !(order.lines ?? []).some((line) => progress(line.receivedQty) !== 0)
}

export function purchaseInventoryStatus(order: Pick<PurchaseOrder, "isQuote" | "isCancelled" | "approvedBy" | "lines">): InventoryStatus {
  if (order.isCancelled) return "cancelled"
  if (order.isQuote) return "quote"
  if (awaitingApproval(order)) return "unapproved"
  const lines = order.lines ?? []
  if (lines.length && lines.every(purchaseLineDone)) return "fulfilled"
  if (lines.some((line) => progress(line.receivedQty) !== 0)) return "started"
  return "unfulfilled"
}

export function purchasePaymentStatus(order: Pick<PurchaseOrder, "isQuote" | "isCancelled" | "approvedBy" | "lines" | "total" | "amountPaid">): PaymentStatus {
  if (order.isCancelled) return "cancelled"
  if (order.isQuote) return "quote"
  if (order.lines && awaitingApproval(order) && !Number(order.amountPaid ?? 0)) return "unapproved"
  const total = Number(order.total ?? 0)
  const paid = Number(order.amountPaid ?? 0)
  if (paid > total + EPSILON) return "owing"
  if (paid > EPSILON && paid >= total - EPSILON) return "paid"
  if (paid > EPSILON) return "partial"
  return "unpaid"
}

// Landed cost (spec 0012 AC-5, PRD §5.4).

export type CostProduct = {
  itemType?: ItemType | string | null
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
}

/** Freight plus non vendor costs, in the order currency. Percent costs are a share of the lines subtotal. */
export function extraCosts(order: Pick<PurchaseOrder, "freight" | "nonVendorCosts" | "lines">) {
  const subtotal = (order.lines ?? []).filter((line) => line.qty > 0).reduce((sum, line) => sum + purchaseLineAmount(line), 0)
  const others = (order.nonVendorCosts ?? []).reduce(
    (sum, cost) => sum + (cost.type === "pct" ? (subtotal * Number(cost.amount ?? 0)) / 100 : Number(cost.amount ?? 0)),
    0
  )
  return Number(order.freight ?? 0) + others
}

/**
 * Landed cost per standard unit, in home currency, for each stocked line
 * ordered in a positive quantity: the net vendor price plus the line's share
 * of freight and non vendor costs, shared by value (default), weight or
 * volume. When nothing can be weighed or measured, the share falls back to
 * value, then to an equal split. The shares always add up to the extra costs.
 */
export function landedUnitCosts(
  order: Pick<PurchaseOrder, "freight" | "nonVendorCosts" | "lines" | "allocationMethod" | "exchangeRate">,
  productOf: (productId: string) => CostProduct | undefined
): Map<string, number> {
  const stocked = (order.lines ?? []).filter((line) => line.qty > 0 && Number(line.stdQty) > 0 && (productOf(line.productId)?.itemType ?? "stocked") === "stocked")
  const extras = extraCosts(order)
  const value = (line: PurchaseLine) => purchaseLineAmount(line)
  const weight = (line: PurchaseLine) => Number(productOf(line.productId)?.weight ?? 0) * Number(line.stdQty)
  const volume = (line: PurchaseLine) => {
    const product = productOf(line.productId)
    return Number(product?.length ?? 0) * Number(product?.width ?? 0) * Number(product?.height ?? 0) * Number(line.stdQty)
  }
  const measures = [order.allocationMethod === "weight" ? weight : order.allocationMethod === "volume" ? volume : value, value, () => 1]
  let basis = measures[0]
  for (const measure of measures) {
    basis = measure
    if (stocked.reduce((sum, line) => sum + measure(line), 0) > 0) break
  }
  const totalBasis = stocked.reduce((sum, line) => sum + basis(line), 0)
  const result = new Map<string, number>()
  for (const line of stocked) {
    const share = totalBasis > 0 ? (extras * basis(line)) / totalBasis : 0
    result.set(line.lineId, toHome((value(line) + share) / Number(line.stdQty), order.exchangeRate))
  }
  return result
}
