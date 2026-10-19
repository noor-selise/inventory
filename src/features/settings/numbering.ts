import { BlocksDataError } from "@/lib/blocks/data"
import { numberingRules, type NumberingRule } from "./api"

// Running document numbers (spec 0004 AC-3). The counter is reserved with a
// compare and set on the rule; the document's unique index stays as a backstop.
// Numbers can have gaps after a failed save.

export const DOCUMENT_TYPES = [
  { value: "product", label: "Product SKU", prefix: "SKU-" },
  { value: "sales_order", label: "Sales order", prefix: "SO-" },
  { value: "sales_quote", label: "Sales quote", prefix: "SQ-" },
  { value: "purchase_order", label: "Purchase order", prefix: "PO-" },
  { value: "stock_adjustment", label: "Stock adjustment", prefix: "ADJ-" },
  { value: "stock_transfer", label: "Stock transfer", prefix: "TR-" },
  { value: "stock_count", label: "Stock count", prefix: "SC-" },
  { value: "manufacture_order", label: "Manufacture order", prefix: "MO-" },
  { value: "customer_payment", label: "Customer payment", prefix: "CP-" },
  { value: "vendor_payment", label: "Vendor payment", prefix: "VP-" },
] as const

export const DEFAULT_PADDING = 5
const MAX_ATTEMPTS = 3

export function formatDocumentNumber(rule: Pick<NumberingRule, "prefix" | "padding">, value: number) {
  return `${rule.prefix ?? ""}${String(value).padStart(rule.padding ?? DEFAULT_PADDING, "0")}`
}

async function loadRule(documentType: string): Promise<NumberingRule> {
  const { items } = await numberingRules.list({ filter: { documentType }, pageSize: 1 })
  if (items[0]) return items[0]

  const preset = DOCUMENT_TYPES.find((type) => type.value === documentType)
  const rule = {
    documentType,
    prefix: preset?.prefix ?? "",
    padding: DEFAULT_PADDING,
    nextNumber: 1,
  }
  try {
    const itemId = await numberingRules.create(rule)
    return { ItemId: itemId, ...rule }
  } catch (error) {
    // Someone else created it at the same moment; use theirs.
    if (error instanceof BlocksDataError && error.isDuplicate) {
      const retry = await numberingRules.list({ filter: { documentType }, pageSize: 1 })
      if (retry.items[0]) return retry.items[0]
    }
    throw error
  }
}

/** Reserves the next number with a compare and set on the rule (spec 0026 evidence). */
async function reserveNumber(documentType: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const rule = await loadRule(documentType)
    const changed = await numberingRules.updateWhere(
      { ItemId: rule.ItemId, nextNumber: rule.nextNumber },
      { nextNumber: rule.nextNumber + 1 }
    )
    if (changed === 1) return formatDocumentNumber(rule, rule.nextNumber)
  }
  throw new Error("Could not reserve a document number. Try again.")
}

/**
 * Gives `insert` the next number for `documentType`. The number is reserved
 * first, so two saves at once never get the same one. If the document's unique
 * index still reports a clash (someone lowered the next number), the next free
 * number is tried. A failed save leaves a gap, which is allowed.
 */
export async function withNextNumber<T>(
  documentType: string,
  insert: (number: string) => Promise<T>
): Promise<{ number: string; result: T }> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const number = await reserveNumber(documentType)
    try {
      return { number, result: await insert(number) }
    } catch (error) {
      if (!(error instanceof BlocksDataError && error.isDuplicate)) throw error
      lastError = error
    }
  }
  throw lastError
}
