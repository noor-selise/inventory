import { purchaseOrders } from "@/features/purchasing/api"
import { payments } from "@/features/payments/api"
import { reorderSuggestions } from "@/features/reorder/api"
import { salesOrders, type SalesOrder } from "@/features/sales/api"
import { salesTotals } from "@/features/sales/actions"
import type { OrderLookups } from "@/features/sales/lookups"
import { discounted, isReturn, salesLineAmount, toHome } from "@/features/sales/order-math"
import { lots, posting, stockAdjustments, stockTransfers } from "@/features/stock/api"
import { SOURCE_LABELS } from "@/features/stock/lookups"
import { computeTax } from "@/features/pricing/pricing"
import { adjustmentReasons } from "@/features/settings/api"
import { dateFilter } from "@/lib/blocks/data"

// The core 20 reports (spec 0015 AC-1). Blocks has no server side sums, so
// each report reads raw rows in pages and adds them up in the browser; fine
// for small and medium companies (see spec 0015 for the large company plan).

export type ColumnType = "text" | "number" | "money" | "date"
export type ReportColumn = { key: string; label: string; type: ColumnType; /** Hidden from users without cost access (AC-4). */ cost?: boolean }
export type ReportFilters = { from?: string; to?: string; locationId?: string; productId?: string; partyId?: string }
export type ReportRow = Record<string, string | number | null>
export type FilterKind = "date" | "location" | "product" | "customer" | "vendor"

export type ReportDefinition = {
  key: string
  title: string
  group: "Sales" | "Purchasing" | "Inventory"
  description: string
  filters: FilterKind[]
  columns: ReportColumn[]
  /** Money columns are in home currency unless the report says otherwise. */
  load: (filters: ReportFilters, lookups: OrderLookups) => Promise<ReportRow[]>
}

const PAGE = 1000
async function all<T>(fetch: (pageNo: number) => Promise<{ items: T[]; totalCount: number }>): Promise<T[]> {
  const rows: T[] = []
  for (let page = 1; page < 50; page++) {
    const { items, totalCount } = await fetch(page)
    rows.push(...items)
    if (rows.length >= totalCount || items.length < PAGE) break
  }
  return rows
}

const dayStart = (day?: string) => (day ? new Date(`${day}T00:00:00`).toISOString() : undefined)
const dayEnd = (day?: string) => (day ? new Date(`${day}T23:59:59.999`).toISOString() : undefined)
function range(field: string, filters: ReportFilters) {
  const condition: Record<string, unknown> = {}
  if (filters.from) condition.$gte = dateFilter(dayStart(filters.from)!)
  if (filters.to) condition.$lte = dateFilter(dayEnd(filters.to)!)
  return Object.keys(condition).length ? { [field]: condition } : {}
}

async function soldOrders(filters: ReportFilters, extra: Record<string, unknown> = {}) {
  return all((pageNo) =>
    salesOrders.list({
      filter: { isQuote: false, isCancelled: { $ne: true }, ...range("orderDate", filters), ...(filters.locationId ? { locationId: filters.locationId } : {}), ...(filters.partyId ? { customerId: filters.partyId } : {}), ...extra },
      pageNo,
      pageSize: PAGE,
    })
  )
}

async function boughtOrders(filters: ReportFilters, extra: Record<string, unknown> = {}) {
  return all((pageNo) =>
    purchaseOrders.list({
      filter: { isQuote: false, isCancelled: { $ne: true }, ...range("orderDate", filters), ...(filters.locationId ? { receiveLocationId: filters.locationId } : {}), ...(filters.partyId ? { vendorId: filters.partyId } : {}), ...extra },
      pageNo,
      pageSize: PAGE,
    })
  )
}

/** Cost of goods per sales line, from posted pick steps minus restocks. */
function lineCost(order: SalesOrder, lineId: string) {
  return (order.stockSteps ?? [])
    .filter((step) => step.status === "posted")
    .flatMap((step) => step.lines.filter((line) => line.lineId === lineId).map((line) => (step.kind === "restock" ? -1 : 1) * Number(line.qty) * Number(line.unitCost ?? 0)))
    .reduce((sum, value) => sum + value, 0)
}

async function balanceRows(filters: ReportFilters) {
  return all((pageNo) => posting.balances({ ...(filters.locationId ? { locationId: filters.locationId } : {}), ...(filters.productId ? { productId: filters.productId } : {}) }, { pageNo, pageSize: PAGE }))
}

export const REPORTS: ReportDefinition[] = [
  {
    key: "sales-by-product",
    title: "Sales by product",
    group: "Sales",
    description: "Quantity and revenue per product line, in home currency.",
    filters: ["date", "location", "product", "customer"],
    columns: [
      { key: "product", label: "Product", type: "text" },
      { key: "sku", label: "SKU", type: "text" },
      { key: "qty", label: "Quantity", type: "number" },
      { key: "revenue", label: "Revenue", type: "money" },
      { key: "cogs", label: "Cost of goods", type: "money", cost: true },
    ],
    load: async (filters, lookups) =>
      (await soldOrders(filters)).flatMap((order) =>
        order.lines
          .filter((line) => !isReturn(line) && (!filters.productId || line.productId === filters.productId))
          .map((line) => ({
            product: lookups.productOf(line.productId)?.name ?? "",
            sku: lookups.productOf(line.productId)?.sku ?? "",
            qty: line.stdQty,
            revenue: toHome(salesLineAmount(line), order.exchangeRate),
            cogs: lineCost(order, line.lineId),
          }))
      ),
  },
  {
    key: "sales-profit",
    title: "Sales profit",
    group: "Sales",
    description: "Revenue, cost of goods and profit per order. Cost is fixed when stock is picked.",
    filters: ["date", "location", "customer"],
    columns: [
      { key: "number", label: "Order", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "customer", label: "Customer", type: "text" },
      { key: "revenue", label: "Revenue", type: "money" },
      { key: "cogs", label: "Cost of goods", type: "money", cost: true },
      { key: "profit", label: "Profit", type: "money", cost: true },
      { key: "margin", label: "Margin %", type: "number", cost: true },
    ],
    load: async (filters, lookups) =>
      (await soldOrders(filters)).map((order) => {
        const revenue = toHome(Number(order.subtotal ?? 0), order.exchangeRate)
        const profit = revenue - Number(order.cogs ?? 0) - Number(order.nonCustomerCosts ?? 0)
        return { number: order.number, date: order.orderDate, customer: lookups.customerOf(order.customerId)?.name ?? "", revenue, cogs: Number(order.cogs ?? 0), profit, margin: revenue ? Math.round((profit / revenue) * 1000) / 10 : null }
      }),
  },
  {
    key: "returns",
    title: "Returns",
    group: "Sales",
    description: "Return lines on sales orders and what happened to them.",
    filters: ["date", "location", "product", "customer"],
    columns: [
      { key: "number", label: "Order", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "customer", label: "Customer", type: "text" },
      { key: "product", label: "Product", type: "text" },
      { key: "qty", label: "Returned", type: "number" },
      { key: "action", label: "Action", type: "text" },
      { key: "done", label: "Done", type: "number" },
      { key: "credit", label: "Credit", type: "money" },
    ],
    load: async (filters, lookups) =>
      (await soldOrders(filters)).flatMap((order) =>
        order.lines
          .filter((line) => isReturn(line) && (!filters.productId || line.productId === filters.productId))
          .map((line) => ({
            number: order.number,
            date: order.orderDate,
            customer: lookups.customerOf(order.customerId)?.name ?? "",
            product: lookups.productOf(line.productId)?.name ?? "",
            qty: Math.abs(line.stdQty),
            action: line.returnAction === "discard" ? "Discard" : "Restock",
            done: Number(line.restockedQty ?? 0),
            credit: toHome(-salesLineAmount(line), order.exchangeRate),
          }))
      ),
  },
  {
    key: "sales-tax",
    title: "Sales tax",
    group: "Sales",
    description: "Tax collected per order, both components, in home currency.",
    filters: ["date", "location", "customer"],
    columns: [
      { key: "number", label: "Order", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "customer", label: "Customer", type: "text" },
      { key: "scheme", label: "Taxing scheme", type: "text" },
      { key: "net", label: "Net", type: "money" },
      { key: "tax1", label: "Tax 1", type: "money" },
      { key: "tax2", label: "Tax 2", type: "money" },
      { key: "total", label: "Total", type: "money" },
    ],
    load: async (filters, lookups) =>
      (await soldOrders(filters)).map((order) => {
        const { tax } = salesTotals(order, lookups)
        return {
          number: order.number,
          date: order.orderDate,
          customer: lookups.customerOf(order.customerId)?.name ?? "",
          scheme: lookups.taxSchemeOf(order.taxingSchemeId)?.name ?? "",
          net: toHome(tax.net, order.exchangeRate),
          tax1: toHome(tax.tax1, order.exchangeRate),
          tax2: toHome(tax.tax2, order.exchangeRate),
          total: toHome(tax.total, order.exchangeRate),
        }
      }),
  },
  {
    key: "payments-received",
    title: "Payments received",
    group: "Sales",
    description: "Customer payments, refunds and credits, in their own currency.",
    filters: ["date", "customer"],
    columns: [
      { key: "number", label: "Payment", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "customer", label: "Customer", type: "text" },
      { key: "type", label: "Type", type: "text" },
      { key: "method", label: "Method", type: "text" },
      { key: "currency", label: "Currency", type: "text" },
      { key: "amount", label: "Amount", type: "number" },
    ],
    load: async (filters, lookups) =>
      (await all((pageNo) => payments.list({ filter: { party: "customer", isVoided: { $ne: true }, ...range("paidOn", filters), ...(filters.partyId ? { partyId: filters.partyId } : {}) }, pageNo, pageSize: PAGE }))).map((payment) => ({
        number: payment.number,
        date: payment.paidOn,
        customer: lookups.customerOf(payment.partyId)?.name ?? "",
        type: payment.type.replace(/_/g, " "),
        method: lookups.methods.find((method) => method.ItemId === payment.methodId)?.name ?? "",
        currency: payment.currencyCode,
        amount: payment.type === "refund" ? -payment.amount : payment.amount,
      })),
  },
  {
    key: "back-orders",
    title: "Back orders",
    group: "Sales",
    description: "Ordered quantities not shipped yet on open orders.",
    filters: ["date", "location", "product", "customer"],
    columns: [
      { key: "number", label: "Order", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "customer", label: "Customer", type: "text" },
      { key: "product", label: "Product", type: "text" },
      { key: "ordered", label: "Ordered", type: "number" },
      { key: "shipped", label: "Shipped", type: "number" },
      { key: "open", label: "Open", type: "number" },
    ],
    load: async (filters, lookups) =>
      (await soldOrders(filters, { inventoryStatus: { $in: ["unfulfilled", "started", "unconfirmed"] } })).flatMap((order) =>
        order.lines
          .filter((line) => !isReturn(line) && lookups.productOf(line.productId)?.itemType !== "service" && (!filters.productId || line.productId === filters.productId))
          .map((line) => ({ number: order.number, date: order.orderDate, customer: lookups.customerOf(order.customerId)?.name ?? "", product: lookups.productOf(line.productId)?.name ?? "", ordered: line.stdQty, shipped: Number(line.shippedQty ?? 0), open: line.stdQty - Number(line.shippedQty ?? 0) }))
          .filter((row) => row.open > 0)
      ),
  },
  {
    key: "sales-by-rep",
    title: "Sales by rep",
    group: "Sales",
    description: "Orders and revenue per sales rep. Group by rep for totals.",
    filters: ["date", "location", "customer"],
    columns: [
      { key: "rep", label: "Sales rep", type: "text" },
      { key: "number", label: "Order", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "customer", label: "Customer", type: "text" },
      { key: "revenue", label: "Revenue", type: "money" },
      { key: "profit", label: "Profit", type: "money", cost: true },
    ],
    load: async (filters, lookups) =>
      (await soldOrders(filters)).map((order) => {
        const revenue = toHome(Number(order.subtotal ?? 0), order.exchangeRate)
        return { rep: lookups.userName(order.salesRepUserId) || "No rep", number: order.number, date: order.orderDate, customer: lookups.customerOf(order.customerId)?.name ?? "", revenue, profit: revenue - Number(order.cogs ?? 0) - Number(order.nonCustomerCosts ?? 0) }
      }),
  },
  {
    key: "po-summary",
    title: "Purchase order summary",
    group: "Purchasing",
    description: "Purchase orders with totals in home currency.",
    filters: ["date", "location", "vendor"],
    columns: [
      { key: "number", label: "PO", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "vendor", label: "Vendor", type: "text" },
      { key: "currency", label: "Currency", type: "text" },
      { key: "total", label: "Total (home)", type: "money" },
      { key: "paid", label: "Paid (home)", type: "money" },
    ],
    load: async (filters, lookups) =>
      (await boughtOrders(filters)).map((order) => ({ number: order.number, date: order.orderDate, vendor: lookups.vendorOf(order.vendorId)?.name ?? "", currency: order.currencyCode, total: toHome(Number(order.total ?? 0), order.exchangeRate), paid: toHome(Number(order.amountPaid ?? 0), order.exchangeRate) })),
  },
  {
    key: "po-status",
    title: "Purchase order status",
    group: "Purchasing",
    description: "Ordered and received per PO line.",
    filters: ["date", "location", "product", "vendor"],
    columns: [
      { key: "number", label: "PO", type: "text" },
      { key: "vendor", label: "Vendor", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "product", label: "Product", type: "text" },
      { key: "ordered", label: "Ordered", type: "number" },
      { key: "received", label: "Received", type: "number" },
      { key: "open", label: "Open", type: "number" },
    ],
    load: async (filters, lookups) =>
      (await boughtOrders(filters)).flatMap((order) =>
        order.lines
          .filter((line) => !filters.productId || line.productId === filters.productId)
          .map((line) => ({ number: order.number, vendor: lookups.vendorOf(order.vendorId)?.name ?? "", status: order.inventoryStatus ?? "", product: lookups.productOf(line.productId)?.name ?? "", ordered: line.stdQty, received: Number(line.receivedQty ?? 0), open: line.stdQty - Number(line.receivedQty ?? 0) }))
      ),
  },
  {
    key: "vendor-payments",
    title: "Vendor payments",
    group: "Purchasing",
    description: "Payments to vendors, in their own currency.",
    filters: ["date", "vendor"],
    columns: [
      { key: "number", label: "Payment", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "vendor", label: "Vendor", type: "text" },
      { key: "type", label: "Type", type: "text" },
      { key: "currency", label: "Currency", type: "text" },
      { key: "amount", label: "Amount", type: "number" },
    ],
    load: async (filters, lookups) =>
      (await all((pageNo) => payments.list({ filter: { party: "vendor", isVoided: { $ne: true }, ...range("paidOn", filters), ...(filters.partyId ? { partyId: filters.partyId } : {}) }, pageNo, pageSize: PAGE }))).map((payment) => ({
        number: payment.number,
        date: payment.paidOn,
        vendor: lookups.vendorOf(payment.partyId)?.name ?? "",
        type: payment.type.replace(/_/g, " "),
        currency: payment.currencyCode,
        amount: payment.type === "refund" ? -payment.amount : payment.amount,
      })),
  },
  {
    key: "purchase-tax",
    title: "Purchase tax",
    group: "Purchasing",
    description: "Tax paid on purchase orders, in home currency.",
    filters: ["date", "location", "vendor"],
    columns: [
      { key: "number", label: "PO", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "vendor", label: "Vendor", type: "text" },
      { key: "net", label: "Net", type: "money" },
      { key: "tax1", label: "Tax 1", type: "money" },
      { key: "tax2", label: "Tax 2", type: "money" },
    ],
    load: async (filters, lookups) =>
      (await boughtOrders(filters)).map((order) => {
        const tax = computeTax(
          order.lines.map((line) => ({ amount: line.qty * discounted(line.unitPrice, line.discountType, line.discount), taxCode: lookups.taxCodeOf(line.taxCodeId) ?? null })),
          lookups.taxSchemeOf(order.taxingSchemeId) ?? {},
          Number(order.freight ?? 0)
        )
        return { number: order.number, date: order.orderDate, vendor: lookups.vendorOf(order.vendorId)?.name ?? "", net: toHome(tax.net, order.exchangeRate), tax1: toHome(tax.tax1, order.exchangeRate), tax2: toHome(tax.tax2, order.exchangeRate) }
      }),
  },
  {
    key: "inventory-summary",
    title: "Inventory summary",
    group: "Inventory",
    description: "On hand per product across all locations.",
    filters: ["product"],
    columns: [
      { key: "product", label: "Product", type: "text" },
      { key: "sku", label: "SKU", type: "text" },
      { key: "unit", label: "Unit", type: "text" },
      { key: "onHand", label: "On hand", type: "number" },
    ],
    load: async (filters, lookups) => {
      const totals = new Map<string, number>()
      for (const balance of await balanceRows(filters)) totals.set(balance.productId, (totals.get(balance.productId) ?? 0) + balance.onHand)
      return [...totals].map(([productId, onHand]) => ({ product: lookups.productOf(productId)?.name ?? "", sku: lookups.productOf(productId)?.sku ?? "", unit: lookups.productOf(productId)?.standardUom ?? "", onHand }))
    },
  },
  {
    key: "inventory-by-location",
    title: "Inventory by location",
    group: "Inventory",
    description: "On hand per product, location and bin.",
    filters: ["location", "product"],
    columns: [
      { key: "location", label: "Location", type: "text" },
      { key: "bin", label: "Bin", type: "text" },
      { key: "product", label: "Product", type: "text" },
      { key: "onHand", label: "On hand", type: "number" },
    ],
    load: async (filters, lookups) =>
      (await balanceRows(filters)).filter((balance) => balance.onHand !== 0).map((balance) => ({ location: lookups.locationName(balance.locationId), bin: lookups.binCode(balance.sublocationId), product: lookups.productOf(balance.productId)?.name ?? "", onHand: balance.onHand })),
  },
  {
    key: "inventory-value",
    title: "Inventory value",
    group: "Inventory",
    description: "On hand times average cost, per product and location.",
    filters: ["location", "product"],
    columns: [
      { key: "product", label: "Product", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "onHand", label: "On hand", type: "number" },
      { key: "cost", label: "Average cost", type: "money", cost: true },
      { key: "value", label: "Value", type: "money", cost: true },
    ],
    load: async (filters, lookups) => {
      const totals = new Map<string, number>()
      for (const balance of await balanceRows(filters)) totals.set(`${balance.productId}|${balance.locationId}`, (totals.get(`${balance.productId}|${balance.locationId}`) ?? 0) + balance.onHand)
      return [...totals].map(([key, onHand]) => {
        const [productId, locationId] = key.split("|")
        const cost = Number(lookups.productOf(productId)?.averageCost ?? 0)
        return { product: lookups.productOf(productId)?.name ?? "", location: lookups.locationName(locationId), onHand, cost, value: onHand * cost }
      })
    },
  },
  {
    key: "movement-history",
    title: "Movement history",
    group: "Inventory",
    description: "Every posted stock movement: who, what, when and from which document.",
    filters: ["date", "location", "product"],
    columns: [
      { key: "date", label: "When", type: "date" },
      { key: "document", label: "Document", type: "text" },
      { key: "number", label: "Number", type: "text" },
      { key: "product", label: "Product", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "qty", label: "Quantity", type: "number" },
      { key: "cost", label: "Unit cost", type: "money", cost: true },
      { key: "by", label: "By", type: "text" },
    ],
    load: async (filters, lookups) =>
      (
        await all((pageNo) =>
          posting.movements({ status: "posted", ...range("effectiveAt", filters), ...(filters.locationId ? { locationId: filters.locationId } : {}), ...(filters.productId ? { productId: filters.productId } : {}) }, { sort: { effectiveAt: -1 }, pageNo, pageSize: PAGE })
        )
      ).map((movement) => ({
        date: movement.effectiveAt,
        document: SOURCE_LABELS[movement.sourceType] ?? movement.sourceType,
        number: movement.sourceNumber ?? "",
        product: lookups.productOf(movement.productId)?.name ?? "",
        location: lookups.locationName(movement.locationId),
        qty: movement.qtyDelta,
        cost: movement.unitCost,
        by: movement.LastUpdatedBy ?? "",
      })),
  },
  {
    key: "stock-as-of",
    title: "Stock as of a date",
    group: "Inventory",
    description: "On hand per product and location at the end of the 'to' date, rebuilt from the ledger.",
    filters: ["date", "location", "product"],
    columns: [
      { key: "product", label: "Product", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "onHand", label: "On hand", type: "number" },
    ],
    load: async (filters, lookups) => {
      const totals = new Map<string, number>()
      const rows = await all((pageNo) =>
        posting.movements({ status: "posted", ...(filters.to ? { effectiveAt: { $lte: dateFilter(dayEnd(filters.to)!) } } : {}), ...(filters.locationId ? { locationId: filters.locationId } : {}), ...(filters.productId ? { productId: filters.productId } : {}) }, { pageNo, pageSize: PAGE })
      )
      for (const movement of rows) totals.set(`${movement.productId}|${movement.locationId}`, (totals.get(`${movement.productId}|${movement.locationId}`) ?? 0) + movement.qtyDelta)
      return [...totals]
        .filter(([, onHand]) => Math.abs(onHand) > 1e-9)
        .map(([key, onHand]) => {
          const [productId, locationId] = key.split("|")
          return { product: lookups.productOf(productId)?.name ?? "", location: lookups.locationName(locationId), onHand }
        })
    },
  },
  {
    key: "reorder",
    title: "Reorder report",
    group: "Inventory",
    description: "The current reorder list (rebuilt nightly or with Check now).",
    filters: ["location", "product"],
    columns: [
      { key: "product", label: "Product", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "onHand", label: "On hand", type: "number" },
      { key: "reserved", label: "Reserved", type: "number" },
      { key: "onOrder", label: "On order", type: "number" },
      { key: "anticipated", label: "Anticipated", type: "number" },
      { key: "point", label: "Reorder point", type: "number" },
      { key: "suggested", label: "Suggested", type: "number" },
    ],
    load: async (filters, lookups) =>
      (await reorderSuggestions.list({ filter: { ...(filters.locationId ? { locationId: filters.locationId } : {}), ...(filters.productId ? { productId: filters.productId } : {}) }, pageSize: 5000 })).items.map((row) => ({
        product: lookups.productOf(row.productId)?.name ?? "",
        location: lookups.locationName(row.locationId),
        onHand: row.onHand,
        reserved: row.reserved,
        onOrder: row.onOrder,
        anticipated: row.anticipated,
        point: row.reorderPoint,
        suggested: row.suggestedQty,
      })),
  },
  {
    key: "adjustments",
    title: "Adjustments",
    group: "Inventory",
    description: "Stock adjustment lines with their reason.",
    filters: ["date", "location", "product"],
    columns: [
      { key: "number", label: "Adjustment", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "location", label: "Location", type: "text" },
      { key: "reason", label: "Reason", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "product", label: "Product", type: "text" },
      { key: "qty", label: "Change", type: "number" },
    ],
    load: async (filters, lookups) => {
      const reasons = new Map<string, string>()
      for (const reason of (await adjustmentReasons.list({ pageSize: 500 })).items) reasons.set(reason.ItemId, reason.name)
      return (await all((pageNo) => stockAdjustments.list({ filter: { ...range("adjustedAt", filters), ...(filters.locationId ? { locationId: filters.locationId } : {}) }, pageNo, pageSize: PAGE }))).flatMap((doc) =>
        doc.lines
          .filter((line) => !filters.productId || line.productId === filters.productId)
          .map((line) => ({ number: doc.number, date: doc.adjustedAt, location: lookups.locationName(doc.locationId), reason: reasons.get(doc.reasonId) ?? "", status: doc.status, product: lookups.productOf(line.productId)?.name ?? "", qty: line.qtyDelta }))
      )
    },
  },
  {
    key: "transfers",
    title: "Transfers",
    group: "Inventory",
    description: "Transfer lines between locations.",
    filters: ["date", "location", "product"],
    columns: [
      { key: "number", label: "Transfer", type: "text" },
      { key: "date", label: "Created", type: "date" },
      { key: "from", label: "From", type: "text" },
      { key: "to", label: "To", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "product", label: "Product", type: "text" },
      { key: "qty", label: "Quantity", type: "number" },
    ],
    load: async (filters, lookups) =>
      (await all((pageNo) => stockTransfers.list({ filter: { ...range("CreatedDate", filters) }, pageNo, pageSize: PAGE })))
        .filter((doc) => !filters.locationId || doc.fromLocationId === filters.locationId || doc.toLocationId === filters.locationId)
        .flatMap((doc) =>
          doc.lines
            .filter((line) => !filters.productId || line.productId === filters.productId)
            .map((line) => ({ number: doc.number, date: doc.CreatedDate ?? null, from: lookups.locationName(doc.fromLocationId), to: lookups.locationName(doc.toLocationId), status: doc.status.replace(/_/g, " "), product: lookups.productOf(line.productId)?.name ?? "", qty: line.qty }))
        ),
  },
  {
    key: "lot-expiry",
    title: "Lot expiry",
    group: "Inventory",
    description: "Lots with stock, earliest expiry first. The date filter limits the expiry date.",
    filters: ["date", "location", "product"],
    columns: [
      { key: "lot", label: "Lot", type: "text" },
      { key: "product", label: "Product", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "expires", label: "Expires", type: "date" },
      { key: "days", label: "Days left", type: "number" },
      { key: "onHand", label: "On hand", type: "number" },
    ],
    load: async (filters, lookups) => {
      const balances = (await balanceRows(filters)).filter((balance) => balance.lotId && balance.onHand > 0)
      const lotRows = await all((pageNo) => lots.list({ filter: { ...range("expiresOn", filters) }, pageNo, pageSize: PAGE }))
      return balances
        .map((balance) => ({ balance, lot: lotRows.find((lot) => lot.ItemId === balance.lotId) }))
        .filter((row) => row.lot)
        .sort((a, b) => (a.lot!.expiresOn ?? "9999").localeCompare(b.lot!.expiresOn ?? "9999"))
        .map(({ balance, lot }) => ({
          lot: lot!.lotNumber,
          product: lookups.productOf(balance.productId)?.name ?? "",
          location: lookups.locationName(balance.locationId),
          expires: lot!.expiresOn ?? null,
          days: lot!.expiresOn ? Math.floor((new Date(lot!.expiresOn).getTime() - Date.now()) / 86_400_000) : null,
          onHand: balance.onHand,
        }))
    },
  },
]
