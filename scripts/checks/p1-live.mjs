// Live check of the P1 parts of specs 0011 to 0015 (choices in spec 0027):
// credit hold and confirm, picking session, fulfillment queue, rep filter,
// PO approval limits, last vendor and price list update, suggested reorder
// point, the once a day reorder run, background reports and saved widgets.
// Runs the app's own modules through Vite in Node with a machine client token.
// It sends no email or notification: the daily run gets a stand in sender.
// Documents it creates are marked "Check:" and cancelled; settings it changes
// are put back.
//
//   BLOCKS_SEED_CLIENT_ID=... BLOCKS_SEED_CLIENT_SECRET=... node scripts/checks/p1-live.mjs
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
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
const by = "p1-live check"
const cleanup = []
try {
  const load = (path) => vite.ssrLoadModule(path)
  const sales = await load("/src/features/sales/actions.ts")
  const { salesOrders } = await load("/src/features/sales/api.ts")
  const purchasing = await load("/src/features/purchasing/actions.ts")
  const { partyBalances } = await load("/src/features/payments/api.ts")
  const reorder = await load("/src/features/reorder/api.ts")
  const { unitsSold, suggestedPoint } = await load("/src/features/reorder/suggest.ts")
  const { REPORTS } = await load("/src/features/reports/definitions.ts")
  const jobs = await load("/src/features/reports/jobs.ts")
  const team = await load("/src/features/team/profile.ts")
  const stock = await load("/src/features/stock/api.ts")
  const stockActions = await load("/src/features/stock/actions.ts")
  const { dateFilter } = await load("/src/lib/blocks/data.ts")
  const { products, vendorItems } = await load("/src/features/products/api.ts")
  const { customers, vendors } = await load("/src/features/partners/api.ts")
  const { locations, sublocations } = await load("/src/features/locations/api.ts")
  const settings = await load("/src/features/settings/api.ts")

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
    vendorItems: itemRows.items,
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
  const others = locationRows.items.filter((row) => row.ItemId !== main.ItemId && row.isActive !== false)
  const hammer = sku("SAMPLE-0012")
  const glue = sku("SAMPLE-0017")
  const customer = customerRows.items.find((row) => (row.currencyCode ?? "USD") === lookups.homeCurrency) ?? customerRows.items[0]
  const noTax = schemes.items.find((row) => row.isDefault)
  const onHand = async (productId, locationId) => (await stock.posting.balances({ productId, locationId }, { pageSize: 500 })).items.reduce((sum, row) => sum + row.onHand, 0)
  const salesLine = (product, n, price) => ({
    lineId: crypto.randomUUID(), productId: product.ItemId, description: null, qty: n, uom: product.standardUom, stdQty: n, unitPrice: price,
    discountType: null, discount: null, taxCodeId: null, serviceDone: false, returnAction: null, pickedQty: 0, packedQty: 0, shippedQty: 0, restockedQty: 0,
  })
  const salesDraft = (lines, extra = {}) => ({
    isQuote: false, customerId: customer.ItemId, contact: null, billingAddress: null, shippingAddress: null, locationId: main.ItemId, orderDate: new Date().toISOString(),
    dueDate: null, requestedShipDate: null, currencyCode: lookups.homeCurrency, exchangeRate: 1, pricingSchemeId: null, taxingSchemeId: noTax?.ItemId ?? null,
    paymentTermId: null, salesRepUserId: null, customerPoNumber: null, freight: 0, remarks: "Check: p1", source: "manual", priority: 0, lines, ...extra,
  })
  const cancelLater = (order) => cleanup.push(() => sales.cancelSalesOrder(order, lookups, by))

  // 1. Credit hold (spec 0011 AC-9): over the limit → Unconfirmed, no picking, confirm releases, a higher total holds again.
  const originalLimit = customer.creditLimit ?? null
  cleanup.push(() => customers.update(customer.ItemId, { creditLimit: originalLimit }))
  const balance = (await partyBalances.list({ filter: { party: "customer", partyId: customer.ItemId, currencyCode: lookups.homeCurrency } })).items[0]
  const open = Number(balance?.openBalance ?? 0)
  await customers.update(customer.ItemId, { creditLimit: Math.max(1, open + 10) })
  let held = await sales.createSalesOrder(salesDraft([salesLine(hammer, 1, 50)]), lookups, by)
  cancelLater(held)
  assert.equal(held.needsConfirmation, true)
  assert.equal(held.inventoryStatus, "unconfirmed")
  assert.equal(held.paymentStatus, "unconfirmed")
  await assert.rejects(sales.pickAll(held, lookups, by), /credit limit/)
  held = await sales.confirmSalesOrder(held, lookups, by)
  assert.equal(held.inventoryStatus, "unfulfilled", "confirm releases the order")
  const draftOf = (order, lines) => ({ ...salesDraft(lines), customerId: order.customerId })
  held = await sales.updateSalesOrder(held.ItemId, draftOf(held, [{ ...held.lines[0], qty: 2, stdQty: 2 }]), lookups, by)
  assert.equal(held.inventoryStatus, "unconfirmed", "a higher total needs confirming again")
  await customers.update(customer.ItemId, { creditLimit: originalLimit })
  const free = await sales.createSalesOrder(salesDraft([salesLine(hammer, 1, 50)]), lookups, by)
  cancelLater(free)
  assert.equal(free.needsConfirmation, false, originalLimit ? "within the real limit" : "no limit, no hold")
  // The later steps make large test orders; 0 means no limit until cleanup puts the real one back.
  await customers.update(customer.ItemId, { creditLimit: 0 })
  console.log(`ok  ${held.number}: over a credit limit of ${open + 10} → unconfirmed, pick refused, confirmed → unfulfilled, raised total → unconfirmed again; ${free.number} not held`)

  // 2. Picking session (spec 0011 AC-11): locks to one person; per line report; stop releases.
  const empty = productRows.items.find((row) => row.itemType === "stocked" && !row.trackLots && !row.trackSerials && row.ItemId !== hammer.ItemId && row.ItemId !== glue.ItemId)
  const emptyStock = await onHand(empty.ItemId, main.ItemId)
  let session = await sales.createSalesOrder(salesDraft([salesLine(hammer, 1, 20), salesLine(empty, emptyStock + 5, 20)]), lookups, by)
  cancelLater(session)
  const started = await sales.startPicking(session, lookups, "picker A")
  const report = Object.fromEntries(started.lines.map((row) => [lookups.productOf(session.lines.find((line) => line.lineId === row.lineId).productId).sku, row]))
  assert.equal(report[hammer.sku].status, "ready")
  assert.ok(["short", "out_of_stock"].includes(report[empty.sku].status), `the line without enough stock is reported (${report[empty.sku].status})`)
  session = await salesOrders.get(session.ItemId)
  await assert.rejects(sales.pickLines(session, [started.picks[0]], lookups, "picker B"), /picker A is picking/)
  await assert.rejects(sales.startPicking(session, lookups, "picker B"), /picker A is picking/)
  await assert.rejects(sales.stopPicking(session, "picker B"), /picker A is picking/)
  await sales.stopPicking(session, "picker A")
  session = await salesOrders.get(session.ItemId)
  assert.equal(sales.pickingLockHolder(session), null, "stop picking ends the lock")
  session = await sales.pickLines(session, [started.picks.find((pick) => session.lines.find((line) => line.lineId === pick.lineId).productId === hammer.ItemId)], lookups, "picker B")
  assert.equal(session.lines.find((line) => line.productId === hammer.ItemId).pickedQty, 1)
  console.log(`ok  ${session.number}: picker A locked it, B refused for pick, start and stop; report: hammer ready, ${empty.sku} ${report[empty.sku].status}; A stopped, B picked`)

  // 2b. Only expired lots: stock in an expired lot at another location is reported, not picked (spec 0011 AC-11, spec 0009).
  const reason = reasons.items.find((row) => row.name === "Count correction") ?? reasons.items[0]
  const nowIso = new Date().toISOString()
  let other
  for (const candidate of others) {
    const held = (await stock.posting.balances({ productId: glue.ItemId, locationId: candidate.ItemId, onHand: { $gt: 0 } }, { pageSize: 500 })).items
    const heldLots = held.length ? (await stock.lots.list({ filter: { ItemId: { $in: held.map((row) => row.lotId).filter(Boolean) } }, pageSize: 200 })).items : []
    if (held.every((row) => heldLots.find((lot) => lot.ItemId === row.lotId)?.expiresOn < nowIso)) {
      other = candidate
      break
    }
  }
  if (!other) throw new Error("No location without good glue stock for the expired lot check.")
  const expiredLot = `CHK-EXP-${Date.now().toString().slice(-6)}`
  await stockActions.createAdjustment({ locationId: other.ItemId, reasonId: reason.ItemId, adjustedAt: new Date().toISOString(), remarks: "Check: expired lot", allowNegative: false, lookups: stockLookups,
    lines: [{ key: crypto.randomUUID(), productId: glue.ItemId, uom: glue.standardUom, qty: "2", direction: "in", binCode: "", toBinCode: "", lotNumber: expiredLot, lotExpiresOn: "2020-01-31", serial: "" }] })
  const adjustment = (await stock.stockAdjustments.list({ filter: { remarks: "Check: expired lot" }, sort: { CreatedDate: -1 }, pageSize: 1 })).items[0]
  cleanup.push(() => stockActions.cancelAdjustment(adjustment))
  const glueAtOther = (await stock.posting.balances({ productId: glue.ItemId, locationId: other.ItemId, onHand: { $gt: 0 } }, { pageSize: 500 })).items
  const lotsAtOther = (await stock.lots.list({ filter: { ItemId: { $in: glueAtOther.map((row) => row.lotId).filter(Boolean) } }, pageSize: 100 })).items
  if (lotsAtOther.every((lot) => lot.expiresOn && lot.expiresOn < new Date().toISOString())) {
    let expired = await sales.createSalesOrder(salesDraft([salesLine(glue, 1, 5)], { locationId: other.ItemId }), lookups, by)
    cancelLater(expired)
    const result = await sales.startPicking(expired, lookups, "picker A")
    assert.equal(result.lines[0].status, "expired_only")
    assert.equal(result.picks.length, 0)
    await sales.stopPicking(result.order, "picker A")
    console.log(`ok  ${expired.number}: glue at ${other.name} held only in expired lot ${expiredLot} → reported "only expired lots", nothing suggested`)
  } else console.log(`skip expired lot report: glue has unexpired stock at ${other.name}`)

  // 3. Fulfillment queue (spec 0011 AC-10): stock goes to the higher priority first; changing priority flips it.
  const a = { ...salesDraft([salesLine(hammer, 1, 1)]), ItemId: "a", number: "A", priority: 2, inventoryStatus: "unfulfilled" }
  const b = { ...salesDraft([salesLine(hammer, 1, 1)]), ItemId: "b", number: "B", priority: 1, inventoryStatus: "unfulfilled" }
  const one = [{ productId: hammer.ItemId, locationId: main.ItemId, onHand: 1 }]
  let queue = sales.buildQueue([b, a], one, lookups, () => false)
  assert.deepEqual(queue.map((row) => [row.order.number, row.canShipNow]), [["A", true], ["B", false]])
  queue = sales.buildQueue([{ ...a, priority: 0 }, b], one, lookups, () => false)
  assert.deepEqual(queue.map((row) => [row.order.number, row.canShipNow]), [["B", true], ["A", false]])
  assert.equal(sales.buildQueue([a], [{ ...one[0], lotId: "old" }], lookups, () => true)[0].canShipNow, false, "expired lots do not count")
  const prioritized = await sales.setPriority(free, 7, by)
  assert.equal((await salesOrders.get(free.ItemId)).priority, 7)
  assert.equal(prioritized.history.at(-1).action, "priority changed")
  console.log(`ok  queue: one hammer goes to the higher priority order; swapping priority flips it; expired lots ignored; ${free.number} priority 7 saved with history`)

  // 4. Rep restriction (spec 0011 AC-8) and per person settings (spec 0027).
  const repA = `check-rep-${Date.now()}`
  await team.saveProfile(repA, { ownCustomersOnly: true, dashboardWidgets: ["low_stock"] })
  await team.saveProfile(repA, { poApprovalLimit: 100 })
  const saved = await team.profileFor(repA)
  cleanup.push(() => team.teamProfiles.remove(saved.ItemId))
  assert.equal(saved.ownCustomersOnly, true)
  assert.deepEqual(saved.dashboardWidgets, ["low_stock"])
  assert.equal(saved.poApprovalLimit, 100)
  assert.equal((await team.teamProfiles.list({ filter: { userId: repA } })).totalCount, 1, "one profile per person")
  const mine = await sales.createSalesOrder(salesDraft([salesLine(hammer, 1, 1)], { salesRepUserId: repA }), lookups, by)
  cancelLater(mine)
  const seen = (await salesOrders.list({ filter: { salesRepUserId: repA }, pageSize: 50 })).items
  assert.deepEqual(seen.map((row) => row.number), [mine.number], "the rep filter returns only their orders")
  console.log(`ok  profile saved twice → one record (own customers only, widgets, limit 100); rep filter returns only ${mine.number}`)

  // 5. PO approval by limit (spec 0012 AC-3).
  const vendor = vendorRows.items.find((row) => itemRows.items.some((item) => item.vendorId === row.ItemId && item.productId === glue.ItemId)) ?? vendorRows.items[0]
  const poDraft = (price) => ({ isQuote: false, vendorId: vendor.ItemId, receiveLocationId: main.ItemId, orderDate: new Date().toISOString(), currencyCode: lookups.homeCurrency, exchangeRate: 1, taxingSchemeId: noTax?.ItemId ?? null, freight: 0, allocationMethod: "value", nonVendorCosts: [], remarks: "Check: approval",
    lines: [{ lineId: crypto.randomUUID(), productId: glue.ItemId, vendorItemCode: null, qty: 10, uom: glue.standardUom, stdQty: 10, unitPrice: price, discountType: null, discount: null, taxCodeId: null, receivedQty: 0 }] })
  const small = { by: "approver small", profile: { poApprovalLimit: 100 }, isAdmin: false }
  const big = { by: "approver big", profile: { poApprovalLimit: 1000 }, isAdmin: false }
  let po = await purchasing.createPurchaseOrder(poDraft(50), lookups, by, small)
  cleanup.push(() => purchasing.cancelPurchaseOrder(po, by))
  assert.equal(po.inventoryStatus, "unapproved", "500 is over the saver's limit of 100")
  assert.equal(po.paymentStatus, "unapproved")
  await assert.rejects(purchasing.approvePurchaseOrder(po, small), /approval limit/)
  await assert.rejects(purchasing.receiveLines(po, [{ lineId: po.lines[0].lineId, qty: 1, lotNumber: "CHK-APR", lotExpiresOn: "2028-01-31" }], lookups, by), /waits for approval/)
  po = await purchasing.approvePurchaseOrder(po, big)
  assert.equal(po.inventoryStatus, "unfulfilled")
  assert.equal(po.approvedBy, "approver big")
  po = await purchasing.updatePurchaseOrder(po.ItemId, { ...poDraft(150), lines: po.lines.map((line) => ({ ...line, unitPrice: 150 })) }, lookups, by, small)
  assert.equal(po.inventoryStatus, "unapproved", "raising the total to 1500 needs approval again")
  const auto = await purchasing.createPurchaseOrder(poDraft(5), lookups, by, small)
  cleanup.push(() => purchasing.cancelPurchaseOrder(auto, by))
  assert.equal(auto.inventoryStatus, "unfulfilled", "50 is within the saver's own limit, so it is approved on save")
  assert.equal(team.canApprove(undefined, 1e9, true), true, "an admin with no limit has no ceiling")
  assert.equal(team.canApprove(undefined, 1, false), false, "no limit, not admin: cannot approve")
  console.log(`ok  ${po.number}: 500 over limit 100 → unapproved, small refused, receive refused, big approved; raised to 1500 → unapproved again; ${auto.number} (50) approved on save`)

  // 6. Last vendor and vendor price list (spec 0012 AC-7).
  const item = itemRows.items.find((row) => row.vendorId === vendor.ItemId && row.productId === glue.ItemId)
  if (item) cleanup.push(() => vendorItems.update(item.ItemId, { unitCost: item.unitCost ?? null }))
  const lastLot = `CHK-LV-${Date.now().toString().slice(-6)}`
  const received = await purchasing.receiveLines(auto, [{ lineId: auto.lines[0].lineId, qty: 1, lotNumber: lastLot, lotExpiresOn: "2028-06-30" }], lookups, by)
  assert.equal((await products.get(glue.ItemId)).lastVendorId, vendor.ItemId, "the product remembers its last vendor")
  const changes = purchasing.vendorPriceChanges(received, (await vendorItems.list({ pageSize: 2000 })).items, lookups.homeCurrency)
  const sameCurrency = !item || (item.currencyCode || lookups.homeCurrency) === lookups.homeCurrency
  if (sameCurrency && Number(item?.unitCost ?? -1) !== 5) {
    assert.equal(changes.length, 1)
    assert.equal(changes[0].newCost, 5)
    await purchasing.applyVendorPrices(received, changes)
    const after = (await vendorItems.list({ filter: { vendorId: vendor.ItemId, productId: glue.ItemId } })).items[0]
    assert.equal(after.unitCost, 5)
    if (!item) cleanup.push(() => vendorItems.remove(after.ItemId))
    console.log(`ok  ${auto.number}: received 1 → glue's last vendor is ${vendor.name}; price list ${item?.unitCost ?? "none"} → 5 after the prompt (put back at the end)`)
  } else console.log(`ok  ${auto.number}: received 1 → last vendor ${vendor.name}; price list already matches or is in another currency, no prompt (${changes.length})`)
  // The received unit goes back out when the PO is cancelled in cleanup.

  // 7. Suggested reorder point (spec 0014 AC-5): 90 day sales × lead time + safety stock.
  const setting = (await reorder.reorderSettings.list({ filter: { productId: hammer.ItemId, locationId: main.ItemId } })).items[0]
  let settingId = setting?.ItemId
  if (!setting) {
    settingId = await reorder.reorderSettings.create({ productId: hammer.ItemId, locationId: main.ItemId, reorderPoint: 0, reorderQty: 10, method: "purchase", vendorId: vendor.ItemId, safetyStock: 3 })
    cleanup.push(() => reorder.reorderSettings.remove(settingId))
  } else {
    cleanup.push(() => reorder.reorderSettings.update(settingId, { safetyStock: setting.safetyStock ?? 0 }))
    await reorder.reorderSettings.update(settingId, { safetyStock: 3 })
  }
  const current = await reorder.reorderSettings.get(settingId)
  const hints = await reorder.suggestedPoints([current])
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const moves = await stock.posting.movements({ productId: hammer.ItemId, locationId: main.ItemId, sourceType: { $in: ["sales_pick", "sales_reversal"] }, status: "posted", effectiveAt: { $gte: dateFilter(since) } }, { pageSize: 5000 })
  const sold = unitsSold(moves.items).get(`${hammer.ItemId}|${main.ItemId}`) ?? 0
  // The reorder point's own vendor, else the most preferred vendor item (the app's rule).
  const hammerItems = (await vendorItems.list({ filter: { productId: hammer.ItemId } })).items
  const lead = (hammerItems.find((row) => row.vendorId === current.vendorId) ?? [...hammerItems].sort((x, y) => Number(x.preference ?? 99) - Number(y.preference ?? 99))[0])?.leadTimeDays
  const expected = suggestedPoint(sold, lead, 3)
  assert.equal(hints.get(settingId).point, expected.point)
  assert.ok(sold > 0, "the checks above sold hammers")
  assert.equal(suggestedPoint(90, 10, 5).point, 15, "90 sold in 90 days = 1 a day × 10 days + 5")
  console.log(`ok  suggested point for hammer: ${sold} sold in 90 days × ${lead ?? 0} days lead time + 3 safety = ${expected.point}; formula 90/90×10+5 = 15`)

  // 8. Once a day run (spec 0027): the first run of a day works, the second that day does nothing.
  const day = `check-${Date.now()}`
  const sent = []
  const first = await reorder.runDailyReorderCheck(day, async (outcome) => (sent.push(outcome), { count: outcome.alerts.filter((x) => x.alerting).length, inApp: "stand in", email: "stand in" }))
  const second = await reorder.runDailyReorderCheck(day, async () => assert.fail("must not run twice"))
  const runs = (await reorder.workflowRuns.list({ filter: { runKey: `reorder-check:${day}` } })).items
  for (const run of runs) cleanup.push(() => reorder.workflowRuns.remove(run.ItemId))
  assert.ok(first && first.outcome, "the first run of the day ran")
  assert.equal(second, null, "the second run the same day skipped")
  assert.equal(runs.length, 1)
  assert.equal(runs[0].status, "success")
  assert.equal(sent.length, 1, "alerts handed to the sender once")
  console.log(`ok  daily run ${day}: ran once (${first.outcome.suggestions.length} below point, run recorded as success), second call skipped`)

  // 9. Background report (spec 0015 AC-5, AC-4): job status, CSV in storage, download link, cost columns left out.
  const profitReport = REPORTS.find((row) => row.columns.some((column) => column.cost))
  const noCost = profitReport.columns.filter((column) => !column.cost)
  const { jobId, done } = await jobs.startBackgroundReport({ report: profitReport, filters: {}, columns: noCost, lookups, ownerId: "p1-live check" })
  const early = await jobs.reportJobs.get(jobId)
  assert.ok(["not_started", "in_progress", "success"].includes(early.status))
  await done
  const job = await jobs.reportJobs.get(jobId)
  cleanup.push(() => jobs.reportJobs.remove(jobId))
  assert.equal(job.status, "success", job.error ?? "")
  assert.ok(job.fileId)
  // The file is private to its creator. A machine client has no user id, so the
  // file has no creator and only the project owner can read it: fetch the link
  // through the CLI's owner session instead, and confirm the app call is refused.
  await assert.rejects(jobs.jobDownloadUrl(job.fileId), /no download link/)
  const fileInfo = JSON.parse(execFileSync("blocks", ["data", "files", "get", job.fileId, "--configuration-name", "Default", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))
  assert.equal(fileInfo.objectAccessLevel, "Creator")
  const csv = await (await fetch(fileInfo.url)).text()
  const header = csv.split("\n")[0]
  assert.equal(header, noCost.map((column) => column.label).join(","), "the file has exactly the allowed columns")
  for (const column of profitReport.columns.filter((column) => column.cost)) assert.ok(!header.split(",").includes(column.label), `${column.label} left out`)
  assert.equal(jobs.isStale({ status: "in_progress", startedAt: new Date(Date.now() - 31 * 60_000).toISOString() }), true)
  console.log(`ok  background "${profitReport.title}": ${early.status} → success, ${job.rowCount} rows, CSV stored private to its creator, downloaded, cost columns not in the file`)
} finally {
  // Undo in reverse order; report but do not hide failures.
  for (const step of cleanup.reverse()) {
    try {
      await step()
    } catch (error) {
      console.log(`cleanup: ${error.message}`)
    }
  }
  await vite.close()
}
