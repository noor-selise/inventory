import { BlocksDataError } from "@/lib/blocks/data"
import { withNextNumber } from "@/features/settings/numbering"
import { purchaseOrders, type PurchaseOrder } from "@/features/purchasing/api"
import { salesOrders, type SalesOrder } from "@/features/sales/api"
import { purchasePaymentStatus, salesPaymentStatus } from "@/features/sales/order-math"
import { mutateOrder } from "@/features/sales/order-store"
import { partyBalances, payments, type Party, type Payment, type PaymentAllocation, type PaymentType } from "./api"
import { computeLedger } from "./ledger"

// Payments (spec 0013). The payment and its split save as one document. Order
// paid amounts and party balances are derived: the app recomputes them right
// after a change, and the `payment-ledger` workflow recomputes them on the
// server whenever a payment is saved, so a closed browser cannot leave them
// wrong. Both recompute from all the party's payments, never add to a stored
// number, so running twice gives the same result.

const EPSILON = 0.005

export type PaymentInput = {
  party: Party
  partyId: string
  type: PaymentType
  methodId?: string | null
  reference?: string | null
  amount: number
  currencyCode: string
  paidOn: string
  remarks?: string | null
  allocations: PaymentAllocation[]
  /** Made once per form, so pressing Save twice records one payment. */
  postingKey: string
}

export function checkPayment(input: PaymentInput, storeCredit: number) {
  const allocated = input.allocations.reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0)
  if (input.allocations.some((allocation) => !(allocation.amount > 0))) return "Each split needs an amount above zero."
  if (input.type === "apply_credit") {
    if (allocated > storeCredit + EPSILON) return `Only ${storeCredit.toFixed(2)} store credit is available.`
    if (!input.allocations.length) return "Choose the orders the credit pays."
    return null
  }
  if (input.type === "convert_to_credit") return input.allocations.length ? null : "Choose the order whose overpayment becomes credit."
  if (!(input.amount > 0)) return "Enter an amount above zero."
  if (allocated > input.amount + EPSILON) return `The splits add up to ${allocated.toFixed(2)}, more than the payment of ${input.amount.toFixed(2)}.`
  return null
}

export async function recordPayment(input: PaymentInput, by: string): Promise<Payment> {
  const existing = (await payments.list({ filter: { postingKey: input.postingKey }, pageSize: 1 })).items[0]
  if (existing) return existing
  const balance = (await partyBalances.list({ filter: { party: input.party, partyId: input.partyId, currencyCode: input.currencyCode }, pageSize: 1 })).items[0]
  const problem = checkPayment(input, Number(balance?.storeCredit ?? 0))
  if (problem) throw new Error(problem)
  const amount = input.type === "apply_credit" || input.type === "convert_to_credit" ? input.allocations.reduce((sum, item) => sum + item.amount, 0) : input.amount
  const base = { ...input, amount, isVoided: false, revision: 0, remarks: input.remarks?.trim() || null, reference: input.reference?.trim() || null }
  let saved: Payment
  try {
    const { number, result } = await withNextNumber(input.party === "customer" ? "customer_payment" : "vendor_payment", (value) => payments.create({ ...base, number: value }))
    saved = { ...base, ItemId: result, number }
  } catch (error) {
    // The same form saved twice at once: the unique postingKey kept one.
    if (error instanceof BlocksDataError && error.isDuplicate) {
      const again = (await payments.list({ filter: { postingKey: input.postingKey }, pageSize: 1 })).items[0]
      if (again) return again
    }
    throw error
  }
  await refreshParty(input.party, input.partyId, by)
  return saved
}

export async function voidPayment(payment: Payment, by: string) {
  const changed = await payments.updateWhere(
    { ItemId: payment.ItemId, isVoided: { $ne: true } },
    { isVoided: true, voidedAt: new Date().toISOString(), revision: Number(payment.revision ?? 0) + 1 }
  )
  if (changed !== 1) throw new Error("This payment was already voided.")
  await refreshParty(payment.party, payment.partyId, by)
}

/** Takes a cancelled order out of every payment split; the money becomes store credit. */
export async function voidAllocationsFor(orderType: "sales" | "purchase", orderId: string, by: string) {
  const { items } = await payments.list({ filter: { "allocations.orderId": orderId }, pageSize: 500 })
  const parties = new Map<string, { party: Party; partyId: string }>()
  for (const payment of items) {
    let current: Payment | undefined = payment
    for (let attempt = 0; current && attempt < 5; attempt++) {
      const allocations = current.allocations.filter((allocation) => !(allocation.orderType === orderType && allocation.orderId === orderId))
      if (allocations.length === current.allocations.length) break
      const changed = await payments.updateWhere(
        { ItemId: current.ItemId, revision: current.revision ?? null },
        { allocations, revision: Number(current.revision ?? 0) + 1 }
      )
      if (changed === 1) break
      current = await payments.get(current.ItemId)
    }
    parties.set(`${payment.party}|${payment.partyId}`, { party: payment.party, partyId: payment.partyId })
  }
  for (const { party, partyId } of parties.values()) await refreshParty(party, partyId, by)
}

async function partyOrders(party: Party, partyId: string) {
  if (party === "customer") {
    const { items } = await salesOrders.list({ filter: { customerId: partyId, isQuote: false }, pageSize: 2000 })
    return items.map((order) => ({ ...order, party, partyId }))
  }
  const { items } = await purchaseOrders.list({ filter: { vendorId: partyId, isQuote: false }, pageSize: 2000 })
  return items.map((order) => ({ ...order, party, partyId }))
}

/**
 * Recomputes every order's paid amount and the party's balances from all its
 * payments (spec 0013 AC-3, AC-4). Order writes are compare and set, so a
 * concurrent payment makes one of them read again and include the other.
 */
export async function refreshParty(party: Party, partyId: string, by: string) {
  const [orders, { items: partyPayments }] = await Promise.all([
    partyOrders(party, partyId),
    payments.list({ filter: { party, partyId }, pageSize: 5000 }),
  ])
  const ledger = computeLedger(partyPayments, orders)
  for (const order of orders) {
    const paid = ledger.orderPaid[order.ItemId] ?? 0
    if (Math.abs(paid - Number(order.amountPaid ?? 0)) < EPSILON) continue
    if (party === "customer") {
      await mutateOrder<SalesOrder>(salesOrders, order.ItemId, async (latest) => {
        const fresh = computeLedger((await payments.list({ filter: { party, partyId }, pageSize: 5000 })).items, [{ ...latest, party, partyId }])
        const amountPaid = fresh.orderPaid[latest.ItemId] ?? 0
        return { patch: { amountPaid, paymentStatus: salesPaymentStatus({ ...latest, amountPaid }) }, event: { by, action: "payments updated", details: amountPaid.toFixed(2) } }
      })
    } else {
      await mutateOrder<PurchaseOrder>(purchaseOrders, order.ItemId, async (latest) => {
        const fresh = computeLedger((await payments.list({ filter: { party, partyId }, pageSize: 5000 })).items, [{ ...latest, party, partyId }])
        const amountPaid = fresh.orderPaid[latest.ItemId] ?? 0
        return { patch: { amountPaid, paymentStatus: purchasePaymentStatus({ ...latest, amountPaid }) }, event: { by, action: "payments updated", details: amountPaid.toFixed(2) } }
      })
    }
  }
  await saveBalances(ledger.balances.filter((balance) => balance.partyId === partyId))
}

export async function saveBalances(rows: ReturnType<typeof computeLedger>["balances"]) {
  const rebuiltAt = new Date().toISOString()
  for (const row of rows) {
    const values = { invoiced: row.invoiced, paid: row.paid, openBalance: row.openBalance, storeCredit: row.storeCredit, rebuiltAt }
    const key = { party: row.party as Party, partyId: row.partyId, currencyCode: row.currencyCode }
    const changed = await partyBalances.updateWhere(key, values)
    if (changed) continue
    try {
      await partyBalances.create({ ...key, ...values })
    } catch (error) {
      if (!(error instanceof BlocksDataError && error.isDuplicate)) throw error
      await partyBalances.updateWhere(key, values)
    }
  }
}
