// Live check of the stock posting step (spec 0026) against the Blocks project.
// Uses a machine client; every probe nets back to zero and is labelled
// "Posting check" in the ledger.
//
//   BLOCKS_SEED_CLIENT_ID=... BLOCKS_SEED_CLIENT_SECRET=... node scripts/checks/posting-live.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createBlocksClient } from "@seliseblocks/client"

import { PostingError, createPosting } from "../../src/features/stock/posting.ts"

const env = (name) => process.env[name] ?? readFileSync(".env", "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))?.[1].trim()
const base = { apiUrl: env("VITE_BLOCKS_API_URL"), appDomain: env("VITE_BLOCKS_APP_DOMAIN"), xBlocksKey: env("VITE_BLOCKS_X_BLOCKS_KEY") }
const token = await createBlocksClient(base).auth.oidc.clientCredentials({
  clientId: process.env.BLOCKS_SEED_CLIENT_ID,
  clientSecret: process.env.BLOCKS_SEED_CLIENT_SECRET,
})
const client = createBlocksClient({ ...base, accessToken: token.access_token ?? token.accessToken })
const posting = createPosting(client)

async function one(schema, filter, fields) {
  const response = await client.data.graphql({
    query: `query q($input: DynamicQueryInput) { get${schema}s(input: $input) { items { ItemId ${fields} } } }`,
    variables: { input: { filter: JSON.stringify(filter), pageNo: 1, pageSize: 1 } },
  })
  return response.data[`get${schema}s`].items[0]
}

const van = await one("Location", { name: "Delivery van 1" }, "name")
const hammer = await one("Product", { sku: "SAMPLE-0012" }, "name")
const drill = await one("Product", { sku: "SAMPLE-0008" }, "name")
assert.ok(van && hammer && drill, "Seed the demo data first (locations and catalog).")

const run = Date.now()
const note = "Posting check"
const line = (lineId, qtyDelta, extra = {}) => ({ lineId, productId: hammer.ItemId, locationId: van.ItemId, qtyDelta, ...extra })
const onHand = async (productId, serial = null) =>
  (await posting.readBalance({ productId, locationId: van.ItemId, sublocationId: null, lotId: null, serial }))?.onHand ?? 0

const start = await onHand(hammer.ItemId)
console.log(`van hammer on hand at start: ${start}`)

await posting.postLine(line("in", 10), { sourceType: "adjustment", sourceId: `check-${run}-in`, note })
assert.equal(await onHand(hammer.ItemId), start + 10)
console.log("ok  received 10")

const results = await Promise.allSettled(
  Array.from({ length: 12 + start }, (_, index) =>
    posting.postLine(line("out", -1), { sourceType: "adjustment", sourceId: `check-${run}-out-${index}`, note })
  )
)
const wins = results.filter((result) => result.status === "fulfilled").length
const refused = results.filter((result) => result.status === "rejected" && result.reason instanceof PostingError && result.reason.code === "insufficient_stock").length
const other = results.filter((result) => result.status === "rejected" && !(result.reason instanceof PostingError && result.reason.code === "insufficient_stock"))
console.log(`    ${12 + start} takes of 1 at once: ${wins} posted, ${refused} refused for stock, ${other.length} other errors`)
for (const failure of other) console.log("    other error:", failure.reason?.code, failure.reason?.message)
assert.equal(await onHand(hammer.ItemId), 0, "on hand must end at exactly 0")
assert.equal(wins, start + 10)
console.log("ok  no lost update, never below zero")

await posting.postLine(line("in", 10), { sourceType: "adjustment", sourceId: `check-${run}-in`, note })
assert.equal(await onHand(hammer.ItemId), 0)
console.log("ok  retrying an already posted line changes nothing")

if (start > 0) {
  await posting.postLine(line("restore", start), { sourceType: "adjustment", sourceId: `check-${run}-restore`, note })
}

const serial = `CHECK-${run}`
const serialLine = (lineId, qtyDelta) => ({ lineId, productId: drill.ItemId, locationId: van.ItemId, serial, qtyDelta })
await posting.postLine(serialLine("sn-in", 1), { sourceType: "adjustment", sourceId: `check-${run}-sn`, note })
await assert.rejects(
  posting.postLine(serialLine("sn-twice", 1), { sourceType: "adjustment", sourceId: `check-${run}-sn2`, note }),
  (error) => error instanceof PostingError && error.code === "serial_out_of_range"
)
await posting.postLine(serialLine("sn-out", -1), { sourceType: "adjustment", sourceId: `check-${run}-sn3`, note })
assert.equal(await onHand(drill.ItemId, serial), 0)
console.log("ok  a serial can only be in stock once")

const repaired = await posting.repairPending()
console.log(`ok  repair ran (settled ${repaired.posted} posted, ${repaired.failed} failed)`)
console.log(`van hammer on hand at end: ${await onHand(hammer.ItemId)}`)
