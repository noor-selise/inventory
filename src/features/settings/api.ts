import { collection, type Entity } from "@/lib/blocks/data"

// Schemas from spec 0004. Field names match blocks/data/schemas/*.json.

export type Company = Entity & {
  name: string
  address?: string | null
  timeZone: string
  homeCurrency: string
  dateFormat?: string | null
}

export type Currency = Entity & {
  code: string
  symbol?: string | null
  decimals?: number | null
}

export type ExchangeRate = Entity & {
  currencyCode: string
  rate: number
  effectiveOn: string
  source?: string | null
}

export type NumberingRule = Entity & {
  documentType: string
  prefix?: string | null
  padding?: number | null
  nextNumber: number
}

export type PaymentTerm = Entity & {
  name: string
  daysDue: number
  isActive?: boolean | null
}

export type TaxingScheme = Entity & {
  name: string
  isDefault?: boolean | null
  tax1Name?: string | null
  tax1Rate?: number | null
  tax1OnShipping?: boolean | null
  tax2Name?: string | null
  tax2Rate?: number | null
  tax2CompoundsOnTax1?: boolean | null
  tax2OnShipping?: boolean | null
  isTaxInclusive?: boolean | null
  isActive?: boolean | null
}

export type TaxCode = Entity & {
  name: string
  taxingSchemeId: string
  tax1Rate?: number | null
  tax2Rate?: number | null
  isActive?: boolean | null
}

export type SimpleLookup = Entity & {
  name: string
  isSystem?: boolean | null
  isActive?: boolean | null
}

export const companies = collection<Company>("Company", [
  "name",
  "address",
  "timeZone",
  "homeCurrency",
  "dateFormat",
])

export const currencies = collection<Currency>("Currency", ["code", "symbol", "decimals"])

export const exchangeRates = collection<ExchangeRate>("ExchangeRate", [
  "currencyCode",
  "rate",
  "effectiveOn",
  "source",
])

export const numberingRules = collection<NumberingRule>("NumberingRule", [
  "documentType",
  "prefix",
  "padding",
  "nextNumber",
])

export const paymentTerms = collection<PaymentTerm>("PaymentTerm", ["name", "daysDue", "isActive"])

export const taxingSchemes = collection<TaxingScheme>("TaxingScheme", [
  "name",
  "isDefault",
  "tax1Name",
  "tax1Rate",
  "tax1OnShipping",
  "tax2Name",
  "tax2Rate",
  "tax2CompoundsOnTax1",
  "tax2OnShipping",
  "isTaxInclusive",
  "isActive",
])

export const taxCodes = collection<TaxCode>("TaxCode", [
  "name",
  "taxingSchemeId",
  "tax1Rate",
  "tax2Rate",
  "isActive",
])

const lookupFields = ["name", "isSystem", "isActive"] as const

export const adjustmentReasons = collection<SimpleLookup>("AdjustmentReason", lookupFields)
export const carriers = collection<SimpleLookup>("Carrier", lookupFields)
export const paymentMethods = collection<SimpleLookup>("PaymentMethod", lookupFields)
