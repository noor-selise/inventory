// Idempotent seeding shared by the dashboard (signed in admin session) and
// scripts/seed-dummy.mjs (temporary machine client). No app imports and only
// relative ".ts" imports, so Node can run it with type stripping.
// Every step matches existing records by a natural key and adds only what is missing.

import {
  DEMO_COMPANY,
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
  data: { collection(schema: string, options: { fields: string[] }): CollectionLike }
}

export type SeedStore = {
  list(schema: string, fields: string[]): Promise<Row[]>
  create(schema: string, payload: Record<string, unknown>): Promise<string>
}

export type SeedReport = { label: string; added: number; existing: number }[]

export type SeedParts = {
  demoCompany?: boolean
  starterSettings?: boolean
  demoRatesAndTaxCodes?: boolean
  sampleCatalog?: boolean
}

function gatewayErrors(response: unknown): string | undefined {
  const errors = (response as { errors?: { message?: string }[] | null })?.errors
  return errors?.length ? errors.map((error) => error.message ?? "Unknown error").join("; ") : undefined
}

/** Wraps a Blocks SDK client. A GraphQL `errors` array is a failure even on HTTP 200. */
export function createStore(client: ClientLike): SeedStore {
  return {
    async list(schema, fields) {
      const response = await client.data.collection(schema, { fields }).list({ pageNo: 1, pageSize: 500 })
      const failure = gatewayErrors(response)
      if (failure) throw new Error(`${schema}: ${failure}`)
      const data = (response as { data?: Record<string, { items?: Row[] }> }).data
      return data?.[`get${schema}s`]?.items ?? []
    },
    async create(schema, payload) {
      const response = await client.data.collection(schema, { fields: [] }).create(payload)
      const failure = gatewayErrors(response)
      if (failure) throw new Error(`${schema}: ${failure}`)
      const result = (response as { data?: Record<string, { acknowledged?: boolean; itemId?: string; message?: string }> })
        .data?.[`insert${schema}`]
      if (!result || result.acknowledged === false) {
        throw new Error(`${schema}: ${result?.message ?? "insert was not acknowledged"}`)
      }
      return String(result.itemId ?? "")
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

  return report
}
