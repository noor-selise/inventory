import { collection, type Entity } from "@/lib/blocks/data"

// Pricing schemes, product prices and volume breaks (spec 0010).

export type PricingScheme = Entity & {
  name: string
  currencyCode: string
  isTaxInclusive?: boolean | null
  isDefault?: boolean | null
  isActive?: boolean | null
}

export type PriceType = "fixed" | "markup"

export type ProductPrice = Entity & {
  productId: string
  pricingSchemeId: string
  priceType: PriceType
  unitPrice?: number | null
  markupPct?: number | null
}

export type PriceBreak = Entity & {
  productPriceId: string
  minQty: number
  unitPrice: number
}

export const pricingSchemes = collection<PricingScheme>("PricingScheme", [
  "name",
  "currencyCode",
  "isTaxInclusive",
  "isDefault",
  "isActive",
])
export const productPrices = collection<ProductPrice>("ProductPrice", [
  "productId",
  "pricingSchemeId",
  "priceType",
  "unitPrice",
  "markupPct",
])
export const priceBreaks = collection<PriceBreak>("PriceBreak", ["productPriceId", "minQty", "unitPrice"])
