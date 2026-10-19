// Checks the shared price and tax module against spec 0010's scenarios.
//   node scripts/checks/pricing.mjs
import assert from "node:assert/strict"
import { computeTax, resolvePrice } from "../../src/features/pricing/pricing.ts"

const prices = [
  { ItemId: "r", pricingSchemeId: "retail", priceType: "fixed", unitPrice: 10 },
  { ItemId: "w", pricingSchemeId: "wholesale", priceType: "markup", markupPct: 25 },
]
const breaks = [
  { productPriceId: "w", minQty: 50, unitPrice: 6.5 },
  { productPriceId: "w", minQty: 100, unitPrice: 6 },
]
const check = (name, fn) => {
  fn()
  console.log(`ok  ${name}`)
}

check("customer scheme with a quantity break", () => {
  const r = resolvePrice({ customerSchemeId: "wholesale", defaultSchemeId: "retail", prices, breaks, averageCost: 6, qty: 50 })
  assert.equal(r.unitPrice, 6.5)
  assert.equal(r.source, "break")
})
check("markup over average cost", () => {
  const r = resolvePrice({ customerSchemeId: "wholesale", defaultSchemeId: "retail", prices, breaks, averageCost: 6, qty: 10 })
  assert.equal(r.unitPrice, 7.5)
})
check("falls back to the default scheme, then discounts", () => {
  const r = resolvePrice({ customerSchemeId: "vip", defaultSchemeId: "retail", prices, breaks, qty: 1, customerDiscountPct: 10, lineDiscount: { type: "fixed", value: 1 } })
  assert.equal(r.source, "default_scheme")
  assert.equal(Number(r.unitPrice.toFixed(2)), 8)
})
check("markup without a cost is refused", () => {
  assert.equal(resolvePrice({ customerSchemeId: "wholesale", prices, breaks, averageCost: null, qty: 1 }).reason, "no_cost_for_markup")
})
check("a break never raises the price", () => {
  const r = resolvePrice({ customerSchemeId: "wholesale", prices, breaks, averageCost: 6, qty: 100, customerDiscountPct: 30 })
  assert.equal(Number(r.unitPrice.toFixed(2)), 5.25)
})
check("compound tax", () => {
  const t = computeTax([{ amount: 100 }], { tax1Rate: 6, tax2Rate: 2, tax2CompoundsOnTax1: true })
  assert.deepEqual([t.tax1, t.tax2, t.total], [6, 2.12, 108.12])
})
check("tax inclusive back calculation", () => {
  const t = computeTax([{ amount: 115 }], { tax1Rate: 15, isTaxInclusive: true })
  assert.deepEqual([t.net, t.tax1, t.total], [100, 15, 115])
})
check("tax code overrides the rate; shipping taxed", () => {
  const t = computeTax([{ amount: 100, taxCode: { tax1Rate: 5 } }], { tax1Rate: 15, tax1OnShipping: true }, 10)
  assert.deepEqual([t.tax1, t.total], [6.5, 116.5])
})
