import { computeTax } from "@/features/pricing/pricing"
import { resolveBin } from "@/features/locations/api"
import { products, vendorItems, type VendorItem } from "@/features/products/api"
import { withNextNumber } from "@/features/settings/numbering"
import { posting, resolveLot } from "@/features/stock/api"
import type { PostingLine } from "@/features/stock/posting.ts"
import { voidAllocationsFor } from "@/features/payments/actions"
import type { SalesContext } from "@/features/sales/actions"
import type { StockStep, StockStepLine } from "@/features/sales/api"
import { discounted, landedUnitCosts, purchaseInventoryStatus, purchaseLineAmount, purchasePaymentStatus, round2, toHome } from "@/features/sales/order-math"
import { mutateOrder } from "@/features/sales/order-store"
import { finishStep, runStockStep, type StepConfig } from "@/features/sales/stock-steps"
import { canApprove, type TeamMemberProfile } from "@/features/team/profile"
import { purchaseOrders, type PurchaseOrder } from "./api"

// Purchase order actions (spec 0012). Receiving posts stock at the landed unit
// cost and then updates the moving average cost (spec 0007 AC-7).

export function purchaseTotals(order: Pick<PurchaseOrder, "lines" | "freight" | "taxingSchemeId">, context: SalesContext) {
  const tax = computeTax(
    order.lines.map((line) => ({ amount: purchaseLineAmount(line), taxCode: context.taxCodeOf(line.taxCodeId) ?? null })),
    context.taxSchemeOf(order.taxingSchemeId) ?? {},
    Number(order.freight ?? 0)
  )
  return { subtotal: round2(tax.net - tax.shipping.net), taxTotal: round2(tax.tax1 + tax.tax2), total: tax.total }
}

export function derivePurchase(order: PurchaseOrder): Partial<PurchaseOrder> {
  return { inventoryStatus: purchaseInventoryStatus(order), paymentStatus: purchasePaymentStatus(order) }
}

// Approval by limit (spec 0012 AC-3, spec 0027): a PO is Unapproved until a
// person whose approval limit covers its total in home currency approves it.
// A PO saved by someone whose own limit covers it is approved on save.
// Blocks ignores null in an update, so an empty approvedBy clears an approval.

export type Approver = { by: string; profile?: TeamMemberProfile; isAdmin: boolean }

const homeTotal = (order: Pick<PurchaseOrder, "total" | "exchangeRate">) => toHome(Number(order.total ?? 0), order.exchangeRate)

function approvalFields(order: Pick<PurchaseOrder, "isQuote" | "total" | "exchangeRate">, approver?: Approver) {
  if (order.isQuote || !approver || !canApprove(approver.profile, homeTotal(order), approver.isAdmin)) return null
  return { approvedBy: approver.by, approvedAt: new Date().toISOString() }
}

export async function approvePurchaseOrder(order: PurchaseOrder, approver: Approver) {
  return mutateOrder(purchaseOrders, order.ItemId, (current) => {
    if (current.isQuote || current.isCancelled) throw new Error("Only open purchase orders are approved.")
    if (current.approvedBy) return { patch: {} }
    if (!canApprove(approver.profile, homeTotal(current), approver.isAdmin)) {
      throw new Error(`Your approval limit does not cover this order (${round2(homeTotal(current))} in home currency).`)
    }
    const next = { ...current, approvedBy: approver.by, approvedAt: new Date().toISOString() }
    return { patch: { approvedBy: next.approvedBy, approvedAt: next.approvedAt, ...derivePurchase(next) }, event: { by: approver.by, action: "approved", details: null } }
  })
}

export type PurchaseDraft = Omit<PurchaseOrder, "ItemId" | "number" | "revision" | "history" | "stockSteps" | "inventoryStatus" | "paymentStatus">

function checkLines(order: Pick<PurchaseOrder, "lines">, previous: PurchaseOrder | undefined, context: SalesContext) {
  if (!order.lines.length) throw new Error("Add at least one line.")
  for (const line of order.lines) {
    const product = context.productOf(line.productId)
    if (!product) throw new Error("A line has no product.")
    if (!line.qty) throw new Error(`${product.name}: enter a quantity other than zero.`)
    if (!(Number(line.unitPrice) >= 0)) throw new Error(`${product.name}: enter a price.`)
    const old = previous?.lines.find((item) => item.lineId === line.lineId)
    const received = Number(old?.receivedQty ?? 0)
    if (old && received !== 0) {
      if (old.productId !== line.productId) throw new Error(`${product.name}: a received line cannot change product.`)
      if (Math.abs(line.stdQty) < Math.abs(received) - 1e-9) throw new Error(`${product.name}: the quantity cannot go below what is received (${Math.abs(received)}).`)
    }
  }
  for (const old of previous?.lines ?? []) {
    if (Number(old.receivedQty ?? 0) !== 0 && !order.lines.some((line) => line.lineId === old.lineId)) {
      throw new Error(`${context.productOf(old.productId)?.name ?? "A line"} is partly received and cannot be removed.`)
    }
  }
}

export async function createPurchaseOrder(draft: PurchaseDraft, context: SalesContext, by: string, approver?: Approver): Promise<PurchaseOrder> {
  checkLines(draft, undefined, context)
  const totals = purchaseTotals(draft, context)
  const base = {
    ...draft,
    ...totals,
    approvedBy: null as string | null,
    approvedAt: null as string | null,
    ...approvalFields({ ...draft, ...totals }, approver),
    amountPaid: 0,
    revision: 0,
    stockSteps: [],
    history: [{ at: new Date().toISOString(), by, action: draft.isQuote ? "quote created" : "order created", details: null }],
  }
  const derived = derivePurchase(base as unknown as PurchaseOrder)
  const { number, result: itemId } = await withNextNumber("purchase_order", (value) => purchaseOrders.create({ ...base, ...derived, number: value }))
  return { ...(base as unknown as PurchaseOrder), ...derived, ItemId: itemId, number }
}

export async function updatePurchaseOrder(orderId: string, draft: PurchaseDraft, context: SalesContext, by: string, approver?: Approver) {
  return mutateOrder(purchaseOrders, orderId, (order) => {
    if (order.isCancelled) throw new Error("A cancelled order cannot be edited.")
    const lines = draft.lines.map((line) => ({ ...line, receivedQty: order.lines.find((item) => item.lineId === line.lineId)?.receivedQty ?? 0 }))
    checkLines({ lines }, order, context)
    const totals = purchaseTotals({ ...draft, lines }, context)
    // A higher total needs approval again, unless the editor's own limit covers it.
    const grew = Number(totals.total) > Number(order.total ?? 0) + 0.005
    const approval = order.approvedBy && !grew ? {} : (approvalFields({ ...order, ...draft, ...totals }, approver) ?? (order.approvedBy ? { approvedBy: "" } : {}))
    const next = { ...order, ...draft, lines, ...totals, ...approval }
    return { patch: { ...draft, lines, ...totals, ...approval, ...derivePurchase(next) }, event: { by, action: "edited", details: null } }
  })
}

export async function convertPurchaseOrder(order: PurchaseOrder, by: string, approver?: Approver) {
  return mutateOrder(purchaseOrders, order.ItemId, (current) => {
    if (!current.isQuote) {
      if (current.lines.some((line) => Number(line.receivedQty ?? 0) !== 0)) throw new Error("Stock has been received, so this cannot go back to a quote.")
      if (Number(current.amountPaid ?? 0)) throw new Error("This order has payments, so it cannot go back to a quote.")
    }
    const isQuote = !current.isQuote
    const approval = isQuote ? { approvedBy: "" } : (approvalFields({ ...current, isQuote }, approver) ?? {})
    const next = { ...current, isQuote, ...approval }
    return { patch: { isQuote, ...approval, ...(isQuote ? {} : { orderDate: new Date().toISOString() }), ...derivePurchase(next) }, event: { by, action: isQuote ? "converted to quote" : "converted to order", details: null } }
  })
}

export type ReceiveRequest = {
  lineId: string
  qty: number
  binCode?: string
  lotNumber?: string
  lotExpiresOn?: string
  serial?: string
}

function stepConfig(orderId: string, kind: "receive" | "unstock", by: string): Pick<StepConfig<PurchaseOrder>, "store" | "orderId" | "kind" | "sourceType" | "by" | "undo" | "derive"> {
  const sign = kind === "receive" ? 1 : -1
  return {
    store: purchaseOrders,
    orderId,
    kind,
    sourceType: kind === "receive" ? "purchase_receive" : "po_unstock",
    by,
    undo: (order, step) => ({
      lines: order.lines.map((line) => {
        const qty = step.lines.filter((item) => item.lineId === line.lineId).reduce((sum, item) => sum + Number(item.qty), 0)
        return qty ? { ...line, receivedQty: Number(line.receivedQty ?? 0) - sign * qty } : line
      }),
    }),
    derive: derivePurchase,
  }
}

/**
 * Receives (positive lines) or unstocks (return lines) part or all of a PO
 * into a location and bin, with lot or serial (spec 0012 AC-4). Received stock
 * posts at its landed unit cost (AC-5), then the average cost moves.
 */
export async function receiveLines(order: PurchaseOrder, requests: ReceiveRequest[], context: SalesContext, by: string) {
  const wanted = requests.filter((request) => request.qty > 0)
  if (!wanted.length) throw new Error("Enter a quantity to receive.")
  const kinds = new Set(wanted.map((request) => (Number(order.lines.find((line) => line.lineId === request.lineId)?.stdQty) < 0 ? "unstock" : "receive")))
  if (kinds.size > 1) throw new Error("Receive and return lines separately.")
  const kind = kinds.has("unstock") ? "unstock" : "receive"

  // Bins and lots are created on the fly, before the order changes.
  const resolved: { request: ReceiveRequest; line: PurchaseOrder["lines"][number]; product: NonNullable<ReturnType<SalesContext["productOf"]>>; sublocationId: string | null; lotId: string | null; serial: string | null }[] = []
  for (const request of wanted) {
    const line = order.lines.find((item) => item.lineId === request.lineId)
    const product = context.productOf(line?.productId)
    if (!line || !product) throw new Error("A line is not on this order any more.")
    if (product.itemType === "stocked" && product.trackSerials && (request.qty !== 1 || !request.serial?.trim())) throw new Error(`${product.name}: enter serial numbers one per row.`)
    if (product.itemType === "stocked" && product.trackLots && !request.lotNumber?.trim()) throw new Error(`${product.name}: enter the lot number.`)
    const sublocationId = product.itemType === "stocked" ? await resolveBin(order.receiveLocationId, request.binCode ?? "") : null
    const lotId =
      product.itemType === "stocked" && product.trackLots
        ? await resolveLot(product.ItemId, request.lotNumber ?? "", {
            expiresOn: request.lotExpiresOn ? new Date(`${request.lotExpiresOn}T00:00:00Z`).toISOString() : null,
            shelfLifeDays: product.shelfLifeDays,
          })
        : null
    resolved.push({ request, line, product, sublocationId, lotId, serial: product.trackSerials ? request.serial?.trim() || null : null })
  }

  const landed = landedUnitCosts(order, (id) => context.productOf(id))
  const { items: fresh } = await products.list({ filter: { ItemId: { $in: [...new Set(resolved.map((row) => row.product.ItemId))] } }, pageSize: 200 })
  const averageCost = (id: string) => fresh.find((item) => item.ItemId === id)?.averageCost ?? null

  const done = await runStockStep<PurchaseOrder>({
    ...stepConfig(order.ItemId, kind, by),
    allowNegative: false,
    plan: (current, stepId) => {
      if (current.isCancelled || current.isQuote) throw new Error("Only open purchase orders can be received.")
      if (purchaseInventoryStatus(current) === "unapproved") throw new Error("This purchase order waits for approval before it can be received.")
      const totals = new Map<string, number>()
      const lines: StockStepLine[] = []
      const postingLines: PostingLine[] = []
      resolved.forEach((row, index) => {
        const line = current.lines.find((item) => item.lineId === row.line.lineId)
        if (!line) throw new Error("A line is not on this order any more.")
        totals.set(line.lineId, (totals.get(line.lineId) ?? 0) + row.request.qty)
        const left = Math.abs(Number(line.stdQty)) - Math.abs(Number(line.receivedQty ?? 0))
        if (totals.get(line.lineId)! > left + 1e-9) throw new Error(`${row.product.name}: only ${left} left to ${kind === "receive" ? "receive" : "return"}.`)
        const unitCost = kind === "receive" ? (landed.get(line.lineId) ?? null) : averageCost(row.product.ItemId)
        lines.push({ lineId: line.lineId, qty: row.request.qty, sublocationId: row.sublocationId, lotId: row.lotId, serial: row.serial, unitCost })
        if (row.product.itemType === "stocked") {
          postingLines.push({
            lineId: `${stepId}:${index}`,
            productId: row.product.ItemId,
            locationId: current.receiveLocationId,
            sublocationId: row.sublocationId,
            lotId: row.lotId,
            serial: row.serial,
            qtyDelta: kind === "receive" ? row.request.qty : -row.request.qty,
            unitCost,
          })
        }
      })
      const sign = kind === "receive" ? 1 : -1
      return {
        lines,
        posting: postingLines,
        patch: { lines: current.lines.map((line) => (totals.has(line.lineId) ? { ...line, receivedQty: Number(line.receivedQty ?? 0) + sign * totals.get(line.lineId)! } : line)) },
        details: resolved.map((row) => `${row.product.name} × ${row.request.qty}`).join(", "),
      }
    },
  })

  if (kind === "receive") {
    // Moving average per product, after the stock is in (spec 0007 AC-7).
    const byProduct = new Map<string, { qty: number; value: number }>()
    for (const row of resolved) {
      if (row.product.itemType !== "stocked") continue
      const cost = landed.get(row.line.lineId)
      if (cost == null) continue
      const entry = byProduct.get(row.product.ItemId) ?? { qty: 0, value: 0 }
      entry.qty += row.request.qty
      entry.value += row.request.qty * cost
      byProduct.set(row.product.ItemId, entry)
    }
    for (const [productId, entry] of byProduct) await posting.applyReceiptCost(productId, entry.qty, entry.value / entry.qty)
    // The product remembers its last vendor (spec 0012 AC-7).
    for (const productId of new Set(resolved.map((row) => row.product.ItemId))) await products.update(productId, { lastVendorId: order.vendorId })
  }
  return done
}

// Vendor price list from the latest PO (spec 0012 AC-7): the app lists lines
// whose price differs from the vendor's price list and updates it only after
// the person says yes.

export type VendorPriceChange = { productId: string; vendorItem?: VendorItem; oldCost: number | null; newCost: number; currencyCode: string }

/** Lines priced differently from the vendor price list, in the PO currency, per entered unit after discount. */
export function vendorPriceChanges(order: PurchaseOrder, items: VendorItem[], homeCurrency: string): VendorPriceChange[] {
  const changes: VendorPriceChange[] = []
  for (const line of order.lines) {
    if (!(line.qty > 0) || changes.some((change) => change.productId === line.productId)) continue
    const newCost = Math.round(discounted(Number(line.unitPrice ?? 0), line.discountType, line.discount) * 10000) / 10000
    const item = items.find((entry) => entry.vendorId === order.vendorId && entry.productId === line.productId)
    // Compare only like with like: a price list in another currency is left alone.
    if (item && (item.currencyCode || homeCurrency) !== order.currencyCode) continue
    if (item && Math.abs(Number(item.unitCost ?? 0) - newCost) < 0.00005) continue
    changes.push({ productId: line.productId, vendorItem: item, oldCost: item?.unitCost ?? null, newCost, currencyCode: order.currencyCode })
  }
  return changes
}

export async function applyVendorPrices(order: PurchaseOrder, changes: VendorPriceChange[]) {
  for (const change of changes) {
    if (change.vendorItem) await vendorItems.update(change.vendorItem.ItemId, { unitCost: change.newCost })
    else await vendorItems.create({ vendorId: order.vendorId, productId: change.productId, unitCost: change.newCost, currencyCode: change.currencyCode })
  }
}

export async function finishPurchaseStep(order: PurchaseOrder, step: StockStep, context: SalesContext, by: string) {
  const kind = step.kind === "unstock" ? "unstock" : "receive"
  const expected = step.lines.filter((line) => context.productOf(order.lines.find((item) => item.lineId === line.lineId)?.productId)?.itemType === "stocked").length
  return finishStep(stepConfig(order.ItemId, kind, by), step, "purchase_reversal", expected)
}

/** Cancels the PO: receipts and returns are reversed, payments become vendor credit. Average cost is not rewound. */
export async function cancelPurchaseOrder(order: PurchaseOrder, by: string) {
  const current = await mutateOrder(purchaseOrders, order.ItemId, (latest) => {
    if (latest.isCancelled) return { patch: {} }
    if ((latest.stockSteps ?? []).some((step) => step.status === "posting")) throw new Error("A receipt is still posting. Finish it first.")
    const next = { ...latest, isCancelled: true }
    return { patch: { isCancelled: true, cancelledAt: new Date().toISOString(), ...derivePurchase(next) }, event: { by, action: "cancelled", details: null } }
  })
  await posting.reverseSource("purchase_receive", current.ItemId, "purchase_reversal", { allowNegative: false })
  await posting.reverseSource("po_unstock", current.ItemId, "purchase_reversal")
  await voidAllocationsFor("purchase", current.ItemId, by)
  return current
}
