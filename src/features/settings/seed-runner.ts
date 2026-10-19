// Idempotent seeding shared by the dashboard (signed in admin session) and
// scripts/seed-dummy.mjs (temporary machine client). No app imports and only
// relative ".ts" imports, so Node can run it with type stripping.
// Every step matches existing records by a natural key and adds only what is missing.

import { createPosting } from "../stock/posting.ts"
import {
  DEMO_COMPANY,
  DEMO_COST_AND_PRICE,
  DEMO_CUSTOMERS,
  DEMO_LOCATIONS,
  DEMO_OPENING_STOCK,
  DEMO_PRICE_BREAKS,
  DEMO_PRICING_SCHEMES,
  DEMO_VENDOR_SUPPLY,
  DEMO_VENDORS,
  DEMO_EXCHANGE_RATES,
  DEMO_TAX_CODES,
  SAMPLE_CATEGORIES,
  SAMPLE_PRODUCTS,
  STARTER_ADJUSTMENT_REASONS,
  STARTER_CARRIERS,
  STARTER_CURRENCIES,
  STARTER_DOCUMENT_TYPES,
  STARTER_PAYMENT_METHODS,
  STARTER_PAYMENT_TERMS,
  STARTER_TAXING_SCHEMES,
} from "./seed-data.ts"

type Row = Record<string, unknown> & { ItemId: string }

type CollectionLike = {
  list(options: { pageNo: number; pageSize: number }): Promise<unknown>
  create(payload: Record<string, unknown>): Promise<unknown>
}

type ClientLike = {
  data: {
    collection(schema: string, options: { fields: string[] }): CollectionLike
    graphql(request: { query: string; variables?: Record<string, unknown> }): Promise<unknown>
  }
}

export type SeedStore = {
  client: ClientLike
  list(schema: string, fields: string[], filter?: Record<string, unknown>): Promise<Row[]>
  create(schema: string, payload: Record<string, unknown>): Promise<string>
  /** Filtered update; returns how many records changed (compare and set, spec 0026). */
  updateWhere(schema: string, filter: Record<string, unknown>, input: Record<string, unknown>): Promise<number>
}

export type SeedReport = { label: string; added: number; existing: number }[]

export type SeedParts = {
  demoCompany?: boolean
  starterSettings?: boolean
  demoRatesAndTaxCodes?: boolean
  sampleCatalog?: boolean
  demoLocations?: boolean
  demoPartnersAndPrices?: boolean
  /** Posts opening stock through the real posting step (spec 0026). Needs locations and catalog. */
  openingStock?: boolean
}

function gatewayErrors(response: unknown): string | undefined {
  const errors = (response as { errors?: { message?: string }[] | null })?.errors
  return errors?.length ? errors.map((error) => error.message ?? "Unknown error").join("; ") : undefined
}

/** Wraps a Blocks SDK client. A GraphQL `errors` array is a failure even on HTTP 200. */
export function createStore(client: ClientLike): SeedStore {
  async function run(field: string, query: string, variables: Record<string, unknown>) {
    const response = await client.data.graphql({ query, variables })
    const failure = gatewayErrors(response)
    if (failure) throw new Error(`${field}: ${failure}`)
    return (response as { data?: Record<string, unknown> }).data?.[field] as Record<string, unknown> | undefined
  }
  return {
    client,
    async list(schema, fields, filter) {
      const field = `get${schema}s`
      const result = await run(
        field,
        `query q($input: DynamicQueryInput) { ${field}(input: $input) { items { ${["ItemId", ...fields].join(" ")} } } }`,
        { input: { pageNo: 1, pageSize: 500, filter: filter ? JSON.stringify(filter) : undefined } }
      )
      return (result?.items as Row[] | undefined) ?? []
    },
    async create(schema, payload) {
      const field = `insert${schema}`
      const result = await run(field, `mutation m($input: ${schema}InsertInput!) { ${field}(input: $input) { acknowledged itemId message } }`, {
        input: payload,
      })
      if (!result || result.acknowledged === false) {
        throw new Error(`${schema}: ${String(result?.message ?? "insert was not acknowledged")}`)
      }
      return String(result.itemId ?? "")
    },
    async updateWhere(schema, filter, input) {
      const field = `update${schema}`
      const result = await run(
        field,
        `mutation m($filter: String, $input: ${schema}UpdateInput!) { ${field}(filter: $filter, input: $input) { totalImpactedData } }`,
        { filter: JSON.stringify(filter), input }
      )
      return Number(result?.totalImpactedData ?? 0)
    },
  }
}

const lower = (value: unknown) => String(value ?? "").trim().toLowerCase()

export function ean13CheckDigit(first12: string): number {
  const sum = [...first12].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
  return (10 - (sum % 10)) % 10
}

async function ensure(
  store: SeedStore,
  label: string,
  schema: string,
  keyFields: string[],
  rows: Record<string, unknown>[],
  key: (row: Record<string, unknown>) => string
): Promise<{ report: SeedReport[number]; items: Row[] }> {
  let items = await store.list(schema, keyFields)
  const known = new Set(items.map(key))
  let added = 0
  for (const row of rows) {
    if (known.has(key(row))) continue
    const itemId = await store.create(schema, row)
    items = [...items, { ...row, ItemId: itemId }]
    known.add(key(row))
    added += 1
  }
  return { report: { label, added, existing: rows.length - added }, items }
}

export async function runSeed(store: SeedStore, parts: SeedParts): Promise<SeedReport> {
  const report: SeedReport = []
  const byName = (row: Record<string, unknown>) => lower(row.name)

  if (parts.demoCompany) {
    const existing = await store.list("Company", ["name"])
    if (existing.length === 0) await store.create("Company", DEMO_COMPANY)
    report.push({ label: "Company profile", added: existing.length ? 0 : 1, existing: existing.length ? 1 : 0 })
  }

  if (parts.starterSettings) {
    const company = (await store.list("Company", ["homeCurrency"]))[0]
    const home = String(company?.homeCurrency ?? "USD")
    const currencies = STARTER_CURRENCIES.some((currency) => currency.code === home)
      ? STARTER_CURRENCIES
      : [{ code: home, symbol: "", decimals: 2 }, ...STARTER_CURRENCIES]
    report.push((await ensure(store, "Currencies", "Currency", ["code"], currencies, (row) => String(row.code))).report)

    report.push(
      (
        await ensure(
          store,
          "Payment terms",
          "PaymentTerm",
          ["name"],
          STARTER_PAYMENT_TERMS.map((term) => ({ ...term, isActive: true })),
          byName
        )
      ).report
    )

    // Keep exactly one default: only mark "No tax" default when none exists yet.
    const schemes = await store.list("TaxingScheme", ["name", "isDefault"])
    const hasDefault = schemes.some((scheme) => scheme.isDefault === true)
    report.push(
      (
        await ensure(
          store,
          "Taxing schemes",
          "TaxingScheme",
          ["name", "isDefault"],
          STARTER_TAXING_SCHEMES.map((scheme) => ({
            tax1OnShipping: false,
            isTaxInclusive: false,
            ...scheme,
            isDefault: !hasDefault && scheme.isDefault === true,
            isActive: true,
          })),
          byName
        )
      ).report
    )

    report.push(
      (
        await ensure(
          store,
          "Adjustment reasons",
          "AdjustmentReason",
          ["name"],
          STARTER_ADJUSTMENT_REASONS.map((name) => ({ name, isSystem: true, isActive: true })),
          byName
        )
      ).report
    )
    report.push(
      (
        await ensure(
          store,
          "Carriers",
          "Carrier",
          ["name"],
          STARTER_CARRIERS.map((carrier) => ({ isSystem: false, ...carrier, isActive: true })),
          byName
        )
      ).report
    )
    report.push(
      (
        await ensure(
          store,
          "Payment methods",
          "PaymentMethod",
          ["name"],
          STARTER_PAYMENT_METHODS.map((method) => ({ isSystem: false, ...method, isActive: true })),
          byName
        )
      ).report
    )
    report.push(
      (
        await ensure(
          store,
          "Numbering rules",
          "NumberingRule",
          ["documentType"],
          STARTER_DOCUMENT_TYPES.map((type) => ({ ...type, padding: 5, nextNumber: 1 })),
          (row) => String(row.documentType)
        )
      ).report
    )
  }

  if (parts.demoRatesAndTaxCodes) {
    const today = new Date()
    const effectiveOn = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).toISOString()
    report.push(
      (
        await ensure(
          store,
          "Exchange rates",
          "ExchangeRate",
          ["currencyCode"],
          DEMO_EXCHANGE_RATES.map((rate) => ({ ...rate, effectiveOn, source: "manual" })),
          (row) => String(row.currencyCode)
        )
      ).report
    )
    const schemes = await store.list("TaxingScheme", ["name"])
    const rows = DEMO_TAX_CODES.flatMap(({ scheme, ...code }) => {
      const taxingSchemeId = schemes.find((item) => lower(item.name) === lower(scheme))?.ItemId
      return taxingSchemeId ? [{ ...code, taxingSchemeId, isActive: true }] : []
    })
    report.push((await ensure(store, "Tax codes", "TaxCode", ["name"], rows, byName)).report)
  }

  if (parts.sampleCatalog) {
    let categories = await store.list("Category", ["name", "parentId", "isDefault"])
    const hasDefault = categories.some((category) => category.isDefault === true)
    let added = 0
    // Listed parents first, so each child finds its parent's id.
    for (const row of SAMPLE_CATEGORIES) {
      const parentId = row.parent
        ? categories.find((category) => lower(category.name) === lower(row.parent))?.ItemId ?? null
        : null
      const exists = categories.some(
        (category) => lower(category.name) === lower(row.name) && (category.parentId ?? null) === parentId
      )
      if (exists) continue
      const record = { name: row.name, parentId, isDefault: !hasDefault && row.isDefault === true }
      const itemId = await store.create("Category", record)
      categories = [...categories, { ...record, ItemId: itemId }]
      added += 1
    }
    report.push({ label: "Categories", added, existing: SAMPLE_CATEGORIES.length - added })

    const products = await store.list("Product", ["name", "sku"])
    const barcodes = await store.list("ProductBarcode", ["barcode"])
    let productsAdded = 0
    let barcodesAdded = 0
    const withBarcode = SAMPLE_PRODUCTS.filter((sample) => sample.barcode).length
    for (const { category, barcode, ...fields } of SAMPLE_PRODUCTS) {
      let productId = products.find((item) => item.sku === fields.sku || lower(item.name) === lower(fields.name))?.ItemId
      if (!productId) {
        const stocked = fields.itemType === "stocked"
        productId = await store.create("Product", {
          ...fields,
          categoryId: categories.find((item) => lower(item.name) === lower(category))?.ItemId ?? null,
          trackLots: stocked && fields.trackLots === true,
          trackSerials: stocked && fields.trackSerials === true,
          trackExpiry: stocked && fields.trackLots === true && fields.trackExpiry === true,
          isActive: true,
        })
        productsAdded += 1
      }
      if (barcode) {
        const code = `${barcode}${ean13CheckDigit(barcode)}`
        if (!barcodes.some((item) => item.barcode === code)) {
          await store.create("ProductBarcode", { barcode: code, productId })
          barcodesAdded += 1
        }
      }
    }
    report.push({ label: "Products", added: productsAdded, existing: SAMPLE_PRODUCTS.length - productsAdded })
    report.push({ label: "Barcodes", added: barcodesAdded, existing: withBarcode - barcodesAdded })
  }

  if (parts.demoLocations) {
    const result = await ensure(
      store,
      "Locations",
      "Location",
      ["name", "isDefault"],
      DEMO_LOCATIONS.map(({ bins: _bins, ...location }) => ({ ...location, isDefault: location.isDefault === true, isActive: true })),
      byName
    )
    report.push(result.report)
    // Only one default: keep an existing default if there was one before.
    const defaults = result.items.filter((item) => item.isDefault === true)
    for (const extra of defaults.slice(1)) await store.updateWhere("Location", { ItemId: extra.ItemId }, { isDefault: false })
    const bins = DEMO_LOCATIONS.flatMap((location) => {
      const locationId = result.items.find((item) => lower(item.name) === lower(location.name))?.ItemId
      return locationId ? location.bins.map((code) => ({ locationId, code, isActive: true })) : []
    })
    report.push((await ensure(store, "Bins", "Sublocation", ["locationId", "code"], bins, (row) => `${row.locationId}:${row.code}`)).report)
  }

  if (parts.demoPartnersAndPrices) {
    const terms = await store.list("PaymentTerm", ["name"])
    const termId = (name: string) => terms.find((term) => lower(term.name) === lower(name))?.ItemId ?? null
    const taxing = await store.list("TaxingScheme", ["name", "isDefault"])
    const defaultTaxId = taxing.find((scheme) => scheme.isDefault === true)?.ItemId ?? null

    const schemeExisting = await store.list("PricingScheme", ["name", "isDefault"])
    const hasDefaultScheme = schemeExisting.some((scheme) => scheme.isDefault === true)
    const schemes = await ensure(
      store,
      "Pricing schemes",
      "PricingScheme",
      ["name", "currencyCode", "isDefault"],
      DEMO_PRICING_SCHEMES.map((scheme) => ({ ...scheme, isDefault: !hasDefaultScheme && scheme.isDefault === true, isActive: true })),
      byName
    )
    report.push(schemes.report)
    const schemeId = (name: string) => schemes.items.find((item) => lower(item.name) === lower(name))?.ItemId ?? null

    const vendors = await ensure(
      store,
      "Vendors",
      "Vendor",
      ["name"],
      DEMO_VENDORS.map(({ paymentTerm, ...vendor }) => ({ ...vendor, paymentTermId: termId(paymentTerm), isActive: true })),
      byName
    )
    report.push(vendors.report)

    report.push(
      (
        await ensure(
          store,
          "Customers",
          "Customer",
          ["name"],
          DEMO_CUSTOMERS.map((customer) => {
            const address = customer.line1
              ? { line1: customer.line1, city: customer.city, country: customer.country ?? "Bangladesh" }
              : null
            return {
              name: customer.name,
              email: customer.email || null,
              phone: customer.phone || null,
              contacts: [],
              billingAddress: address,
              shippingAddress: address,
              pricingSchemeId: schemeId(customer.scheme),
              taxingSchemeId: defaultTaxId,
              paymentTermId: termId(customer.term),
              currencyCode: customer.currency,
              defaultDiscountPct: customer.discount,
              creditLimit: customer.creditLimit || null,
              isActive: true,
            }
          }),
          byName
        )
      ).report
    )

    const productRows = await store.list("Product", ["sku", "itemType"])
    const productId = (sku: string) => productRows.find((item) => item.sku === sku)?.ItemId
    const retail = schemeId("Retail")
    const wholesale = schemeId("Wholesale")
    const euro = schemeId("Euro retail")
    const priceRows: Record<string, unknown>[] = []
    for (const [sku, [, price]] of Object.entries(DEMO_COST_AND_PRICE)) {
      const id = productId(sku)
      if (!id) continue
      if (retail) priceRows.push({ productId: id, pricingSchemeId: retail, priceType: "fixed", unitPrice: price })
      if (euro) priceRows.push({ productId: id, pricingSchemeId: euro, priceType: "fixed", unitPrice: Math.round(price * 0.92 * 1.15 * 100) / 100 })
      const stocked = productRows.find((item) => item.ItemId === id)?.itemType !== "service"
      if (wholesale && stocked) priceRows.push({ productId: id, pricingSchemeId: wholesale, priceType: "markup", markupPct: 30 })
    }
    const prices = await ensure(store, "Product prices", "ProductPrice", ["productId", "pricingSchemeId"], priceRows, (row) => `${row.productId}:${row.pricingSchemeId}`)
    report.push(prices.report)

    const breakRows = DEMO_PRICE_BREAKS.flatMap(([sku, minQty, unitPrice]) => {
      const priceId = prices.items.find((row) => row.productId === productId(sku) && row.pricingSchemeId === wholesale)?.ItemId
      return priceId ? [{ productPriceId: priceId, minQty, unitPrice }] : []
    })
    report.push((await ensure(store, "Price breaks", "PriceBreak", ["productPriceId", "minQty"], breakRows, (row) => `${row.productPriceId}:${row.minQty}`)).report)

    const itemRows = DEMO_VENDOR_SUPPLY.flatMap(([vendorName, first, last]) => {
      const vendor = vendors.items.find((item) => lower(item.name) === lower(vendorName))
      const vendorData = DEMO_VENDORS.find((item) => item.name === vendorName)
      if (!vendor || !vendorData) return []
      return Array.from({ length: last - first + 1 }, (_, offset) => {
        const sku = `SAMPLE-${String(first + offset).padStart(4, "0")}`
        const id = productId(sku)
        return id
          ? [{
              vendorId: vendor.ItemId,
              productId: id,
              vendorItemCode: `${vendorName.slice(0, 3).toUpperCase()}-${String(first + offset).padStart(5, "0")}`,
              unitCost: DEMO_COST_AND_PRICE[sku]?.[0] ?? null,
              currencyCode: vendorData.currencyCode,
              leadTimeDays: vendorData.leadTimeDays,
              preference: 1,
            }]
          : []
      }).flat()
    })
    report.push((await ensure(store, "Vendor items", "VendorItem", ["vendorId", "productId"], itemRows, (row) => `${row.vendorId}:${row.productId}`)).report)
  }

  if (parts.openingStock) {
    const posting = createPosting(store.client)
    const locationRows = await store.list("Location", ["name"])
    const productRows = await store.list("Product", ["sku", "shelfLifeDays"])
    const reason = (await store.list("AdjustmentReason", ["name"])).find((item) => lower(item.name) === "opening stock")
    if (!reason) throw new Error("Run starter settings first: the Opening stock reason is missing.")
    let documents = 0
    let existingDocuments = 0
    let linesPosted = 0
    for (const [locationName, opening] of Object.entries(DEMO_OPENING_STOCK)) {
      const location = locationRows.find((item) => lower(item.name) === lower(locationName))
      if (!location) throw new Error(`Run demo locations first: ${locationName} is missing.`)
      const remarks = `Opening stock (demo) for ${locationName}`
      const prior = (await store.list("StockAdjustment", ["number", "status"], { remarks }))[0]
      if (prior?.status === "posted") {
        existingDocuments += 1
        continue
      }
      // Build the document lines, resolving bins and lots.
      const binRows = await store.list("Sublocation", ["code"], { locationId: location.ItemId })
      const lines: Record<string, unknown>[] = []
      const costs: { productId: string; qty: number; cost: number }[] = []
      for (const entry of opening) {
        const product = productRows.find((item) => item.sku === entry.sku)
        if (!product) continue
        const sublocationId = entry.bin ? binRows.find((bin) => bin.code === entry.bin)?.ItemId ?? null : null
        const cost = DEMO_COST_AND_PRICE[entry.sku]?.[0] ?? 0
        const base = { productId: product.ItemId, sublocationId, uom: null }
        if (entry.serials) {
          entry.serials.forEach((serial, index) =>
            lines.push({ ...base, lineId: `${entry.sku}:sn:${index}`, serial, lotId: null, qtyDelta: 1, enteredQty: 1 })
          )
        } else if (entry.lots) {
          for (const lot of entry.lots) {
            const existingLot = (await store.list("Lot", ["lotNumber"], { productId: product.ItemId, lotNumber: lot.lotNumber }))[0]
            let lotId = existingLot?.ItemId
            if (!lotId) {
              const expires = lot.expiresInDays ? new Date(Date.now() + lot.expiresInDays * 86_400_000).toISOString() : null
              lotId = await store.create("Lot", { productId: product.ItemId, lotNumber: lot.lotNumber, expiresOn: expires, madeOn: null, sellBy: null })
            }
            lines.push({ ...base, lineId: `${entry.sku}:lot:${lot.lotNumber}`, lotId, serial: null, qtyDelta: lot.qty, enteredQty: lot.qty })
          }
        } else {
          lines.push({ ...base, lineId: `${entry.sku}`, lotId: null, serial: null, qtyDelta: entry.qty, enteredQty: entry.qty })
        }
        costs.push({ productId: product.ItemId, qty: entry.qty, cost })
      }

      let documentId = prior?.ItemId
      let number = String(prior?.number ?? "")
      if (!documentId) {
        // Reserve the next adjustment number with a compare and set on its rule.
        let reserved: string | undefined
        for (let attempt = 0; attempt < 5 && !reserved; attempt++) {
          const rule = (await store.list("NumberingRule", ["prefix", "padding", "nextNumber"], { documentType: "stock_adjustment" }))[0]
          if (!rule) throw new Error("Run starter settings first: the stock_adjustment numbering rule is missing.")
          const next = Number(rule.nextNumber)
          if ((await store.updateWhere("NumberingRule", { ItemId: rule.ItemId, nextNumber: next }, { nextNumber: next + 1 })) === 1) {
            reserved = `${String(rule.prefix ?? "")}${String(next).padStart(Number(rule.padding ?? 5), "0")}`
          }
        }
        if (!reserved) throw new Error("Could not reserve an adjustment number.")
        number = reserved
        documentId = await store.create("StockAdjustment", {
          number,
          locationId: location.ItemId,
          reasonId: reason.ItemId,
          adjustedAt: new Date().toISOString(),
          status: "posting",
          remarks,
          lines,
        })
        documents += 1
      }
      await posting.postDocument(
        lines.map((line) => ({
          lineId: String(line.lineId),
          productId: String(line.productId),
          locationId: location.ItemId,
          sublocationId: (line.sublocationId as string | null) ?? null,
          lotId: (line.lotId as string | null) ?? null,
          serial: (line.serial as string | null) ?? null,
          qtyDelta: Number(line.qtyDelta),
          enteredQty: Number(line.enteredQty),
          unitCost: costs.find((cost) => cost.productId === line.productId)?.cost ?? null,
        })),
        { sourceType: "adjustment", sourceId: documentId, sourceNumber: number, note: remarks }
      )
      linesPosted += lines.length
      await store.updateWhere("StockAdjustment", { ItemId: documentId }, { status: "posted" })
      // Opening stock sets the moving average cost, like a receipt.
      if (!prior) {
        for (const { productId, qty, cost } of costs) {
          if (cost > 0) await posting.applyReceiptCost(productId, qty, cost)
        }
      }
    }
    report.push({ label: "Opening stock documents", added: documents, existing: existingDocuments })
    report.push({ label: "Opening stock lines posted", added: linesPosted, existing: 0 })
  }

  return report
}
