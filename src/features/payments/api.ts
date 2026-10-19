import { collection, type Entity } from "@/lib/blocks/data"

// Payments with their split across orders inside one document, so a payment
// and its allocations always save together (spec 0013 AC-2). PartyBalance is
// a derived record kept by the app and by workflows, never typed by hand.

export const PAYMENT_TYPES = [
  { value: "payment", label: "Payment" },
  { value: "batch", label: "Batch payment" },
  { value: "refund", label: "Refund" },
  { value: "apply_credit", label: "Apply store credit" },
  { value: "convert_to_credit", label: "Convert to store credit" },
] as const

export type PaymentType = (typeof PAYMENT_TYPES)[number]["value"]
export type Party = "customer" | "vendor"

export type PaymentAllocation = {
  orderType: "sales" | "purchase"
  orderId: string
  orderNumber?: string | null
  amount: number
}

export type Payment = Entity & {
  number: string
  party: Party
  partyId: string
  type: PaymentType
  methodId?: string | null
  reference?: string | null
  amount: number
  currencyCode: string
  paidOn: string
  isVoided?: boolean | null
  voidedAt?: string | null
  remarks?: string | null
  /** Unique: the same save sent twice creates one payment. */
  postingKey: string
  /** Bumped on every change; the compare and set guard. */
  revision?: number | null
  allocations: PaymentAllocation[]
}

export type PartyBalance = Entity & {
  party: Party
  partyId: string
  currencyCode: string
  invoiced: number
  paid: number
  openBalance: number
  storeCredit: number
  rebuiltAt?: string | null
}

export const payments = collection<Payment>("Payment", [
  "number",
  "party",
  "partyId",
  "type",
  "methodId",
  "reference",
  "amount",
  "currencyCode",
  "paidOn",
  "isVoided",
  "voidedAt",
  "remarks",
  "postingKey",
  "revision",
  "allocations { orderType orderId orderNumber amount }",
])

export const partyBalances = collection<PartyBalance>("PartyBalance", [
  "party",
  "partyId",
  "currencyCode",
  "invoiced",
  "paid",
  "openBalance",
  "storeCredit",
  "rebuiltAt",
])
