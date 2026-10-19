// What each order has been paid, and each customer's or vendor's open balance
// and store credit per currency (spec 0013 AC-3, AC-4). One self contained
// function with no imports and no outside references: the app calls it, and
// scripts/workflows/build.mjs copies its source into the workflow Code nodes,
// so the browser and the server always compute the same numbers.

export type LedgerPayment = {
  ItemId?: string
  party: "customer" | "vendor" | string
  partyId: string
  type: "payment" | "batch" | "refund" | "apply_credit" | "convert_to_credit" | string
  amount: number
  currencyCode: string
  isVoided?: boolean | null
  allocations?: { orderType?: string | null; orderId: string; amount: number }[] | null
}

export type LedgerOrder = {
  ItemId: string
  currencyCode: string
  total?: number | null
  isQuote?: boolean | null
  isCancelled?: boolean | null
  /** Sales orders count toward the balance once invoiced; purchase orders once ordered. */
  invoicedOn?: string | null
}

export type LedgerResult = {
  orderPaid: Record<string, number>
  balances: {
    party: string
    partyId: string
    currencyCode: string
    invoiced: number
    paid: number
    openBalance: number
    storeCredit: number
  }[]
}

/**
 * Payment and batch: money in (customer) or out (vendor), split over orders;
 * what is not split becomes store credit. Apply credit: spends store credit on
 * orders. Convert to credit: moves an order's overpayment into store credit.
 * Refund: gives money back, from an order when split, else from store credit.
 */
export function computeLedger(
  payments: LedgerPayment[],
  orders: (LedgerOrder & { party: string; partyId: string })[]
): LedgerResult {
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
  const orderPaid: Record<string, number> = {}
  const balances = new Map<string, LedgerResult["balances"][number]>()
  const row = (party: string, partyId: string, currencyCode: string) => {
    const key = `${party}|${partyId}|${currencyCode}`
    let entry = balances.get(key)
    if (!entry) {
      entry = { party, partyId, currencyCode, invoiced: 0, paid: 0, openBalance: 0, storeCredit: 0 }
      balances.set(key, entry)
    }
    return entry
  }

  for (const payment of payments) {
    if (payment.isVoided) continue
    const allocations = payment.allocations ?? []
    const allocated = allocations.reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0)
    const sign = payment.type === "refund" || payment.type === "convert_to_credit" ? -1 : 1
    for (const allocation of allocations) {
      orderPaid[allocation.orderId] = (orderPaid[allocation.orderId] ?? 0) + sign * Number(allocation.amount ?? 0)
    }
    const entry = row(payment.party, payment.partyId, payment.currencyCode)
    const amount = Number(payment.amount ?? 0)
    if (payment.type === "payment" || payment.type === "batch") entry.storeCredit += amount - allocated
    else if (payment.type === "apply_credit") entry.storeCredit -= allocated
    else if (payment.type === "convert_to_credit") entry.storeCredit += allocated
    else if (payment.type === "refund") entry.storeCredit -= amount - allocated
  }

  for (const order of orders) {
    if (order.isQuote || order.isCancelled) continue
    const entry = row(order.party, order.partyId, order.currencyCode)
    const paid = orderPaid[order.ItemId] ?? 0
    const counts = order.party === "vendor" || Boolean(order.invoicedOn)
    if (counts) entry.invoiced += Number(order.total ?? 0)
    entry.paid += paid
  }

  const result: LedgerResult = { orderPaid: {}, balances: [] }
  for (const [orderId, paid] of Object.entries(orderPaid)) result.orderPaid[orderId] = round(paid)
  for (const entry of balances.values()) {
    result.balances.push({
      ...entry,
      invoiced: round(entry.invoiced),
      paid: round(entry.paid),
      openBalance: round(entry.invoiced - entry.paid),
      storeCredit: round(entry.storeCredit),
    })
  }
  return result
}
