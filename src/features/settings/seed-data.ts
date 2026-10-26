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
  { documentType: "fixed_asset", prefix: "FA-" },
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

// Features 6 to 10 demo data.

export const DEMO_LOCATIONS = [
  {
    name: "Main warehouse",
    kind: "warehouse",
    address: "Plot 7, Tejgaon Industrial Area, Dhaka",
    isDefault: true,
    bins: ["RECEIVING", "A-01", "A-02", "A-03", "B-01", "B-02", "C-01"],
  },
  { name: "Downtown store", kind: "store", address: "45 Gulshan Avenue, Dhaka", bins: ["FRONT", "BACK"] },
  { name: "Delivery van 1", kind: "truck", address: "", bins: [] },
]

export const DEMO_PRICING_SCHEMES = [
  { name: "Retail", currencyCode: "USD", isTaxInclusive: false, isDefault: true },
  { name: "Wholesale", currencyCode: "USD", isTaxInclusive: false },
  { name: "Euro retail", currencyCode: "EUR", isTaxInclusive: true },
]

/** Cost from the main vendor and retail price, by SKU. Wholesale is cost plus 30%. */
export const DEMO_COST_AND_PRICE: Record<string, [cost: number, retail: number]> = {
  "SAMPLE-0001": [0.12, 0.35], "SAMPLE-0002": [0.18, 0.45], "SAMPLE-0003": [0.06, 0.2], "SAMPLE-0004": [0.04, 0.12],
  "SAMPLE-0005": [0.02, 0.08], "SAMPLE-0006": [0.03, 0.09], "SAMPLE-0007": [0.01, 0.05], "SAMPLE-0008": [62, 109],
  "SAMPLE-0009": [38, 69], "SAMPLE-0010": [41, 75], "SAMPLE-0011": [6.5, 14.9], "SAMPLE-0012": [7.2, 15.5],
  "SAMPLE-0013": [5.1, 11.9], "SAMPLE-0014": [6.8, 13.5], "SAMPLE-0015": [2.4, 5.99], "SAMPLE-0016": [1.9, 4.5],
  "SAMPLE-0017": [2.6, 5.75], "SAMPLE-0018": [1.8, 4.25], "SAMPLE-0019": [1.5, 3.9], "SAMPLE-0020": [0.55, 1.2],
  "SAMPLE-0021": [1.1, 2.99], "SAMPLE-0022": [4.2, 9.5], "SAMPLE-0023": [1.3, 3.5], "SAMPLE-0024": [1.6, 4.0],
  "SAMPLE-0025": [0.7, 1.95], "SAMPLE-0026": [0.45, 1.1], "SAMPLE-0027": [7.5, 15.0], "SAMPLE-0028": [0.9, 2.2],
  "SAMPLE-0029": [0, 35], "SAMPLE-0030": [0, 8],
}

/** Volume breaks on the Wholesale scheme: [sku, minQty, unitPrice]. */
export const DEMO_PRICE_BREAKS: [string, number, number][] = [
  ["SAMPLE-0001", 500, 0.15], ["SAMPLE-0001", 1000, 0.14],
  ["SAMPLE-0003", 500, 0.075], ["SAMPLE-0003", 1000, 0.07],
  ["SAMPLE-0006", 1000, 0.035],
  ["SAMPLE-0021", 50, 1.25],
]

export const DEMO_VENDORS = [
  {
    name: "Bolt & Nut Supply Ltd",
    email: "orders@boltnut.example",
    phone: "+880 2 5500 1100",
    currencyCode: "USD",
    paymentTerm: "Net 30",
    leadTimeDays: 7,
    address: { line1: "22 Kawran Bazar", city: "Dhaka", postalCode: "1215", country: "Bangladesh" },
    contacts: [{ name: "Rafiq Ahmed", email: "rafiq@boltnut.example", phone: "+880 1711 000111", role: "Sales" }],
  },
  {
    name: "ToolPro International",
    email: "sales@toolpro.example",
    phone: "+49 30 1234 5678",
    currencyCode: "EUR",
    paymentTerm: "Net 60",
    leadTimeDays: 21,
    address: { line1: "Industriestrasse 5", city: "Berlin", postalCode: "10115", country: "Germany" },
    contacts: [{ name: "Anna Weber", email: "anna.weber@toolpro.example", role: "Account manager" }],
  },
  {
    name: "Bright Electric Co.",
    email: "hello@brightelectric.example",
    phone: "+880 2 9876 5432",
    currencyCode: "USD",
    paymentTerm: "Net 15",
    leadTimeDays: 5,
    address: { line1: "8 Elephant Road", city: "Dhaka", postalCode: "1205", country: "Bangladesh" },
    contacts: [],
  },
  {
    name: "PackRight Packaging",
    email: "support@packright.example",
    phone: "+44 20 7946 0000",
    currencyCode: "GBP",
    paymentTerm: "Due on receipt",
    leadTimeDays: 10,
    address: { line1: "Unit 3, Riverside Park", city: "Leeds", postalCode: "LS1 4AP", country: "United Kingdom" },
    contacts: [{ name: "Tom Harris", email: "tom@packright.example", phone: "+44 7700 900123", role: "Orders" }],
  },
]

/** Which vendor supplies which product prefix range: [vendor, first SKU number, last SKU number]. */
export const DEMO_VENDOR_SUPPLY: [string, number, number][] = [
  ["Bolt & Nut Supply Ltd", 1, 7],
  ["ToolPro International", 8, 16],
  ["Bolt & Nut Supply Ltd", 17, 19],
  ["Bright Electric Co.", 20, 22],
  ["ToolPro International", 23, 25],
  ["PackRight Packaging", 26, 28],
]

export const DEMO_CUSTOMERS = [
  { name: "Acme Builders", email: "accounts@acmebuilders.example", phone: "+880 1811 222333", scheme: "Wholesale", term: "Net 30", currency: "USD", discount: 5, creditLimit: 20000, city: "Dhaka", line1: "14 Banani Road 11" },
  { name: "Green Leaf Interiors", email: "buy@greenleaf.example", phone: "+880 1911 444555", scheme: "Retail", term: "Net 15", currency: "USD", discount: 0, creditLimit: 5000, city: "Chattogram", line1: "3 Agrabad C/A" },
  { name: "Northside Hardware", email: "orders@northside.example", phone: "+880 1611 777888", scheme: "Wholesale", term: "Net 60", currency: "USD", discount: 8, creditLimit: 35000, city: "Sylhet", line1: "90 Zindabazar" },
  { name: "Müller Werkstatt GmbH", email: "einkauf@mueller.example", phone: "+49 89 555 0101", scheme: "Euro retail", term: "Net 30", currency: "EUR", discount: 0, creditLimit: 10000, city: "Munich", line1: "Werkstrasse 12", country: "Germany" },
  { name: "City Maintenance Services", email: "ops@citymaint.example", phone: "+880 1511 999000", scheme: "Retail", term: "Due on receipt", currency: "USD", discount: 2, creditLimit: 2000, city: "Dhaka", line1: "77 Mirpur Road" },
  { name: "Harbor Logistics", email: "procurement@harbor.example", phone: "+44 161 555 0199", scheme: "Wholesale", term: "Net 30", currency: "GBP", discount: 3, creditLimit: 15000, city: "Manchester", line1: "1 Dock Street", country: "United Kingdom" },
  { name: "Walk in customer", email: "", phone: "", scheme: "Retail", term: "Due on receipt", currency: "USD", discount: 0, creditLimit: 0, city: "", line1: "" },
]

/** Opening stock per location: [sku, qty, bin, lots or serials]. */
export type OpeningLine = {
  sku: string
  qty: number
  bin?: string
  lots?: { lotNumber: string; qty: number; expiresInDays: number }[]
  serials?: string[]
}

export const DEMO_OPENING_STOCK: Record<string, OpeningLine[]> = {
  "Main warehouse": [
    { sku: "SAMPLE-0001", qty: 2400, bin: "A-01" },
    { sku: "SAMPLE-0002", qty: 1200, bin: "A-01" },
    { sku: "SAMPLE-0003", qty: 3000, bin: "A-02" },
    { sku: "SAMPLE-0004", qty: 2800, bin: "A-02" },
    { sku: "SAMPLE-0005", qty: 5000, bin: "A-03" },
    { sku: "SAMPLE-0006", qty: 4500, bin: "A-03" },
    { sku: "SAMPLE-0007", qty: 8000, bin: "A-03" },
    { sku: "SAMPLE-0008", qty: 3, bin: "B-01", serials: ["DR18-0001", "DR18-0002", "DR18-0003"] },
    { sku: "SAMPLE-0009", qty: 2, bin: "B-01", serials: ["AG125-1001", "AG125-1002"] },
    { sku: "SAMPLE-0010", qty: 2, bin: "B-01", serials: ["JS650-501", "JS650-502"] },
    { sku: "SAMPLE-0011", qty: 25, bin: "B-02" },
    { sku: "SAMPLE-0012", qty: 18, bin: "B-02" },
    { sku: "SAMPLE-0013", qty: 30, bin: "B-02" },
    { sku: "SAMPLE-0014", qty: 22, bin: "B-02" },
    { sku: "SAMPLE-0015", qty: 60, bin: "B-02" },
    { sku: "SAMPLE-0016", qty: 45, bin: "B-02" },
    { sku: "SAMPLE-0017", qty: 48, bin: "C-01", lots: [{ lotNumber: "WG-2401", qty: 24, expiresInDays: 40 }, { lotNumber: "WG-2405", qty: 24, expiresInDays: 300 }] },
    { sku: "SAMPLE-0018", qty: 36, bin: "C-01", lots: [{ lotNumber: "EP-0912", qty: 36, expiresInDays: 420 }] },
    { sku: "SAMPLE-0019", qty: 24, bin: "C-01", lots: [{ lotNumber: "SS-7781", qty: 24, expiresInDays: 0 }] },
    { sku: "SAMPLE-0020", qty: 500, bin: "C-01", lots: [{ lotNumber: "CU-25-A", qty: 300, expiresInDays: 0 }, { lotNumber: "CU-25-B", qty: 200, expiresInDays: 0 }] },
    { sku: "SAMPLE-0021", qty: 150, bin: "A-01" },
    { sku: "SAMPLE-0022", qty: 40, bin: "A-02" },
    { sku: "SAMPLE-0023", qty: 120, bin: "A-03" },
    { sku: "SAMPLE-0024", qty: 96, bin: "A-03" },
    { sku: "SAMPLE-0025", qty: 200, bin: "C-01", lots: [{ lotNumber: "FFP2-2209", qty: 80, expiresInDays: -10 }, { lotNumber: "FFP2-2503", qty: 120, expiresInDays: 700 }] },
    { sku: "SAMPLE-0026", qty: 400, bin: "RECEIVING" },
    { sku: "SAMPLE-0027", qty: 15, bin: "RECEIVING" },
  ],
  "Downtown store": [
    { sku: "SAMPLE-0001", qty: 300, bin: "FRONT" },
    { sku: "SAMPLE-0003", qty: 400, bin: "FRONT" },
    { sku: "SAMPLE-0008", qty: 1, bin: "BACK", serials: ["DR18-0004"] },
    { sku: "SAMPLE-0012", qty: 6, bin: "FRONT" },
    { sku: "SAMPLE-0015", qty: 12, bin: "FRONT" },
    { sku: "SAMPLE-0017", qty: 6, bin: "BACK", lots: [{ lotNumber: "WG-2401", qty: 6, expiresInDays: 40 }] },
    { sku: "SAMPLE-0021", qty: 30, bin: "FRONT" },
  ],
}

// Team, rate history and stock activity demo data.

/** One demo member per non-admin role. Use @yopmail.com with DEMO_TEAM_PASSWORD so accounts can sign in. */
export const DEMO_TEAM = [
  { email: "maya@yopmail.com", firstName: "Maya", lastName: "Manager", role: "manager" },
  { email: "sami@yopmail.com", firstName: "Sami", lastName: "Sales", role: "sales" },
  { email: "priya@yopmail.com", firstName: "Priya", lastName: "Purchasing", role: "purchasing" },
  { email: "wasim@yopmail.com", firstName: "Wasim", lastName: "Warehouse", role: "warehouse" },
  { email: "pablo@yopmail.com", firstName: "Pablo", lastName: "Production", role: "production" },
  { email: "rita@yopmail.com", firstName: "Rita", lastName: "Readonly", role: "readonly" },
]

/** Older sample rates: [currency, days ago, rate]. */
export const DEMO_RATE_HISTORY: [string, number, number][] = [
  ["EUR", 60, 0.94], ["EUR", 30, 0.93],
  ["GBP", 60, 0.8], ["GBP", 30, 0.79],
  ["BDT", 60, 119.8], ["BDT", 30, 120.6],
]

export type DemoLine = { sku: string; qty: number; bin?: string; lot?: string; serial?: string; toBin?: string }

/** Backdated adjustments: remarks are the idempotency marker. */
export const DEMO_ADJUSTMENTS: { remarks: string; location: string; reason: string; daysAgo: number; lines: DemoLine[] }[] = [
  { remarks: "Dropped pallet in aisle A (demo)", location: "Main warehouse", reason: "Damaged", daysAgo: 21, lines: [{ sku: "SAMPLE-0012", qty: -2, bin: "B-02" }, { sku: "SAMPLE-0021", qty: -6, bin: "A-01" }] },
  { remarks: "Expired masks written off (demo)", location: "Main warehouse", reason: "Expired", daysAgo: 9, lines: [{ sku: "SAMPLE-0025", qty: -80, bin: "C-01", lot: "FFP2-2209" }] },
  { remarks: "Found behind shelving (demo)", location: "Downtown store", reason: "Found", daysAgo: 6, lines: [{ sku: "SAMPLE-0015", qty: 1, bin: "FRONT" }] },
  { remarks: "Workshop tools for staff (demo)", location: "Main warehouse", reason: "Internal use", daysAgo: 4, lines: [{ sku: "SAMPLE-0016", qty: -2, bin: "B-02" }, { sku: "SAMPLE-0024", qty: -4, bin: "A-03" }] },
  { remarks: "Missing after weekend (demo)", location: "Downtown store", reason: "Lost or stolen", daysAgo: 2, lines: [{ sku: "SAMPLE-0012", qty: -1, bin: "FRONT" }] },
]

/** Transfers in three states. */
export const DEMO_TRANSFERS: { remarks: string; from: string; to: string; state: "completed" | "in_transit" | "open"; sentDaysAgo?: number; receivedDaysAgo?: number; lines: DemoLine[] }[] = [
  { remarks: "Weekly store restock (demo)", from: "Main warehouse", to: "Downtown store", state: "completed", sentDaysAgo: 12, receivedDaysAgo: 11, lines: [{ sku: "SAMPLE-0006", qty: 250, bin: "A-03", toBin: "FRONT" }, { sku: "SAMPLE-0021", qty: 20, bin: "A-01", toBin: "FRONT" }, { sku: "SAMPLE-0017", qty: 6, bin: "C-01", lot: "WG-2401", toBin: "BACK" }] },
  { remarks: "Van stock for site jobs (demo)", from: "Main warehouse", to: "Delivery van 1", state: "in_transit", sentDaysAgo: 1, lines: [{ sku: "SAMPLE-0008", qty: 1, bin: "B-01", serial: "DR18-0002" }, { sku: "SAMPLE-0024", qty: 12, bin: "A-03" }, { sku: "SAMPLE-0001", qty: 200, bin: "A-01" }] },
  { remarks: "Tape measures for the store (demo)", from: "Main warehouse", to: "Downtown store", state: "open", lines: [{ sku: "SAMPLE-0015", qty: 10, bin: "B-02", toBin: "FRONT" }] },
]

/** Counts in three states. `counted` is how far off the count is from what was expected, per line. */
export const DEMO_COUNTS: { remarks: string; location: string; state: "completed" | "in_review" | "in_progress"; daysAgo: number; sheets: { name: string; assignee: string; skus: string[]; offsets?: Record<string, number>; submitted: boolean }[] }[] = [
  { remarks: "Monthly store count (demo)", location: "Downtown store", state: "completed", daysAgo: 5, sheets: [{ name: "Front counter", assignee: "wasim@yopmail.com", skus: ["SAMPLE-0001", "SAMPLE-0003", "SAMPLE-0021"], offsets: { "SAMPLE-0003": -4 }, submitted: true }] },
  { remarks: "Aisle A cycle count (demo)", location: "Main warehouse", state: "in_review", daysAgo: 1, sheets: [{ name: "Aisle A", assignee: "wasim@yopmail.com", skus: ["SAMPLE-0002", "SAMPLE-0004", "SAMPLE-0005"], offsets: { "SAMPLE-0004": 12, "SAMPLE-0005": -25 }, submitted: true }] },
  { remarks: "Power tools spot check (demo)", location: "Main warehouse", state: "in_progress", daysAgo: 0, sheets: [{ name: "Bin B-01", assignee: "wasim@yopmail.com", skus: ["SAMPLE-0009", "SAMPLE-0010"], submitted: false }, { name: "Bin B-02", assignee: "maya@yopmail.com", skus: ["SAMPLE-0011", "SAMPLE-0013"], submitted: false }] },
]
