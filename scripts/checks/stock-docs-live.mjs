// Live check of the stock document flows (spec 0008, 0009) through the app's own
// modules, loaded by Vite in Node. A machine client token stands in for the
// signed in session. Creates real documents labelled "Check:" in the demo data.
//
//   BLOCKS_SEED_CLIENT_ID=... BLOCKS_SEED_CLIENT_SECRET=... node scripts/checks/stock-docs-live.mjs
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

// The app reads a bearer token from sessionStorage when one exists (src/lib/blocks/auth.ts).
const store = new Map([["inventory:access-token", token.access_token ?? token.accessToken]])
globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
globalThis.window = { location: { origin: env("VITE_BLOCKS_APP_DOMAIN") } }

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" })
try {
  const load = (path) => vite.ssrLoadModule(path)
  const actions = await load("/src/features/stock/actions.ts")
  const api = await load("/src/features/stock/api.ts")
  const { locations, sublocations } = await load("/src/features/locations/api.ts")
  const { products } = await load("/src/features/products/api.ts")
  const { adjustmentReasons } = await load("/src/features/settings/api.ts")

  async function lookups() {
    const [l, b, p, r, lt] = await Promise.all([
      locations.list({ pageSize: 500 }),
      sublocations.list({ pageSize: 2000 }),
      products.list({ pageSize: 1000 }),
      adjustmentReasons.list({ pageSize: 200 }),
      api.lots.list({ pageSize: 2000 }),
    ])
    return {
      locations: l.items, bins: b.items, products: p.items, reasons: r.items, lots: lt.items,
      locationName: (id) => l.items.find((x) => x.ItemId === id)?.name ?? "",
      binCode: (id) => b.items.find((x) => x.ItemId === id)?.code ?? "",
      product: (id) => p.items.find((x) => x.ItemId === id),
      lotNumber: (id) => lt.items.find((x) => x.ItemId === id)?.lotNumber ?? "",
    }
  }
  const line = (product, qty, extra = {}) => ({
    key: crypto.randomUUID(), productId: product.ItemId, uom: product.standardUom, qty: String(qty), direction: "in",
    binCode: "", toBinCode: "", lotNumber: "", lotExpiresOn: "", serial: "", ...extra,
  })
  const onHand = async (productId, locationId) =>
    (await api.posting.balances({ productId, locationId }, { pageSize: 500 })).items.reduce((sum, b) => sum + b.onHand, 0)

  let L = await lookups()
  const van = L.locations.find((x) => x.name === "Delivery van 1")
  const main = L.locations.find((x) => x.name === "Main warehouse")
  const store_ = L.locations.find((x) => x.name === "Downtown store")
  const hammer = L.products.find((x) => x.sku === "SAMPLE-0012")
  const glue = L.products.find((x) => x.sku === "SAMPLE-0017")
  const reason = L.reasons.find((x) => x.name === "Count correction")
  const run = Date.now().toString().slice(-6)

  // 1. Adjustment in, with a new bin typed on the line (spec 0006 AC-3).
  const vanStart = await onHand(hammer.ItemId, van.ItemId)
  const bin = `CHK-${run}`
  const adj = await actions.createAdjustment({ locationId: van.ItemId, reasonId: reason.ItemId, adjustedAt: new Date().toISOString(), remarks: "Check: add 5", lines: [line(hammer, 5, { binCode: bin })], lookups: L, allowNegative: false })
  assert.equal(await onHand(hammer.ItemId, van.ItemId), vanStart + 5)
  assert.ok((await sublocations.list({ filter: { locationId: van.ItemId, code: bin } })).items[0], "bin created on the fly")
  console.log(`ok  ${adj.number}: +5 hammers in the van, bin ${bin} created on the fly`)

  // 2. Removing more than on hand is refused and leaves nothing behind.
  await assert.rejects(
    actions.createAdjustment({ locationId: van.ItemId, reasonId: reason.ItemId, adjustedAt: new Date().toISOString(), remarks: "Check: too many", lines: [line(hammer, 3, { direction: "out", binCode: bin }), line(hammer, 50, { direction: "out", binCode: bin })], lookups: L, allowNegative: false }),
    (error) => error.code === "insufficient_stock"
  )
  assert.equal(await onHand(hammer.ItemId, van.ItemId), vanStart + 5, "the first line was rolled back")
  const failed = (await api.stockAdjustments.list({ filter: { remarks: "Check: too many" }, sort: { CreatedDate: -1 }, pageSize: 1 })).items[0]
  assert.equal(failed.status, "failed")
  console.log(`ok  ${failed.number}: removing 50 refused, the line already posted was rolled back, document marked failed`)

  // 3. Cancelling reverses.
  await actions.cancelAdjustment(adj)
  assert.equal(await onHand(hammer.ItemId, van.ItemId), vanStart)
  await assert.rejects(actions.cancelAdjustment(adj), /Someone else changed/)
  console.log(`ok  ${adj.number}: cancelled with reversing movements; cancelling twice is refused`)

  // 4. Transfer with the first expiring lot suggested (spec 0009 AC-4).
  const candidates = await api.allocateLots(glue.ItemId, main.ItemId)
  assert.ok(candidates.length > 0)
  assert.ok(candidates.every((c, i) => i === 0 || (candidates[i - 1].lot.expiresOn ?? "9999") <= (c.lot.expiresOn ?? "9999")), "earliest expiry first")
  const lotNumber = candidates[0].lot.lotNumber
  const mainGlue = await onHand(glue.ItemId, main.ItemId)
  const storeGlue = await onHand(glue.ItemId, store_.ItemId)
  const tr = await actions.createTransfer({ fromLocationId: main.ItemId, toLocationId: store_.ItemId, remarks: "Check: glue to store", lines: [line(glue, 2, { lotNumber, binCode: "C-01", toBinCode: "BACK" })], lookups: L })
  await actions.sendTransfer(tr, L)
  assert.equal(await onHand(glue.ItemId, main.ItemId), mainGlue - 2)
  const inTransit = (await api.quantitiesFor(glue.ItemId)).find((q) => q.locationId === store_.ItemId)?.inTransit
  assert.equal(inTransit, 2)
  await assert.rejects(actions.sendTransfer(tr, L), /Someone else changed/)
  const sent = (await api.stockTransfers.get(tr.ItemId))
  await actions.receiveTransfer(sent, L)
  assert.equal(await onHand(glue.ItemId, store_.ItemId), storeGlue + 2)
  console.log(`ok  ${tr.number}: lot ${lotNumber} (earliest expiry) sent, 2 in transit, sending twice refused, received at the store`)

  // 5. Cancelling a transfer in transit returns the stock.
  const tr2 = await actions.createTransfer({ fromLocationId: main.ItemId, toLocationId: van.ItemId, remarks: "Check: cancel in transit", lines: [line(glue, 1, { lotNumber, binCode: "C-01" })], lookups: L })
  await actions.sendTransfer(tr2, L)
  await actions.cancelTransfer(await api.stockTransfers.get(tr2.ItemId))
  assert.equal(await onHand(glue.ItemId, main.ItemId), mainGlue - 2)
  console.log(`ok  ${tr2.number}: cancelled while in transit, the stock went back to the warehouse`)

  // 6. Count: start captures expected, variance posts once (spec 0008 AC-4 to AC-6).
  L = await lookups()
  const storeHammer = await onHand(hammer.ItemId, store_.ItemId)
  let count = await actions.createCount({ locationId: store_.ItemId, remarks: "Check: count", sheets: [{ name: "Shelf", assigneeId: null, productIds: [hammer.ItemId] }] })
  const sheetId = count.sheets[0].sheetId
  await actions.startSheet(count, sheetId)
  count = await api.stockCounts.get(count.ItemId)
  assert.equal(count.sheets[0].lines.reduce((sum, l) => sum + l.expectedQty, 0), storeHammer)
  await assert.rejects(actions.saveSheetCounts({ ...count, revision: (count.revision ?? 0) - 1 }, sheetId, {}, false), /Someone else saved/)
  const counted = Object.fromEntries(count.sheets[0].lines.map((l, i) => [l.lineId, i === 0 ? l.expectedQty - 1 : l.expectedQty]))
  await actions.saveSheetCounts(count, sheetId, counted, true)
  count = await api.stockCounts.get(count.ItemId)
  assert.equal(count.status, "in_review")
  await actions.completeCount(count, reason.ItemId, L)
  await assert.rejects(actions.completeCount(count, reason.ItemId, L), /Someone else changed/)
  assert.equal(await onHand(hammer.ItemId, store_.ItemId), storeHammer - 1)
  count = await api.stockCounts.get(count.ItemId)
  console.log(`ok  ${count.number}: expected ${storeHammer} captured on start, stale save refused, counted one less, completed once (status ${count.status})`)

  // 7. Ledger: every balance equals the sum of its posted movements.
  const [bals, mvs] = await Promise.all([api.posting.balances({}, { pageSize: 5000 }), api.posting.movements({ status: "posted" }, { pageSize: 5000 })])
  const key = (x) => [x.productId, x.locationId, x.sublocationId ?? "", x.lotId ?? "", x.serial ?? ""].join("|")
  const sums = new Map()
  for (const m of mvs.items) sums.set(key(m), (sums.get(key(m)) ?? 0) + m.qtyDelta)
  const mismatches = bals.items.filter((b) => Math.abs((sums.get(key(b)) ?? 0) - b.onHand) > 1e-9)
  assert.equal(mismatches.length, 0, "balances match the ledger")
  console.log(`ok  ledger: ${bals.items.length} balances all equal the sum of ${mvs.items.length} posted movements`)
} finally {
  await vite.close()
}
