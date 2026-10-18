import type { Collection, Entity } from "@/lib/blocks/data"
import {
  categories,
  productBarcodes,
  products,
  type Category,
  type Product,
} from "@/features/products/api"
import { ean13CheckDigit } from "@/features/products/barcode"
import {
  adjustmentReasons,
  carriers,
  companies,
  currencies,
  numberingRules,
  paymentMethods,
  paymentTerms,
  taxingSchemes,
} from "./api"
import { DEFAULT_PADDING, DOCUMENT_TYPES } from "./numbering"

// Starter data, written through the signed in admin's session so every record
// gets the right OrganizationId and CreatedBy. Each step adds only what is
// missing (matched by its natural key), so running it again changes nothing.

export type SeedReport = { label: string; added: number; existing: number }[]

async function ensure<T extends Entity>(
  label: string,
  source: Collection<T>,
  rows: Omit<Partial<T>, keyof Entity>[],
  key: (row: Partial<T>) => string
): Promise<{ report: SeedReport[number]; items: T[] }> {
  const { items } = await source.list({ pageSize: 500 })
  const known = new Set(items.map((item) => key(item)))
  let added = 0
  for (const row of rows) {
    if (known.has(key(row as Partial<T>))) continue
    await source.create(row)
    known.add(key(row as Partial<T>))
    added += 1
  }
  const fresh = added ? (await source.list({ pageSize: 500 })).items : items
  return { report: { label, added, existing: rows.length - added }, items: fresh }
}

const lower = (value: unknown) => String(value ?? "").trim().toLowerCase()

/** Lookup lists every company needs before its first order. */
export async function seedStarterSettings(): Promise<SeedReport> {
  const report: SeedReport = []
  const company = (await companies.list({ pageSize: 1 })).items[0]
  const home = company?.homeCurrency ?? "USD"

  const currencyCodes = [...new Set([home, "USD", "EUR", "GBP"])]
  report.push(
    (
      await ensure(
        "Currencies",
        currencies,
        currencyCodes.map((code) => ({
          code,
          decimals: new Intl.NumberFormat(undefined, { style: "currency", currency: code }).resolvedOptions()
            .maximumFractionDigits,
        })),
        (row) => String(row.code)
      )
    ).report
  )

  report.push(
    (
      await ensure(
        "Payment terms",
        paymentTerms,
        [
          { name: "Due on receipt", daysDue: 0, isActive: true },
          { name: "Net 15", daysDue: 15, isActive: true },
          { name: "Net 30", daysDue: 30, isActive: true },
          { name: "Net 60", daysDue: 60, isActive: true },
        ],
        (row) => lower(row.name)
      )
    ).report
  )

  // One default scheme. "No tax" is a safe default; set your real rates in Lists and taxes.
  const schemes = await taxingSchemes.list({ pageSize: 100 })
  const hasDefault = schemes.items.some((scheme) => scheme.isDefault)
  report.push(
    (
      await ensure(
        "Taxing schemes",
        taxingSchemes,
        [
          {
            name: "No tax",
            tax1Name: "Tax",
            tax1Rate: 0,
            tax1OnShipping: false,
            isTaxInclusive: false,
            isDefault: !hasDefault,
            isActive: true,
          },
        ],
        (row) => lower(row.name)
      )
    ).report
  )

  report.push(
    (
      await ensure(
        "Adjustment reasons",
        adjustmentReasons,
        ["Opening stock", "Count correction", "Damaged", "Expired", "Lost or stolen", "Found", "Internal use"].map(
          (name) => ({ name, isSystem: true, isActive: true })
        ),
        (row) => lower(row.name)
      )
    ).report
  )

  report.push(
    (
      await ensure(
        "Carriers",
        carriers,
        ["Customer pickup", "Own delivery", "DHL", "FedEx", "UPS"].map((name, index) => ({
          name,
          isSystem: index < 2,
          isActive: true,
        })),
        (row) => lower(row.name)
      )
    ).report
  )

  report.push(
    (
      await ensure(
        "Payment methods",
        paymentMethods,
        ["Cash", "Bank transfer", "Card", "Cheque", "Store credit"].map((name, index) => ({
          name,
          isSystem: index === 0 || name === "Store credit",
          isActive: true,
        })),
        (row) => lower(row.name)
      )
    ).report
  )

  report.push(
    (
      await ensure(
        "Numbering rules",
        numberingRules,
        DOCUMENT_TYPES.map((type) => ({
          documentType: type.value,
          prefix: type.prefix,
          padding: DEFAULT_PADDING,
          nextNumber: 1,
        })),
        (row) => String(row.documentType)
      )
    ).report
  )

  return report
}

type SampleProduct = Omit<Partial<Product>, keyof Entity> & {
  category: string
  barcodeBody: string
}

const SAMPLE_CATEGORIES: { name: string; parent?: string }[] = [
  { name: "General" },
  { name: "Hardware" },
  { name: "Fasteners", parent: "Hardware" },
  { name: "Tools", parent: "Hardware" },
  { name: "Packaging" },
  { name: "Services" },
]

// Barcodes use the in store range (leading 2) so they never clash with real ones.
const SAMPLE_PRODUCTS: SampleProduct[] = [
  { name: "Hex bolt M8 x 40", sku: "SAMPLE-0001", itemType: "stocked", standardUom: "each", purchaseUom: "box", purchaseUomRatio: 100, category: "Fasteners", barcodeBody: "200000000001", weight: 0.02 },
  { name: "Hex nut M8", sku: "SAMPLE-0002", itemType: "stocked", standardUom: "each", purchaseUom: "box", purchaseUomRatio: 200, category: "Fasteners", barcodeBody: "200000000002", weight: 0.005 },
  { name: "Flat washer M8", sku: "SAMPLE-0003", itemType: "stocked", standardUom: "each", purchaseUom: "box", purchaseUomRatio: 500, category: "Fasteners", barcodeBody: "200000000003" },
  { name: "Wood screw 4 x 30", sku: "SAMPLE-0004", itemType: "stocked", standardUom: "each", purchaseUom: "box", purchaseUomRatio: 250, salesUom: "pack", salesUomRatio: 50, category: "Fasteners", barcodeBody: "200000000004" },
  { name: "Cordless drill 18V", sku: "SAMPLE-0005", itemType: "stocked", standardUom: "each", category: "Tools", barcodeBody: "200000000005", trackSerials: true, weight: 1.6, length: 25, width: 8, height: 22 },
  { name: "Claw hammer 450 g", sku: "SAMPLE-0006", itemType: "stocked", standardUom: "each", category: "Tools", barcodeBody: "200000000006", weight: 0.6 },
  { name: "Wood glue 500 ml", sku: "SAMPLE-0007", itemType: "stocked", standardUom: "each", purchaseUom: "case", purchaseUomRatio: 12, category: "Hardware", barcodeBody: "200000000007", trackLots: true, trackExpiry: true, shelfLifeDays: 365, sellBeforeExpiryDays: 30, expiryNoticeDays: 60 },
  { name: "Shipping box 30 x 20 x 15", sku: "SAMPLE-0008", itemType: "stocked", standardUom: "each", purchaseUom: "bundle", purchaseUomRatio: 25, category: "Packaging", barcodeBody: "200000000008" },
  { name: "Packing tape 48 mm", sku: "SAMPLE-0009", itemType: "non_stocked", standardUom: "roll", category: "Packaging", barcodeBody: "200000000009" },
  { name: "Assembly service", sku: "SAMPLE-0010", itemType: "service", standardUom: "hour", category: "Services", barcodeBody: "200000000010", description: "On site assembly, billed per hour." },
]

/** A small sample catalog to try the product screens. SKUs start with SAMPLE-. */
export async function seedSampleCatalog(): Promise<SeedReport> {
  const report: SeedReport = []

  // Categories go parents first so children can point at them.
  let { items: categoryItems } = await categories.list({ pageSize: 500 })
  const hasDefault = categoryItems.some((item) => item.isDefault)
  let added = 0
  for (const row of SAMPLE_CATEGORIES) {
    const parentId = row.parent
      ? categoryItems.find((item) => item.name === row.parent && !item.parentId)?.ItemId ?? null
      : null
    const exists = categoryItems.some(
      (item) => lower(item.name) === lower(row.name) && (item.parentId ?? null) === parentId
    )
    if (exists) continue
    const record: Omit<Category, "ItemId"> = {
      name: row.name,
      parentId,
      isDefault: !hasDefault && row.name === "General",
    }
    const itemId = await categories.create(record)
    categoryItems = [...categoryItems, { ItemId: itemId, ...record }]
    added += 1
  }
  report.push({ label: "Categories", added, existing: SAMPLE_CATEGORIES.length - added })

  const categoryId = (name: string) => categoryItems.find((item) => item.name === name)?.ItemId ?? null
  const { items: existingProducts } = await products.list({ pageSize: 500 })
  const { items: existingBarcodes } = await productBarcodes.list({ pageSize: 500 })
  let productsAdded = 0
  let barcodesAdded = 0
  for (const sample of SAMPLE_PRODUCTS) {
    const { category, barcodeBody, ...fields } = sample
    let productId = existingProducts.find(
      (item) => item.sku === fields.sku || lower(item.name) === lower(fields.name)
    )?.ItemId
    if (!productId) {
      const stocked = fields.itemType === "stocked"
      productId = await products.create({
        ...fields,
        categoryId: categoryId(category),
        trackLots: stocked && fields.trackLots === true,
        trackSerials: stocked && fields.trackSerials === true,
        trackExpiry: stocked && fields.trackLots === true && fields.trackExpiry === true,
        isActive: true,
      })
      productsAdded += 1
    }
    const barcode = `${barcodeBody}${ean13CheckDigit(barcodeBody)}`
    if (!existingBarcodes.some((item) => item.barcode === barcode)) {
      await productBarcodes.create({ barcode, productId })
      barcodesAdded += 1
    }
  }
  report.push({ label: "Products", added: productsAdded, existing: SAMPLE_PRODUCTS.length - productsAdded })
  report.push({ label: "Barcodes", added: barcodesAdded, existing: SAMPLE_PRODUCTS.length - barcodesAdded })
  return report
}
