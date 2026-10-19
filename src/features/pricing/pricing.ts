// Price resolution and tax for a sales line (spec 0010 AC-4 to AC-6, PRD §5.5).
// Pure functions with no app imports, shared by sales orders, the portal and
// imports, and runnable in Node for checks.

export type PriceRow = {
  ItemId: string
  pricingSchemeId: string
  priceType: "fixed" | "markup"
  unitPrice?: number | null
  markupPct?: number | null
}

export type BreakRow = { productPriceId: string; minQty: number; unitPrice: number }

export type Discount = { type: "percent" | "fixed"; value: number } | null | undefined

export type PriceInput = {
  /** The customer's scheme, if any. */
  customerSchemeId?: string | null
  defaultSchemeId?: string | null
  customerDiscountPct?: number | null
  lineDiscount?: Discount
  /** Every ProductPrice row for this product. */
  prices: PriceRow[]
  /** PriceBreak rows for this product's price rows. */
  breaks: BreakRow[]
  /** Product.averageCost, needed for markup prices. */
  averageCost?: number | null
  qty: number
}

export type PriceResult =
  | {
      ok: true
      schemeId: string
      basePrice: number
      afterCustomerDiscount: number
      afterLineDiscount: number
      breakPrice: number | null
      unitPrice: number
      source: "scheme" | "default_scheme" | "break"
    }
  | { ok: false; reason: "no_price" | "no_cost_for_markup" }

function baseFrom(row: PriceRow, averageCost?: number | null): number | null {
  if (row.priceType === "fixed") return row.unitPrice ?? null
  if (averageCost === null || averageCost === undefined) return null
  return averageCost * (1 + (row.markupPct ?? 0) / 100)
}

/**
 * Customer scheme price (else the default scheme), then the customer default
 * discount, then the line discount, then the volume break for the quantity.
 * A break never raises the price: the customer gets the lower of the
 * discounted price and the break price.
 */
export function resolvePrice(input: PriceInput): PriceResult {
  const fromCustomer = input.customerSchemeId
    ? input.prices.find((row) => row.pricingSchemeId === input.customerSchemeId)
    : undefined
  const row = fromCustomer ?? input.prices.find((price) => price.pricingSchemeId === input.defaultSchemeId)
  if (!row) return { ok: false, reason: "no_price" }

  const basePrice = baseFrom(row, input.averageCost)
  if (basePrice === null) return { ok: false, reason: row.priceType === "markup" ? "no_cost_for_markup" : "no_price" }

  const afterCustomerDiscount = basePrice * (1 - Math.min(Math.max(input.customerDiscountPct ?? 0, 0), 100) / 100)

  let afterLineDiscount = afterCustomerDiscount
  if (input.lineDiscount?.type === "percent") {
    afterLineDiscount = afterCustomerDiscount * (1 - Math.min(Math.max(input.lineDiscount.value, 0), 100) / 100)
  } else if (input.lineDiscount?.type === "fixed") {
    afterLineDiscount = Math.max(0, afterCustomerDiscount - Math.max(input.lineDiscount.value, 0))
  }

  const tier = input.breaks
    .filter((item) => item.productPriceId === row.ItemId && input.qty >= item.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0]
  const breakPrice = tier ? tier.unitPrice : null
  const useBreak = breakPrice !== null && breakPrice < afterLineDiscount

  return {
    ok: true,
    schemeId: row.pricingSchemeId,
    basePrice,
    afterCustomerDiscount,
    afterLineDiscount,
    breakPrice,
    unitPrice: useBreak ? breakPrice : afterLineDiscount,
    source: useBreak ? "break" : fromCustomer ? "scheme" : "default_scheme",
  }
}

export type TaxScheme = {
  tax1Rate?: number | null
  tax2Rate?: number | null
  tax2CompoundsOnTax1?: boolean | null
  tax1OnShipping?: boolean | null
  tax2OnShipping?: boolean | null
  isTaxInclusive?: boolean | null
}

export type TaxLine = {
  /** Line amount after discounts, in document currency. Includes tax when the scheme is tax inclusive. */
  amount: number
  /** Rates from the line's tax code; override the scheme's rates when set. */
  taxCode?: { tax1Rate?: number | null; tax2Rate?: number | null } | null
}

export type TaxResult = {
  lines: { net: number; tax1: number; tax2: number; gross: number }[]
  shipping: { net: number; tax1: number; tax2: number; gross: number }
  net: number
  tax1: number
  tax2: number
  total: number
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function split(amount: number, r1: number, r2: number, compound: boolean, inclusive: boolean) {
  const net = inclusive ? amount / (compound ? (1 + r1) * (1 + r2) : 1 + r1 + r2) : amount
  const tax1 = net * r1
  const tax2 = (compound ? net + tax1 : net) * r2
  return { net, tax1, tax2, gross: net + tax1 + tax2 }
}

/**
 * Two component tax. Tax 2 may compound on tax 1, each may apply to shipping,
 * a line's tax code overrides the scheme rates, and tax inclusive schemes back
 * calculate the net amount. Amounts are rounded to `decimals` per line.
 */
export function computeTax(lines: TaxLine[], scheme: TaxScheme, freight = 0, decimals = 2): TaxResult {
  const compound = scheme.tax2CompoundsOnTax1 === true
  const inclusive = scheme.isTaxInclusive === true
  const rate = (value?: number | null) => (value ?? 0) / 100

  const lineResults = lines.map((line) => {
    const r1 = rate(line.taxCode?.tax1Rate ?? scheme.tax1Rate)
    const r2 = rate(line.taxCode?.tax2Rate ?? scheme.tax2Rate)
    const parts = split(line.amount, r1, r2, compound, inclusive)
    const net = round(parts.net, decimals)
    const tax1 = round(parts.tax1, decimals)
    const tax2 = round(parts.tax2, decimals)
    return { net, tax1, tax2, gross: round(net + tax1 + tax2, decimals) }
  })

  const ship = split(
    freight,
    scheme.tax1OnShipping ? rate(scheme.tax1Rate) : 0,
    scheme.tax2OnShipping ? rate(scheme.tax2Rate) : 0,
    compound,
    inclusive
  )
  const shipping = {
    net: round(ship.net, decimals),
    tax1: round(ship.tax1, decimals),
    tax2: round(ship.tax2, decimals),
    gross: 0,
  }
  shipping.gross = round(shipping.net + shipping.tax1 + shipping.tax2, decimals)

  const sum = (pick: (row: { net: number; tax1: number; tax2: number }) => number) =>
    round(lineResults.reduce((total, row) => total + pick(row), 0) + pick(shipping), decimals)
  const net = sum((row) => row.net)
  const tax1 = sum((row) => row.tax1)
  const tax2 = sum((row) => row.tax2)
  return { lines: lineResults, shipping, net, tax1, tax2, total: round(net + tax1 + tax2, decimals) }
}
