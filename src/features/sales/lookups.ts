import { useResource } from "@/hooks/use-resource"
import { blocksClient } from "@/lib/blocks/client"
import { locations, sublocations, type Location } from "@/features/locations/api"
import { customers, vendors, type Customer, type Vendor } from "@/features/partners/api"
import { priceBreaks, pricingSchemes, productPrices, type PriceBreak, type PricingScheme, type ProductPrice } from "@/features/pricing/api"
import { products, vendorItems, type Product, type VendorItem } from "@/features/products/api"
import {
  carriers,
  companies,
  currencies,
  exchangeRates,
  paymentMethods,
  paymentTerms,
  taxCodes,
  taxingSchemes,
  type Company,
  type ExchangeRate,
  type PaymentTerm,
  type SimpleLookup,
  type TaxCode,
  type TaxingScheme,
} from "@/features/settings/api"
import type { SalesContext } from "./actions"

// Everything the sales, purchasing and payment screens look up by id, loaded
// once per screen.

export type OrderLookups = SalesContext & {
  company?: Company
  homeCurrency: string
  products: Product[]
  customers: Customer[]
  vendors: Vendor[]
  locations: Location[]
  taxSchemes: TaxingScheme[]
  taxCodes: TaxCode[]
  terms: PaymentTerm[]
  carriers: SimpleLookup[]
  methods: SimpleLookup[]
  schemes: PricingScheme[]
  prices: ProductPrice[]
  breaks: PriceBreak[]
  vendorItems: VendorItem[]
  currencies: string[]
  rates: ExchangeRate[]
  users: { value: string; label: string }[]
  customerOf: (id?: string | null) => Customer | undefined
  vendorOf: (id?: string | null) => Vendor | undefined
  locationName: (id?: string | null) => string
  binCode: (id?: string | null) => string
  userName: (id?: string | null) => string
  /** Latest rate on or before the date, as units of `code` per one home unit. */
  rateFor: (code: string, onDate?: string) => number
}

export function useOrderLookups() {
  return useResource(async (): Promise<OrderLookups> => {
    const [company, productRows, customerRows, vendorRows, locationRows, binRows, schemeRows, codeRows, termRows, carrierRows, methodRows, pricing, priceRows, breakRows, itemRows, currencyRows, rateRows, users] =
      await Promise.all([
        companies.list({ pageSize: 1 }),
        products.list({ sort: { name: 1 }, pageSize: 2000 }),
        customers.list({ sort: { name: 1 }, pageSize: 2000 }),
        vendors.list({ sort: { name: 1 }, pageSize: 2000 }),
        locations.list({ sort: { name: 1 }, pageSize: 500 }),
        sublocations.list({ pageSize: 3000 }),
        taxingSchemes.list({ sort: { name: 1 }, pageSize: 200 }),
        taxCodes.list({ sort: { name: 1 }, pageSize: 500 }),
        paymentTerms.list({ sort: { daysDue: 1 }, pageSize: 200 }),
        carriers.list({ sort: { name: 1 }, pageSize: 200 }),
        paymentMethods.list({ sort: { name: 1 }, pageSize: 200 }),
        pricingSchemes.list({ sort: { name: 1 }, pageSize: 200 }),
        productPrices.list({ pageSize: 5000 }),
        priceBreaks.list({ pageSize: 5000 }),
        vendorItems.list({ pageSize: 5000 }),
        currencies.list({ sort: { code: 1 }, pageSize: 200 }),
        exchangeRates.list({ sort: { effectiveOn: -1 }, pageSize: 2000 }),
        blocksClient.iam.users.list({ pageNo: 1, pageSize: 200 }).catch(() => ({ data: [] })),
      ])
    const home = company.items[0]?.homeCurrency ?? "USD"
    const byId = <T extends { ItemId: string }>(rows: T[]) => {
      const map = new Map(rows.map((row) => [row.ItemId, row]))
      return (id?: string | null) => (id ? map.get(id) : undefined)
    }
    const userRows = (users.data ?? [])
      .filter((user) => user.itemId)
      .map((user) => ({ value: String(user.itemId), label: [user.firstName, user.lastName].filter(Boolean).join(" ") || String(user.email ?? "") }))
    return {
      company: company.items[0],
      homeCurrency: home,
      products: productRows.items,
      customers: customerRows.items,
      vendors: vendorRows.items,
      locations: locationRows.items,
      taxSchemes: schemeRows.items,
      taxCodes: codeRows.items,
      terms: termRows.items,
      carriers: carrierRows.items,
      methods: methodRows.items,
      schemes: pricing.items,
      prices: priceRows.items,
      breaks: breakRows.items,
      vendorItems: itemRows.items,
      currencies: [...new Set([home, ...currencyRows.items.map((row) => row.code)])],
      rates: rateRows.items,
      users: userRows,
      productOf: byId(productRows.items),
      customerOf: byId(customerRows.items),
      vendorOf: byId(vendorRows.items),
      taxSchemeOf: byId(schemeRows.items),
      taxCodeOf: byId(codeRows.items),
      termOf: byId(termRows.items),
      locationName: (id) => locationRows.items.find((row) => row.ItemId === id)?.name ?? "",
      binCode: (id) => binRows.items.find((row) => row.ItemId === id)?.code ?? "",
      userName: (id) => userRows.find((row) => row.value === id)?.label ?? "",
      rateFor: (code, onDate) => {
        if (code === home) return 1
        const cutoff = onDate ?? new Date().toISOString()
        return rateRows.items.find((rate) => rate.currencyCode === code && rate.effectiveOn <= cutoff)?.rate ?? rateRows.items.find((rate) => rate.currencyCode === code)?.rate ?? 1
      },
    }
  }, [])
}

