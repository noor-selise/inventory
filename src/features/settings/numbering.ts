import { BlocksDataError } from "@/lib/blocks/data"
import { numberingRules, type NumberingRule } from "./api"

// Running document numbers (spec 0004 AC-3). Blocks has no atomic counter, so the
// document's unique index is the real guard: read the rule, try the insert with the
// next number, and on a duplicate read again and retry. Numbers can have gaps.

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

/**
 * Gives `insert` the next number for `documentType` and retries on a unique
 * index conflict. `insert` must create the document and throw on a duplicate.
 */
export async function withNextNumber<T>(
  documentType: string,
  insert: (number: string) => Promise<T>
): Promise<{ number: string; result: T }> {
  let lastError: unknown
  let skip = 0
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rule = await loadRule(documentType)
    const value = rule.nextNumber + skip
    const number = formatDocumentNumber(rule, value)
    try {
      const result = await insert(number)
      await numberingRules.update(rule.ItemId, { nextNumber: value + 1 })
      return { number, result }
    } catch (error) {
      if (!(error instanceof BlocksDataError && error.isDuplicate)) throw error
      lastError = error
      skip += 1
    }
  }
  throw lastError
}
