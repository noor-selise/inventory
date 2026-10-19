import { computeTax } from "@/features/pricing/pricing"
import { products, type Product } from "@/features/products/api"
import { withNextNumber } from "@/features/settings/numbering"
import type { PaymentTerm, TaxCode, TaxingScheme } from "@/features/settings/api"
import { lots, posting } from "@/features/stock/api"
import type { PostingLine } from "@/features/stock/posting.ts"
import { voidAllocationsFor } from "@/features/payments/actions"
import { salesOrders, type SalesLine, type SalesOrder, type SalesPackage, type StockStep, type StockStepLine } from "./api"
import { isReturn, round2, salesInventoryStatus, salesLineAmount, salesLineRemaining, salesPaymentStatus } from "./order-math"
import { mutateOrder } from "./order-store"
import { finishStep, runStockStep, type StepConfig } from "./stock-steps"

// Sales order actions (spec 0011). Order edits are one compare and set save
// each; stock moves only through the step runner and spec 0007 posting.

export type SalesContext = {
  productOf: (id?: string | null) => Product | undefined
  taxSchemeOf: (id?: string | null) => TaxingScheme | undefined
  taxCodeOf: (id?: string | null) => TaxCode | undefined
  termOf: (id?: string | null) => PaymentTerm | undefined
}

export function salesTotals(order: Pick<SalesOrder, "lines" | "freight" | "taxingSchemeId">, context: SalesContext) {
  const scheme = context.taxSchemeOf(order.taxingSchemeId) ?? {}
  const tax = computeTax(
    order.lines.map((line) => ({ amount: salesLineAmount(line), taxCode: context.taxCodeOf(line.taxCodeId) ?? null })),
    scheme,
    Number(order.freight ?? 0)
  )
  return { subtotal: round2(tax.net - tax.shipping.net), taxTotal: round2(tax.tax1 + tax.tax2), total: tax.total, tax }
}

/** Statuses and cost of goods, always worked out from the document (spec 0011 AC-4, AC-7). */
export function deriveSales(order: SalesOrder, context: Pick<SalesContext, "productOf">): Partial<SalesOrder> {
  const steps = (order.stockSteps ?? []).filter((step) => step.status === "posted")
  const cost = (kind: StockStep["kind"]) =>
    steps.filter((step) => step.kind === kind).flatMap((step) => step.lines).reduce((sum, line) => sum + Number(line.qty) * Number(line.unitCost ?? 0), 0)
  return {
    inventoryStatus: salesInventoryStatus(order, (id) => context.productOf(id)?.itemType),
    paymentStatus: salesPaymentStatus(order),
    cogs: round2(cost("pick") - cost("restock")),
  }
}

export type SalesDraft = Omit<SalesOrder, "ItemId" | "number" | "revision" | "history" | "stockSteps" | "packages" | "shipments" | "inventoryStatus" | "paymentStatus" | "cogs">

export function dueDateFor(orderDate: string, term?: PaymentTerm) {
  if (!term) return null
  const date = new Date(orderDate)
  date.setUTCDate(date.getUTCDate() + Number(term.daysDue ?? 0))
  return date.toISOString()
}

function checkLines(lines: SalesLine[], previous: SalesLine[] | undefined, context: SalesContext) {
  if (!lines.length) throw new Error("Add at least one line.")
  for (const line of lines) {
    const product = context.productOf(line.productId)
    if (!product) throw new Error("A line has no product.")
    if (!line.qty) throw new Error(`${product.name}: enter a quantity other than zero.`)
    if (line.qty < 0 && !line.returnAction) throw new Error(`${product.name}: choose restock or discard for the return.`)
    const old = previous?.find((item) => item.lineId === line.lineId)
    if (!old) continue
    const done = Math.max(Number(old.pickedQty ?? 0), Number(old.restockedQty ?? 0))
    if (old.productId !== line.productId && done > 0) throw new Error(`${product.name}: a line with picked or restocked stock cannot change product.`)
    if (Math.abs(line.stdQty) < done - 1e-9) throw new Error(`${product.name}: the quantity cannot go below what is already done (${done}).`)
    if (Math.sign(line.stdQty) !== Math.sign(old.stdQty) && done > 0) throw new Error(`${product.name}: a line with progress cannot switch between sale and return.`)
  }
  for (const old of previous ?? []) {
    const done = Math.max(Number(old.pickedQty ?? 0), Number(old.restockedQty ?? 0))
    if (done > 0 && !lines.some((line) => line.lineId === old.lineId)) {
      throw new Error(`${context.productOf(old.productId)?.name ?? "A line"} has picked or restocked stock and cannot be removed.`)
    }
  }
}

/** Creates a quote or an order. */
export async function createSalesOrder(draft: SalesDraft, context: SalesContext, by: string): Promise<SalesOrder> {
  checkLines(draft.lines, undefined, context)
  const totals = salesTotals(draft, context)
  const base = {
    ...draft,
    ...totals,
    tax: undefined,
    amountPaid: 0,
    revision: 0,
    packages: [],
    shipments: [],
    stockSteps: [],
    history: [{ at: new Date().toISOString(), by, action: draft.isQuote ? "quote created" : "order created", details: null }],
  }
  delete base.tax
  const derived = deriveSales({ ...(base as unknown as SalesOrder) }, context)
  const { number, result: itemId } = await withNextNumber(draft.isQuote ? "sales_quote" : "sales_order", (value) =>
    salesOrders.create({ ...base, ...derived, number: value } as Omit<SalesOrder, "ItemId">)
  )
  return { ...(base as unknown as SalesOrder), ...derived, ItemId: itemId, number }
}

/** Saves header and line changes. Lines with progress keep their product and cannot drop below it. */
export async function updateSalesOrder(orderId: string, draft: SalesDraft, context: SalesContext, by: string) {
  return mutateOrder(salesOrders, orderId, (order) => {
    if (order.isCancelled) throw new Error("A cancelled order cannot be edited.")
    if (order.inventoryStatus === "fulfilled") throw new Error("A fulfilled order cannot be edited.")
    const lines = draft.lines.map((line) => {
      const old = order.lines.find((item) => item.lineId === line.lineId)
      return old
        ? { ...line, pickedQty: old.pickedQty, packedQty: old.packedQty, shippedQty: old.shippedQty, restockedQty: old.restockedQty, serviceDone: line.serviceDone ?? old.serviceDone }
        : { ...line, pickedQty: 0, packedQty: 0, shippedQty: 0, restockedQty: 0 }
    })
    checkLines(lines, order.lines, context)
    const { tax: _tax, ...totals } = salesTotals({ ...draft, lines }, context)
    const next = { ...order, ...draft, lines, ...totals }
    return { patch: { ...draft, lines, ...totals, ...deriveSales(next, context) }, event: { by, action: "edited", details: null } }
  })
}

/** Quote to order (new SO number) or order back to quote while nothing has moved (spec 0011 AC-1). */
export async function convertSalesOrder(order: SalesOrder, context: SalesContext, by: string) {
  if (!order.isQuote) {
    return mutateOrder(salesOrders, order.ItemId, (current) => {
      if (current.lines.some((line) => Number(line.pickedQty ?? 0) || Number(line.restockedQty ?? 0))) {
        throw new Error("Stock has already moved on this order, so it cannot go back to a quote.")
      }
      if (Number(current.amountPaid ?? 0)) throw new Error("This order has payments, so it cannot go back to a quote.")
      const next = { ...current, isQuote: true }
      return { patch: { isQuote: true, ...deriveSales(next, context) }, event: { by, action: "converted to quote", details: null } }
    })
  }
  const { number } = await withNextNumber("sales_order", async (value) => {
    await mutateOrder(salesOrders, order.ItemId, (current) => {
      if (!current.isQuote) throw new Error("This quote was already converted.")
      const next = { ...current, isQuote: false, number: value }
      return { patch: { isQuote: false, number: value, orderDate: new Date().toISOString(), ...deriveSales(next, context) }, event: { by, action: "converted to order", details: `Quote ${current.number}` } }
    })
    return value
  })
  return { ...order, isQuote: false, number }
}

// Stock steps.

export type PickRequest = { lineId: string; qty: number; sublocationId?: string | null; lotId?: string | null; serial?: string | null }

async function freshCosts(productIds: string[]) {
  const ids = [...new Set(productIds)]
  if (!ids.length) return new Map<string, number | null>()
  const { items } = await products.list({ filter: { ItemId: { $in: ids } }, pageSize: ids.length })
  return new Map(items.map((item) => [item.ItemId, item.averageCost ?? null]))
}

function stepConfig(orderId: string, kind: "pick" | "restock", context: SalesContext, by: string): Pick<StepConfig<SalesOrder>, "store" | "orderId" | "kind" | "sourceType" | "by" | "undo" | "derive"> {
  const field = kind === "pick" ? "pickedQty" : "restockedQty"
  return {
    store: salesOrders,
    orderId,
    kind,
    sourceType: kind === "pick" ? "sales_pick" : "sales_restock",
    by,
    undo: (order, step) => ({
      lines: order.lines.map((line) => {
        const qty = step.lines.filter((item) => item.lineId === line.lineId).reduce((sum, item) => sum + Number(item.qty), 0)
        return qty ? { ...line, [field]: Math.max(0, Number(line[field] ?? 0) - qty) } : line
      }),
    }),
    derive: (order) => deriveSales(order, context),
  }
}

/** Picks stock for order lines (spec 0011 AC-3). Cost of goods is fixed here from the average cost (spec 0007 AC-8). */
export async function pickLines(order: SalesOrder, requests: PickRequest[], context: SalesContext, by: string) {
  const wanted = requests.filter((request) => request.qty > 0)
  if (!wanted.length) throw new Error("Enter a quantity to pick.")
  const costs = await freshCosts(wanted.map((request) => order.lines.find((line) => line.lineId === request.lineId)?.productId ?? ""))
  const base = stepConfig(order.ItemId, "pick", context, by)
  return runStockStep<SalesOrder>({
    ...base,
    plan: (current, stepId) => {
      if (current.isCancelled || current.isQuote) throw new Error("Only open orders can be picked.")
      const totals = new Map<string, number>()
      const lines: StockStepLine[] = []
      const postingLines: PostingLine[] = []
      wanted.forEach((request, index) => {
        const line = current.lines.find((item) => item.lineId === request.lineId)
        const product = context.productOf(line?.productId)
        if (!line || !product) throw new Error("A picked line is not on this order any more.")
        if (isReturn(line) || product.itemType === "service") throw new Error(`${product.name}: this line is not picked.`)
        if (product.trackSerials && (request.qty !== 1 || !request.serial)) throw new Error(`${product.name}: pick serial numbers one at a time.`)
        if (product.trackLots && !request.lotId) throw new Error(`${product.name}: choose the lot to pick.`)
        totals.set(line.lineId, (totals.get(line.lineId) ?? 0) + request.qty)
        if (totals.get(line.lineId)! > salesLineRemaining(line).toPick + 1e-9) {
          throw new Error(`${product.name}: only ${salesLineRemaining(line).toPick} left to pick.`)
        }
        const unitCost = costs.get(product.ItemId) ?? null
        lines.push({ lineId: line.lineId, qty: request.qty, sublocationId: request.sublocationId ?? null, lotId: request.lotId ?? null, serial: request.serial ?? null, unitCost })
        if (product.itemType === "stocked") {
          postingLines.push({
            lineId: `${stepId}:${index}`,
            productId: product.ItemId,
            locationId: current.locationId,
            sublocationId: request.sublocationId ?? null,
            lotId: request.lotId ?? null,
            serial: request.serial ?? null,
            qtyDelta: -request.qty,
            unitCost,
          })
        }
      })
      return {
        lines,
        posting: postingLines,
        patch: { lines: current.lines.map((line) => (totals.has(line.lineId) ? { ...line, pickedQty: Number(line.pickedQty ?? 0) + totals.get(line.lineId)! } : line)) },
        details: wanted.map((request) => `${context.productOf(current.lines.find((line) => line.lineId === request.lineId)?.productId)?.name ?? ""} × ${request.qty}`).join(", "),
      }
    },
  })
}

/**
 * Suggests picks for everything left: lots earliest expiry first (expired
 * lots never), else the bins holding the most. Short lines pick what there is
 * and stay on back order (spec 0011 AC-3, spec 0009 AC-4).
 */
export async function suggestPicks(order: SalesOrder, context: SalesContext): Promise<{ picks: PickRequest[]; short: { lineId: string; missing: number }[] }> {
  const picks: PickRequest[] = []
  const short: { lineId: string; missing: number }[] = []
  const { items: balances } = await posting.balances({ locationId: order.locationId, onHand: { $gt: 0 } }, { pageSize: 5000 })
  const lotIds = [...new Set(balances.map((balance) => balance.lotId).filter(Boolean) as string[])]
  const lotRows = lotIds.length ? (await lots.list({ filter: { ItemId: { $in: lotIds } }, pageSize: lotIds.length })).items : []
  const expiry = (id?: string | null) => lotRows.find((lot) => lot.ItemId === id)?.expiresOn ?? null
  const now = new Date().toISOString()
  const used = new Map<string, number>()
  for (const line of order.lines) {
    const product = context.productOf(line.productId)
    let left = salesLineRemaining(line).toPick
    if (!product || left <= 0 || product.itemType === "service") continue
    if (product.itemType === "non_stocked") {
      picks.push({ lineId: line.lineId, qty: left })
      continue
    }
    const candidates = balances
      .filter((balance) => balance.productId === product.ItemId)
      .filter((balance) => !balance.lotId || !expiry(balance.lotId) || expiry(balance.lotId)! >= now)
      .sort((a, b) => (product.trackLots ? (expiry(a.lotId) ?? "9999").localeCompare(expiry(b.lotId) ?? "9999") : b.onHand - a.onHand))
    for (const balance of candidates) {
      if (left <= 0) break
      const free = balance.onHand - (used.get(balance.ItemId) ?? 0)
      if (free <= 0) continue
      const take = product.trackSerials ? 1 : Math.min(left, free)
      used.set(balance.ItemId, (used.get(balance.ItemId) ?? 0) + take)
      picks.push({ lineId: line.lineId, qty: take, sublocationId: balance.sublocationId, lotId: balance.lotId, serial: balance.serial })
      left -= take
    }
    if (left > 1e-9) short.push({ lineId: line.lineId, missing: left })
  }
  return { picks, short }
}

export type RestockRequest = PickRequest

/** Returns: restock lines put stock back; discard lines are recorded with no stock change. */
export async function restockLines(order: SalesOrder, requests: RestockRequest[], context: SalesContext, by: string) {
  const wanted = requests.filter((request) => request.qty > 0)
  if (!wanted.length) throw new Error("Enter a quantity to restock.")
  const costs = await freshCosts(wanted.map((request) => order.lines.find((line) => line.lineId === request.lineId)?.productId ?? ""))
  return runStockStep<SalesOrder>({
    ...stepConfig(order.ItemId, "restock", context, by),
    allowNegative: true,
    plan: (current, stepId) => {
      if (current.isCancelled || current.isQuote) throw new Error("Only open orders can be restocked.")
      const totals = new Map<string, number>()
      const lines: StockStepLine[] = []
      const postingLines: PostingLine[] = []
      wanted.forEach((request, index) => {
        const line = current.lines.find((item) => item.lineId === request.lineId)
        const product = context.productOf(line?.productId)
        if (!line || !product || !isReturn(line)) throw new Error("Only return lines are restocked.")
        totals.set(line.lineId, (totals.get(line.lineId) ?? 0) + request.qty)
        if (totals.get(line.lineId)! > salesLineRemaining(line).toRestock + 1e-9) throw new Error(`${product.name}: only ${salesLineRemaining(line).toRestock} left to restock.`)
        const putBack = line.returnAction === "restock" && product.itemType === "stocked"
        if (putBack && product.trackSerials && (request.qty !== 1 || !request.serial)) throw new Error(`${product.name}: restock serial numbers one at a time.`)
        if (putBack && product.trackLots && !request.lotId) throw new Error(`${product.name}: choose the lot to restock into.`)
        const unitCost = costs.get(product.ItemId) ?? null
        lines.push({ lineId: line.lineId, qty: request.qty, sublocationId: request.sublocationId ?? null, lotId: request.lotId ?? null, serial: request.serial ?? null, unitCost: putBack ? unitCost : 0 })
        if (putBack) {
          postingLines.push({
            lineId: `${stepId}:${index}`,
            productId: product.ItemId,
            locationId: current.locationId,
            sublocationId: request.sublocationId ?? null,
            lotId: request.lotId ?? null,
            serial: request.serial ?? null,
            qtyDelta: request.qty,
            unitCost,
          })
        }
      })
      return {
        lines,
        posting: postingLines,
        patch: { lines: current.lines.map((line) => (totals.has(line.lineId) ? { ...line, restockedQty: Number(line.restockedQty ?? 0) + totals.get(line.lineId)! } : line)) },
        details: `${lines.length} return line(s)`,
      }
    },
  })
}

/** Settles a pick or restock left half done by a closed browser. */
export async function finishSalesStep(order: SalesOrder, step: StockStep, context: SalesContext, by: string) {
  const config = stepConfig(order.ItemId, step.kind === "restock" ? "restock" : "pick", context, by)
  const expected = step.lines.filter((line) => {
    const product = context.productOf(order.lines.find((item) => item.lineId === line.lineId)?.productId)
    return product?.itemType === "stocked" && (step.kind === "pick" || order.lines.find((item) => item.lineId === line.lineId)?.returnAction === "restock")
  }).length
  return finishStep(config, step, "sales_reversal", expected)
}

// Pack, ship, services, invoice.

export async function packLines(order: SalesOrder, requests: { lineId: string; qty: number }[], context: SalesContext, by: string) {
  const wanted = requests.filter((request) => request.qty > 0)
  if (!wanted.length) throw new Error("Enter a quantity to pack.")
  return mutateOrder(salesOrders, order.ItemId, (current) => {
    const packages = current.packages ?? []
    const number = `${current.number}-${packages.length + 1}`
    const lines = current.lines.map((line) => {
      const qty = wanted.filter((request) => request.lineId === line.lineId).reduce((sum, request) => sum + request.qty, 0)
      if (!qty) return line
      if (qty > salesLineRemaining(line).toPack + 1e-9) throw new Error(`${context.productOf(line.productId)?.name}: only ${salesLineRemaining(line).toPack} picked and not packed.`)
      return { ...line, packedQty: Number(line.packedQty ?? 0) + qty }
    })
    const pack: SalesPackage = { number, packedAt: new Date().toISOString(), shipmentId: null, lines: wanted.map(({ lineId, qty }) => ({ lineId, qty })) }
    const next = { ...current, lines, packages: [...packages, pack] }
    return { patch: { lines, packages: next.packages, ...deriveSales(next, context) }, event: { by, action: "packed", details: `Package ${number}` } }
  })
}

export async function shipPackages(
  order: SalesOrder,
  input: { packageNumbers: string[]; carrierId?: string | null; trackingNumber?: string | null; shippedAt?: string },
  context: SalesContext,
  by: string
) {
  if (!input.packageNumbers.length) throw new Error("Choose at least one package to ship.")
  return mutateOrder(salesOrders, order.ItemId, (current) => {
    const shipmentId = crypto.randomUUID()
    const chosen = (current.packages ?? []).filter((pack) => input.packageNumbers.includes(pack.number))
    if (chosen.length !== input.packageNumbers.length || chosen.some((pack) => pack.shipmentId)) throw new Error("A chosen package is already shipped. Reload the order.")
    const lines = current.lines.map((line) => {
      const qty = chosen.flatMap((pack) => pack.lines).filter((item) => item.lineId === line.lineId).reduce((sum, item) => sum + Number(item.qty), 0)
      return qty ? { ...line, shippedQty: Number(line.shippedQty ?? 0) + qty } : line
    })
    const packages = (current.packages ?? []).map((pack) => (input.packageNumbers.includes(pack.number) ? { ...pack, shipmentId } : pack))
    const shipments = [
      ...(current.shipments ?? []),
      { shipmentId, carrierId: input.carrierId ?? null, trackingNumber: input.trackingNumber?.trim() || null, shippedAt: input.shippedAt ?? new Date().toISOString(), packageNumbers: input.packageNumbers },
    ]
    const next = { ...current, lines, packages, shipments }
    return { patch: { lines, packages, shipments, ...deriveSales(next, context) }, event: { by, action: "shipped", details: input.packageNumbers.join(", ") } }
  })
}

export async function setServiceDone(order: SalesOrder, lineIds: string[], done: boolean, context: SalesContext, by: string) {
  return mutateOrder(salesOrders, order.ItemId, (current) => {
    const lines = current.lines.map((line) => (lineIds.includes(line.lineId) ? { ...line, serviceDone: done } : line))
    const next = { ...current, lines }
    return { patch: { lines, ...deriveSales(next, context) }, event: { by, action: done ? "services done" : "services reopened", details: null } }
  })
}

export async function invoiceOrder(order: SalesOrder, invoicedOn: string, context: SalesContext, by: string) {
  return mutateOrder(salesOrders, order.ItemId, (current) => {
    if (current.isQuote || current.isCancelled) throw new Error("Only open orders can be invoiced.")
    const next = { ...current, invoicedOn }
    return { patch: { invoicedOn, ...deriveSales(next, context) }, event: { by, action: "invoiced", details: null } }
  })
}

// Quick actions (spec 0011 AC-5).

export async function pickAll(order: SalesOrder, context: SalesContext, by: string) {
  const { picks, short } = await suggestPicks(order, context)
  const latest = picks.length ? await pickLines(order, picks, context, by) : order
  return { order: latest, short }
}

export async function packAll(order: SalesOrder, context: SalesContext, by: string) {
  const requests = order.lines.map((line) => ({ lineId: line.lineId, qty: salesLineRemaining(line).toPack })).filter((request) => request.qty > 0)
  return requests.length ? packLines(order, requests, context, by) : order
}

export async function shipAll(order: SalesOrder, context: SalesContext, by: string, shipment: { carrierId?: string | null; trackingNumber?: string | null } = {}) {
  const picked = await pickAll(order, context, by)
  let current = await packAll(picked.order, context, by)
  const open = (current.packages ?? []).filter((pack) => !pack.shipmentId).map((pack) => pack.number)
  if (open.length) current = await shipPackages(current, { packageNumbers: open, ...shipment }, context, by)
  return { order: current, short: picked.short }
}

/** Ships everything, restocks or discards returns without lot or serial, and marks services done. */
export async function fulfillAll(order: SalesOrder, context: SalesContext, by: string) {
  const shipped = await shipAll(order, context, by)
  let current = shipped.order
  const returns = current.lines
    .filter((line) => salesLineRemaining(line).toRestock > 0)
    .filter((line) => {
      const product = context.productOf(line.productId)
      return line.returnAction === "discard" || !(product?.trackLots || product?.trackSerials)
    })
  if (returns.length) current = await restockLines(current, returns.map((line) => ({ lineId: line.lineId, qty: salesLineRemaining(line).toRestock })), context, by)
  const services = current.lines.filter((line) => context.productOf(line.productId)?.itemType === "service" && !line.serviceDone)
  if (services.length) current = await setServiceDone(current, services.map((line) => line.lineId), true, context, by)
  return { order: current, short: shipped.short }
}

/**
 * Cancels the order: every pick and restock is reversed in the ledger and
 * payments split onto it become store credit (spec 0011 AC-6, spec 0013 AC-6).
 * Safe to run again on a cancelled order to finish a cancel cut short.
 */
export async function cancelSalesOrder(order: SalesOrder, context: SalesContext, by: string) {
  const current = await mutateOrder(salesOrders, order.ItemId, (latest) => {
    if (latest.isCancelled) return { patch: {} }
    if ((latest.stockSteps ?? []).some((step) => step.status === "posting")) throw new Error("A stock step is still posting. Finish it first.")
    const next = { ...latest, isCancelled: true }
    return { patch: { isCancelled: true, cancelledAt: new Date().toISOString(), ...deriveSales(next, context) }, event: { by, action: "cancelled", details: null } }
  })
  await posting.reverseSource("sales_pick", current.ItemId, "sales_reversal")
  await posting.reverseSource("sales_restock", current.ItemId, "sales_reversal")
  await voidAllocationsFor("sales", current.ItemId, by)
  return current
}
