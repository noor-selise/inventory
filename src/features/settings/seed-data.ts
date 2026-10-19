// Starter and dummy data shared by the dashboard's Starter data card and
// scripts/seed-dummy.mjs. Plain values only (no imports), so Node can load it directly.

export const DEMO_COMPANY = {
  name: "Demo Hardware Co.",
  address: "12 Market Street\nSpringfield",
  timeZone: "Asia/Dhaka",
  homeCurrency: "USD",
  dateFormat: "yyyy-MM-dd",
}

export const STARTER_CURRENCIES = [
  { code: "USD", symbol: "$", decimals: 2 },
  { code: "EUR", symbol: "€", decimals: 2 },
  { code: "GBP", symbol: "£", decimals: 2 },
  { code: "BDT", symbol: "৳", decimals: 2 },
]

// Sample rates for trying the screens, not market rates.
export const DEMO_EXCHANGE_RATES = [
  { currencyCode: "EUR", rate: 0.92 },
  { currencyCode: "GBP", rate: 0.79 },
  { currencyCode: "BDT", rate: 121.5 },
]

export const STARTER_PAYMENT_TERMS = [
  { name: "Due on receipt", daysDue: 0 },
  { name: "Net 15", daysDue: 15 },
  { name: "Net 30", daysDue: 30 },
  { name: "Net 60", daysDue: 60 },
]

export const STARTER_TAXING_SCHEMES = [
  { name: "No tax", tax1Name: "Tax", tax1Rate: 0, isDefault: true },
  { name: "Standard VAT", tax1Name: "VAT", tax1Rate: 15, tax1OnShipping: true },
  { name: "Sales tax + city tax", tax1Name: "State", tax1Rate: 6, tax2Name: "City", tax2Rate: 2, tax2CompoundsOnTax1: false },
]

export const DEMO_TAX_CODES = [
  { name: "Reduced VAT", scheme: "Standard VAT", tax1Rate: 5 },
  { name: "Zero rated", scheme: "Standard VAT", tax1Rate: 0 },
]

export const STARTER_ADJUSTMENT_REASONS = [
  "Opening stock",
  "Count correction",
  "Damaged",
  "Expired",
  "Lost or stolen",
  "Found",
  "Internal use",
]

export const STARTER_CARRIERS = [
  { name: "Customer pickup", isSystem: true },
  { name: "Own delivery", isSystem: true },
  { name: "DHL" },
  { name: "FedEx" },
  { name: "UPS" },
]

export const STARTER_PAYMENT_METHODS = [
  { name: "Cash", isSystem: true },
  { name: "Store credit", isSystem: true },
  { name: "Bank transfer" },
  { name: "Card" },
  { name: "Cheque" },
]

export const STARTER_DOCUMENT_TYPES = [
  { documentType: "product", prefix: "SKU-" },
  { documentType: "sales_order", prefix: "SO-" },
  { documentType: "sales_quote", prefix: "SQ-" },
  { documentType: "purchase_order", prefix: "PO-" },
  { documentType: "stock_adjustment", prefix: "ADJ-" },
  { documentType: "stock_transfer", prefix: "TR-" },
  { documentType: "stock_count", prefix: "SC-" },
  { documentType: "manufacture_order", prefix: "MO-" },
  { documentType: "customer_payment", prefix: "CP-" },
  { documentType: "vendor_payment", prefix: "VP-" },
]

export const SAMPLE_CATEGORIES: { name: string; parent?: string; isDefault?: boolean }[] = [
  { name: "General", isDefault: true },
  { name: "Hardware" },
  { name: "Fasteners", parent: "Hardware" },
  { name: "Tools", parent: "Hardware" },
  { name: "Power tools", parent: "Tools" },
  { name: "Hand tools", parent: "Tools" },
  { name: "Adhesives", parent: "Hardware" },
  { name: "Electrical" },
  { name: "Safety" },
  { name: "Packaging" },
  { name: "Services" },
]

export type SampleProduct = {
  name: string
  sku: string
  itemType: "stocked" | "non_stocked" | "service"
  standardUom: string
  category: string
  /** 12 digits starting with 2 (in store range); the check digit is added on insert. */
  barcode?: string
  purchaseUom?: string
  purchaseUomRatio?: number
  salesUom?: string
  salesUomRatio?: number
  description?: string
  weight?: number
  length?: number
  width?: number
  height?: number
  trackLots?: boolean
  trackSerials?: boolean
  trackExpiry?: boolean
  shelfLifeDays?: number
  sellBeforeExpiryDays?: number
  expiryNoticeDays?: number
}

const p = (n: number) => `SAMPLE-${String(n).padStart(4, "0")}`
const b = (n: number) => `2000000${String(n).padStart(5, "0")}`

export const SAMPLE_PRODUCTS: SampleProduct[] = [
  { name: "Hex bolt M8 x 40", sku: p(1), itemType: "stocked", standardUom: "each", purchaseUom: "box", purchaseUomRatio: 100, category: "Fasteners", barcode: b(1), weight: 0.02 },
  { name: "Hex bolt M10 x 50", sku: p(2), itemType: "stocked", standardUom: "each", purchaseUom: "box", purchaseUomRatio: 100, category: "Fasteners", barcode: b(2), weight: 0.04 },
  { name: "Hex nut M8", sku: p(3), itemType: "stocked", standardUom: "each", purchaseUom: "box", purchaseUomRatio: 200, category: "Fasteners", barcode: b(3) },
  { name: "Hex nut M10", sku: p(4), itemType: "stocked", standardUom: "each", purchaseUom: "box", purchaseUomRatio: 200, category: "Fasteners", barcode: b(4) },
  { name: "Flat washer M8", sku: p(5), itemType: "stocked", standardUom: "each", purchaseUom: "box", purchaseUomRatio: 500, category: "Fasteners", barcode: b(5) },
  { name: "Wood screw 4 x 30", sku: p(6), itemType: "stocked", standardUom: "each", purchaseUom: "box", purchaseUomRatio: 250, salesUom: "pack", salesUomRatio: 50, category: "Fasteners", barcode: b(6) },
  { name: "Wall plug 6 mm", sku: p(7), itemType: "stocked", standardUom: "each", purchaseUom: "box", purchaseUomRatio: 1000, salesUom: "pack", salesUomRatio: 100, category: "Fasteners", barcode: b(7) },
  { name: "Cordless drill 18V", sku: p(8), itemType: "stocked", standardUom: "each", category: "Power tools", barcode: b(8), trackSerials: true, weight: 1.6, length: 25, width: 8, height: 22 },
  { name: "Angle grinder 125 mm", sku: p(9), itemType: "stocked", standardUom: "each", category: "Power tools", barcode: b(9), trackSerials: true, weight: 2.1 },
  { name: "Jigsaw 650W", sku: p(10), itemType: "stocked", standardUom: "each", category: "Power tools", barcode: b(10), trackSerials: true, weight: 2.4 },
  { name: "Drill bit set HSS 13 pc", sku: p(11), itemType: "stocked", standardUom: "set", category: "Power tools", barcode: b(11), weight: 0.5 },
  { name: "Claw hammer 450 g", sku: p(12), itemType: "stocked", standardUom: "each", category: "Hand tools", barcode: b(12), weight: 0.6 },
  { name: "Screwdriver set 6 pc", sku: p(13), itemType: "stocked", standardUom: "set", category: "Hand tools", barcode: b(13) },
  { name: "Adjustable wrench 250 mm", sku: p(14), itemType: "stocked", standardUom: "each", category: "Hand tools", barcode: b(14) },
  { name: "Tape measure 5 m", sku: p(15), itemType: "stocked", standardUom: "each", purchaseUom: "case", purchaseUomRatio: 24, category: "Hand tools", barcode: b(15) },
  { name: "Utility knife", sku: p(16), itemType: "stocked", standardUom: "each", category: "Hand tools", barcode: b(16) },
  { name: "Wood glue 500 ml", sku: p(17), itemType: "stocked", standardUom: "each", purchaseUom: "case", purchaseUomRatio: 12, category: "Adhesives", barcode: b(17), trackLots: true, trackExpiry: true, shelfLifeDays: 365, sellBeforeExpiryDays: 30, expiryNoticeDays: 60 },
  { name: "Epoxy 2 part 25 ml", sku: p(18), itemType: "stocked", standardUom: "each", purchaseUom: "case", purchaseUomRatio: 24, category: "Adhesives", barcode: b(18), trackLots: true, trackExpiry: true, shelfLifeDays: 540, sellBeforeExpiryDays: 45, expiryNoticeDays: 90 },
  { name: "Silicone sealant clear", sku: p(19), itemType: "stocked", standardUom: "tube", purchaseUom: "case", purchaseUomRatio: 12, category: "Adhesives", barcode: b(19), trackLots: true },
  { name: "Copper cable 2.5 mm²", sku: p(20), itemType: "stocked", standardUom: "m", purchaseUom: "roll", purchaseUomRatio: 100, category: "Electrical", barcode: b(20), trackLots: true },
  { name: "LED bulb E27 9W", sku: p(21), itemType: "stocked", standardUom: "each", purchaseUom: "case", purchaseUomRatio: 50, category: "Electrical", barcode: b(21) },
  { name: "Extension cord 4 way 3 m", sku: p(22), itemType: "stocked", standardUom: "each", category: "Electrical", barcode: b(22) },
  { name: "Safety glasses", sku: p(23), itemType: "stocked", standardUom: "pair", purchaseUom: "box", purchaseUomRatio: 12, category: "Safety", barcode: b(23) },
  { name: "Work gloves size L", sku: p(24), itemType: "stocked", standardUom: "pair", purchaseUom: "box", purchaseUomRatio: 12, category: "Safety", barcode: b(24) },
  { name: "Dust mask FFP2", sku: p(25), itemType: "stocked", standardUom: "each", purchaseUom: "box", purchaseUomRatio: 20, category: "Safety", barcode: b(25), trackLots: true, trackExpiry: true, shelfLifeDays: 1095, expiryNoticeDays: 90 },
  { name: "Shipping box 30 x 20 x 15", sku: p(26), itemType: "stocked", standardUom: "each", purchaseUom: "bundle", purchaseUomRatio: 25, category: "Packaging", barcode: b(26) },
  { name: "Bubble wrap 50 m", sku: p(27), itemType: "stocked", standardUom: "roll", category: "Packaging", barcode: b(27) },
  { name: "Packing tape 48 mm", sku: p(28), itemType: "non_stocked", standardUom: "roll", category: "Packaging", barcode: b(28) },
  { name: "Assembly service", sku: p(29), itemType: "service", standardUom: "hour", category: "Services", description: "On site assembly, billed per hour." },
  { name: "Delivery charge", sku: p(30), itemType: "service", standardUom: "each", category: "Services", description: "Flat local delivery fee." },
]
