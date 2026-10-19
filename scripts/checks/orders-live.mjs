// Live check of sales orders, purchase orders, payments, reordering and
// reports (specs 0011 to 0015) through the app's own modules, loaded by Vite in
// Node. A machine client token stands in for the signed in session. Creates
// real documents marked "Check:" in the demo data.
//
//   BLOCKS_SEED_CLIENT_ID=... BLOCKS_SEED_CLIENT_SECRET=... node scripts/checks/orders-live.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createBlocksClient } from "@seliseblocks/client"
import { createServer } from "vite"

const env = (name) => readFileSync(".env", "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))?.[1].trim()
const token = await createBlocksClient({
  apiUrl: env("VITE_BLOCKS_API_URL"),
  appDomain: env("VITE_BLOCKS_APP_DOMAIN"),
  xBlocksKey: env("VITE_BLOCKS_X_BLOCKS_KEY"),
}).auth.oidc.clientCredentials({ clientId: process.env.BLOCKS_SEED_CLIENT_ID, clientSecret: process.env.BLOCKS_SEED_CLIENT_SECRET })
const store = new Map([["inventory:access-token", token.access_token ?? token.accessToken]])
globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
globalThis.window = { location: { origin: env("VITE_BLOCKS_APP_DOMAIN") } }

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" })
const by = "orders-live check"
try {
  const load = (path) => vite.ssrLoadModule(path)
  const sales = await load("/src/features/sales/actions.ts")
  const { salesOrders } = await load("/src/features/sales/api.ts")
  const purchasing = await load("/src/features/purchasing/actions.ts")
  const pay = await load("/src/features/payments/actions.ts")
  const { payments, partyBalances } = await load("/src/features/payments/api.ts")
  const reorder = await load("/src/features/reorder/api.ts")
  const { REPORTS } = await load("/src/features/reports/definitions.ts")
  const stock = await load("/src/features/stock/api.ts")
  const stockActions = await load("/src/features/stock/actions.ts")
  const { products, vendorItems } = await load("/src/features/products/api.ts")
  const { customers, vendors } = await load("/src/features/partners/api.ts")
  const { locations, sublocations } = await load("/src/features/locations/api.ts")
  const settings = await load("/src/features/settings/api.ts")

  // The lookups the screens load, built the same way (spec 0011 context).
  const [productRows, customerRows, vendorRows, locationRows, schemes, codes, terms, company, itemRows, binRows, reasons, lotRows] = await Promise.all([
    products.list({ pageSize: 2000 }),
    customers.list({ pageSize: 500 }),
    vendors.list({ pageSize: 500 }),
    locations.list({ pageSize: 100 }),
    settings.taxingSchemes.list({ pageSize: 100 }),
    settings.taxCodes.list({ pageSize: 100 }),
    settings.paymentTerms.list({ pageSize: 100 }),
    settings.companies.list({ pageSize: 1 }),
    vendorItems.list({ pageSize: 2000 }),
    sublocations.list({ pageSize: 3000 }),
    settings.adjustmentReasons.list({ pageSize: 100 }),
    stock.lots.list({ pageSize: 2000 }),
  ])
  const byId = (rows) => (id) => rows.items.find((row) => row.ItemId === id)
  const lookups = {
    productOf: byId(productRows),
    taxSchemeOf: byId(schemes),
    taxCodeOf: byId(codes),
    termOf: byId(terms),
    customerOf: byId(customerRows),
    vendorOf: byId(vendorRows),
    locationName: (id) => locationRows.items.find((row) => row.ItemId === id)?.name ?? "",
    binCode: (id) => binRows.items.find((row) => row.ItemId === id)?.code ?? "",
    userName: () => "",
    homeCurrency: company.items[0]?.homeCurrency ?? "USD",
    methods: [],
  }
  const stockLookups = {
    locations: locationRows.items,
    bins: binRows.items,
    products: productRows.items,
    reasons: reasons.items,
    lots: lotRows.items,
    locationName: lookups.locationName,
    binCode: lookups.binCode,
    product: lookups.productOf,
    lotNumber: (id) => lotRows.items.find((row) => row.ItemId === id)?.lotNumber ?? "",
  }
  const sku = (code) => productRows.items.find((row) => row.sku === code)
  const main = locationRows.items.find((row) => row.name === "Main warehouse")
  const hammer = sku("SAMPLE-0012")
  const glue = sku("SAMPLE-0017")
  const customer = customerRows.items.find((row) => (row.currencyCode ?? "USD") === lookups.homeCurrency) ?? customerRows.items[0]
  const noTax = schemes.items.find((row) => row.isDefault)
  const onHand = async (productId, locationId = main.ItemId) => (await stock.posting.balances({ productId, locationId }, { pageSize: 500 })).items.reduce((sum, row) => sum + row.onHand, 0)
  const qty = async (productId) => (await stock.quantitiesFor(productId)).find((row) => row.locationId === main.ItemId)
  const salesLine = (product, n, price, extra = {}) => ({
    lineId: crypto.randomUUID(), productId: product.ItemId, description: null, qty: n, uom: product.standardUom, stdQty: n, unitPrice: price,
    discountType: null, discount: null, taxCodeId: null, serviceDone: false, returnAction: n < 0 ? "restock" : null, pickedQty: 0, packedQty: 0, shippedQty: 0, restockedQty: 0, ...extra,
  })
  const salesDraft = (lines, extra = {}) => ({
    isQuote: false, customerId: customer.ItemId, contact: null, billingAddress: customer.billingAddress ?? null, shippingAddress: customer.shippingAddress ?? null,
    locationId: main.ItemId, orderDate: new Date().toISOString(), dueDate: null, requestedShipDate: null, currencyCode: lookups.homeCurrency, exchangeRate: 1,
    pricingSchemeId: null, taxingSchemeId: noTax?.ItemId ?? null, paymentTermId: null, salesRepUserId: null, customerPoNumber: null, freight: 0, remarks: "Check: order", source: "manual", priority: 0, lines, ...extra,
  })

  // A run stopped between retry and cancel (step 9) leaves its adjustment posted; cancel it so stock starts clean.
  for (const leftover of (await stock.stockAdjustments.list({ filter: { remarks: "Check: retry", status: "posted" }, pageSize: 50 })).items) {
    await stockActions.cancelAdjustment(leftover)
    console.log(`ok  ${leftover.number}: leftover from a stopped run, cancelled`)
  }

  // 1. Quote to order, partial pick, pack, ship; statuses derived (spec 0011 AC-1, AC-3, AC-4).
  const hammerStart = await onHand(hammer.ItemId)
  const before = await qty(hammer.ItemId)
  let order = await sales.createSalesOrder(salesDraft([salesLine(hammer, 3, 20)], { isQuote: true }), lookups, by)
  assert.equal(order.inventoryStatus, "quote")
  order = await sales.convertSalesOrder(order, lookups, by)
  order = await salesOrders.get(order.ItemId)
  assert.equal(order.isQuote, false)
  assert.match(order.number, /^SO-/)
  assert.equal(order.inventoryStatus, "unfulfilled")
  assert.equal((await qty(hammer.ItemId)).reserved, before.reserved + 3, "open sales line reserves stock")
  const { picks } = await sales.suggestPicks(order, lookups)
  order = await sales.pickLines(order, [{ ...picks[0], qty: 2 }], lookups, by)
  assert.equal(order.inventoryStatus, "started")
  assert.equal(await onHand(hammer.ItemId), hammerStart - 2, "picked stock left on hand")
  const afterPick = await qty(hammer.ItemId)
  assert.equal(afterPick.picked, before.picked + 2)
  assert.equal(afterPick.reserved, before.reserved + 1)
  assert.ok(order.cogs > 0, "cost of goods fixed on pick")
  order = await sales.packAll(order, lookups, by)
  order = await sales.shipPackages(order, { packageNumbers: order.packages.map((pack) => pack.number), trackingNumber: "CHK1" }, lookups, by)
  assert.equal(order.inventoryStatus, "started", "one hammer still on back order")
  console.log(`ok  ${order.number}: quote → order, picked 2 of 3, packed, shipped; 1 on back order, status started, cogs ${order.cogs}`)

  // 2. Two people pick the last unit at once: exactly one wins (compare and set on the order).
  const fresh = await salesOrders.get(order.ItemId)
  const remaining = (await sales.suggestPicks(fresh, lookups)).picks[0]
  const race = await Promise.allSettled([sales.pickLines(fresh, [{ ...remaining, qty: 1 }], lookups, by), sales.pickLines(fresh, [{ ...remaining, qty: 1 }], lookups, by)])
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1, "one pick wins")
  assert.equal(await onHand(hammer.ItemId), hammerStart - 3, "the losing pick moved no stock")
  console.log(`ok  ${order.number}: two concurrent picks of the last unit, one won, one refused (${race.find((r) => r.status === "rejected").reason.message})`)

  // 3. Ship the rest and invoice (AC-4, AC-5).
  const shipped = await sales.shipAll(await salesOrders.get(order.ItemId), lookups, by)
  order = await sales.invoiceOrder(shipped.order, new Date().toISOString(), lookups, by)
  assert.equal(order.inventoryStatus, "fulfilled")
  assert.equal(order.paymentStatus, "invoiced")
  console.log(`ok  ${order.number}: ship all → fulfilled, invoiced`)

  // 4. Payments: one 100 payment split 60 + 40 over two orders; over split refused; saving twice records once (spec 0013).
  let second = await sales.createSalesOrder(salesDraft([salesLine(hammer, 1, 50)]), lookups, by)
  const key = crypto.randomUUID()
  const input = { party: "customer", partyId: customer.ItemId, type: "payment", amount: 100, currencyCode: lookups.homeCurrency, paidOn: new Date().toISOString(), remarks: "Check: payment", postingKey: key, allocations: [{ orderType: "sales", orderId: order.ItemId, orderNumber: order.number, amount: 60 }, { orderType: "sales", orderId: second.ItemId, orderNumber: second.number, amount: 40 }] }
  await assert.rejects(pay.recordPayment({ ...input, postingKey: crypto.randomUUID(), allocations: [{ ...input.allocations[0], amount: 120 }] }, by), /more than the payment/)
  const [p1, p2] = await Promise.all([pay.recordPayment(input, by), pay.recordPayment(input, by)])
  assert.equal(p1.ItemId, p2.ItemId, "the same save twice is one payment")
  assert.equal((await payments.list({ filter: { postingKey: key } })).items.length, 1)
  order = await salesOrders.get(order.ItemId)
  second = await salesOrders.get(second.ItemId)
  assert.equal(order.amountPaid, 60)
  assert.equal(order.paymentStatus, "paid")
  assert.equal(second.amountPaid, 40)
  assert.equal(second.paymentStatus, "partial")
  const balance = (await partyBalances.list({ filter: { party: "customer", partyId: customer.ItemId, currencyCode: lookups.homeCurrency } })).items[0]
  assert.ok(balance, "party balance written")
  console.log(`ok  ${p1.number}: 100 split 60/40, over split refused, double save → one payment; ${order.number} paid, ${second.number} partly paid; balance ${balance.openBalance}`)

  // 5. Cancel an order with a pick and a payment: stock back, payment becomes store credit (AC-6).
  const beforeCancel = await onHand(hammer.ItemId)
  second = (await sales.pickAll(second, lookups, by)).order
  assert.equal(await onHand(hammer.ItemId), beforeCancel - 1)
  const creditBefore = balance.storeCredit
  await sales.cancelSalesOrder(second, lookups, by)
  second = await salesOrders.get(second.ItemId)
  assert.equal(second.inventoryStatus, "cancelled")
  assert.equal(await onHand(hammer.ItemId), beforeCancel, "cancel reversed the pick")
  const afterCredit = (await partyBalances.list({ filter: { party: "customer", partyId: customer.ItemId, currencyCode: lookups.homeCurrency } })).items[0].storeCredit
  assert.equal(Math.round((afterCredit - creditBefore) * 100) / 100, 40, "the 40 became store credit")
  await sales.cancelSalesOrder(second, lookups, by)
  assert.equal(await onHand(hammer.ItemId), beforeCancel, "running cancel again changes nothing")
  console.log(`ok  ${second.number}: cancelled, pick reversed, 40 moved to store credit, second cancel changed nothing`)

  // 6. Purchase order with freight by value, partial receipt with a lot, landed cost into average cost (spec 0012 AC-4, AC-5).
  const vendor = vendorRows.items.find((row) => itemRows.items.some((item) => item.vendorId === row.ItemId && item.productId === glue.ItemId)) ?? vendorRows.items[0]
  const poLine = (product, n, price) => ({ lineId: crypto.randomUUID(), productId: product.ItemId, vendorItemCode: null, qty: n, uom: product.standardUom, stdQty: n, unitPrice: price, discountType: null, discount: null, taxCodeId: null, receivedQty: 0 })
  let po = await purchasing.createPurchaseOrder(
    { isQuote: false, vendorId: vendor.ItemId, receiveLocationId: main.ItemId, orderDate: new Date().toISOString(), currencyCode: lookups.homeCurrency, exchangeRate: 1, taxingSchemeId: noTax?.ItemId ?? null, freight: 30, allocationMethod: "value", nonVendorCosts: [{ name: "Duty", type: "fixed", amount: 10 }], remarks: "Check: purchase", lines: [poLine(hammer, 10, 8), poLine(glue, 10, 2)] },
    lookups,
    by
  )
  const onOrderBefore = (await qty(hammer.ItemId)).onOrder
  const hammerCostBefore = (await products.get(hammer.ItemId)).averageCost
  const hammerQtyBefore = (await stock.posting.balances({ productId: hammer.ItemId }, { pageSize: 500 })).items.reduce((sum, row) => sum + row.onHand, 0)
  const lotNumber = `CHK-${Date.now().toString().slice(-6)}`
  po = await purchasing.receiveLines(po, [{ lineId: po.lines[0].lineId, qty: 4, binCode: "A-01" }, { lineId: po.lines[1].lineId, qty: 10, lotNumber, lotExpiresOn: "2027-12-31" }], lookups, by)
  assert.equal(po.inventoryStatus, "started")
  // Extras 40 shared by value: hammer 80/100 → 32 → +3.2 a unit; glue 20/100 → 8 → +0.8 a unit.
  const step = po.stockSteps.at(-1)
  assert.equal(Math.round(step.lines[0].unitCost * 100) / 100, 11.2)
  assert.equal(Math.round(step.lines[1].unitCost * 100) / 100, 2.8)
  // Stock below zero before the receipt counts as zero, the same rule applyReceiptCost uses.
  const priorQty = Math.max(0, hammerQtyBefore)
  const expectedAvg = (priorQty * Number(hammerCostBefore ?? 0) + 4 * 11.2) / (priorQty + 4)
  assert.ok(Math.abs((await products.get(hammer.ItemId)).averageCost - expectedAvg) < 1e-6, "moving average includes landed cost")
  assert.equal((await qty(hammer.ItemId)).onOrder, onOrderBefore - 4, "received stock left on order")
  po = await purchasing.receiveLines(po, [{ lineId: po.lines[0].lineId, qty: 6, binCode: "A-01" }], lookups, by)
  assert.equal(po.inventoryStatus, "fulfilled")
  console.log(`ok  ${po.number}: freight 30 + duty 10 by value → landed 11.20 and 2.80, lot ${lotNumber} received, average cost moved, received in two parts → fulfilled`)

  // 7. Reorder: point above anticipated lists it and alerts once; the next run does not alert again (spec 0014).
  const q = await qty(glue.ItemId)
  const existing = (await reorder.reorderSettings.list({ filter: { productId: glue.ItemId, locationId: main.ItemId } })).items[0]
  const settingId = existing?.ItemId ?? (await reorder.reorderSettings.create({ productId: glue.ItemId, locationId: main.ItemId, reorderPoint: q.anticipated + 5, reorderQty: 20, method: "purchase", vendorId: vendor.ItemId }))
  await reorder.reorderSettings.update(settingId, { reorderPoint: q.anticipated + 5, reorderQty: 20, isAlerting: false })
  const first = await reorder.runReorderCheck()
  const listed = first.suggestions.find((row) => row.productId === glue.ItemId && row.locationId === main.ItemId)
  assert.ok(listed, "listed below its point")
  assert.equal(listed.suggestedQty, 20)
  assert.ok(first.alerts.some((alert) => alert.settingId === settingId && alert.alerting), "alerted")
  const again = await reorder.runReorderCheck()
  assert.ok(!again.alerts.some((alert) => alert.settingId === settingId), "no repeat alert while still low")
  await reorder.reorderSettings.update(settingId, { reorderPoint: 0 })
  const cleared = await reorder.runReorderCheck()
  assert.ok(cleared.alerts.some((alert) => alert.settingId === settingId && !alert.alerting), "re armed once above the point")
  console.log(`ok  reorder: glue listed (anticipated ${q.anticipated} < ${q.anticipated + 5}, suggest 20), alerted once, no repeat, re armed after`)

  // 8. Reports add up to the documents (spec 0015 AC-1).
  const today = new Date().toISOString().slice(0, 10)
  const salesByProduct = await REPORTS.find((r) => r.key === "sales-by-product").load({ from: today, to: today, productId: hammer.ItemId }, lookups)
  // Worked out independently: every order read, the day checked here, not in the filter.
  const start = new Date(`${today}T00:00:00`).getTime()
  const end = new Date(`${today}T23:59:59.999`).getTime()
  const orders = (await salesOrders.list({ filter: { isQuote: false, isCancelled: { $ne: true } }, pageSize: 1000 })).items.filter((o) => new Date(o.orderDate).getTime() >= start && new Date(o.orderDate).getTime() <= end)
  const expected = orders.flatMap((o) => o.lines.filter((l) => l.productId === hammer.ItemId && l.stdQty > 0).map((l) => (l.qty * l.unitPrice) / (o.exchangeRate || 1))).reduce((s, v) => s + v, 0)
  assert.ok(expected > 0, "today's hammer sales are in the data")
  assert.ok(Math.abs(salesByProduct.reduce((s, r) => s + r.revenue, 0) - expected) < 1e-6, "report matches the orders")
  for (const report of REPORTS) await report.load({ from: today, to: today }, { ...lookups, rates: [], vendorItems: itemRows.items })
  console.log(`ok  reports: all 20 load; sales by product for hammers today = ${expected.toFixed(2)}, matching the orders`)

  // 9. Posting fix: a failed adjustment retried later posts the line that failed (fresh key generation).
  const reason = reasons.items.find((row) => row.name === "Count correction")
  const line = (product, n, direction) => ({ key: crypto.randomUUID(), productId: product.ItemId, uom: product.standardUom, qty: String(n), direction, binCode: "", toBinCode: "", lotNumber: "", lotExpiresOn: "", serial: "" })
  const big = (await onHand(hammer.ItemId)) + 5
  await assert.rejects(stockActions.createAdjustment({ locationId: main.ItemId, reasonId: reason.ItemId, adjustedAt: new Date().toISOString(), remarks: "Check: retry", lines: [line(hammer, 1, "in"), line(hammer, big, "out")], lookups: stockLookups, allowNegative: false }))
  const failed = (await stock.stockAdjustments.list({ filter: { remarks: "Check: retry" }, sort: { CreatedDate: -1 }, pageSize: 1 })).items[0]
  const beforeRetry = await onHand(hammer.ItemId)
  await stockActions.retryAdjustment(failed, stockLookups, true)
  assert.equal(await onHand(hammer.ItemId), beforeRetry + 1 - big, "both lines posted on retry, once each")
  await stockActions.cancelAdjustment({ ...failed, status: "posted" })
  assert.equal(await onHand(hammer.ItemId), beforeRetry, "cancel reversed exactly the posted lines, not the undone ones")
  console.log(`ok  ${failed.number}: failed, retried (both lines posted once), cancelled (reversed once)`)

  // 10. Ledger: every balance equals the sum of its posted movements.
  const [bals, mvs] = await Promise.all([stock.posting.balances({}, { pageSize: 5000 }), stock.posting.movements({ status: "posted" }, { pageSize: 5000 })])
  const keyOf = (x) => [x.productId, x.locationId, x.sublocationId ?? "", x.lotId ?? "", x.serial ?? ""].join("|")
  const sums = new Map()
  for (const m of mvs.items) sums.set(keyOf(m), (sums.get(keyOf(m)) ?? 0) + m.qtyDelta)
  const mismatches = bals.items.filter((b) => Math.abs((sums.get(keyOf(b)) ?? 0) - b.onHand) > 1e-9)
  assert.equal(mismatches.length, 0, `balances match the ledger (${mismatches.length} off)`)
  console.log(`ok  ledger: ${bals.items.length} balances equal the sum of ${mvs.items.length} posted movements`)
} finally {
  await vite.close()
}
