// Live check of company isolation (spec 0003 AC-2, build step 4b): a record
// created in organization A must not be readable from organization B.
// It creates one AdjustmentReason named "Check: isolation <time>" with A,
// confirms A can read it, confirms B cannot, then deletes it.
//
// It needs a session in each of two different organizations. Pass either
// access tokens or machine client credentials for each side:
//
//   ORG_A_TOKEN=... ORG_B_TOKEN=... node scripts/checks/org-isolation-live.mjs
//   ORG_A_CLIENT_ID=... ORG_A_CLIENT_SECRET=... ORG_B_CLIENT_ID=... ORG_B_CLIENT_SECRET=... node scripts/checks/org-isolation-live.mjs
//
// The second organization is a one time setup the project owner reviews and
// runs (it changes the live project, so this script never creates it):
//
//   blocks iam organizations config get
//   blocks iam organizations create --name "Isolation check" --dry-run
//   blocks iam organizations create --name "Isolation check" --yes
//
// The script refuses to run unless both sessions carry an organization claim
// and the two claims differ, so a wrong setup cannot pass by accident.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createBlocksClient } from "@seliseblocks/client"

const env = (name) => readFileSync(".env", "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))?.[1].trim()
const config = {
  apiUrl: env("VITE_BLOCKS_API_URL"),
  appDomain: env("VITE_BLOCKS_APP_DOMAIN"),
  xBlocksKey: env("VITE_BLOCKS_X_BLOCKS_KEY"),
}

async function tokenFor(side) {
  const given = process.env[`ORG_${side}_TOKEN`]
  if (given) return given
  const clientId = process.env[`ORG_${side}_CLIENT_ID`]
  const clientSecret = process.env[`ORG_${side}_CLIENT_SECRET`]
  if (!clientId || !clientSecret) throw new Error(`Set ORG_${side}_TOKEN, or ORG_${side}_CLIENT_ID and ORG_${side}_CLIENT_SECRET.`)
  const response = await createBlocksClient(config).auth.oidc.clientCredentials({ clientId, clientSecret })
  return response.access_token ?? response.accessToken
}

function orgOf(token) {
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"))
  return String(payload.org_id ?? payload.organizationId ?? payload.organization_id ?? "")
}

const tokenA = await tokenFor("A")
const tokenB = await tokenFor("B")
const orgA = orgOf(tokenA)
const orgB = orgOf(tokenB)
assert.ok(orgA && orgB, "Both sessions must carry an organization claim (org_id).")
assert.notEqual(orgA, orgB, "Both sessions are in the same organization; the check would prove nothing.")

const clientA = createBlocksClient({ ...config, accessToken: () => tokenA })
const clientB = createBlocksClient({ ...config, accessToken: () => tokenB })

const name = `Check: isolation ${new Date().toISOString()}`
const findByName = async (client) => {
  const response = await client.data.graphql({
    query: "query q($input: DynamicQueryInput) { getAdjustmentReasons(input: $input) { items { ItemId name } totalCount } }",
    variables: { input: { filter: JSON.stringify({ name }), pageNo: 1, pageSize: 5 } },
  })
  if (response.errors?.length) throw new Error(response.errors.map((error) => error.message).join("; "))
  return response.data?.getAdjustmentReasons?.items ?? []
}

const created = await clientA.data.collection("AdjustmentReason", { fields: ["ItemId"] }).create({ name, isSystem: false, isActive: false })
const itemId = created?.data?.insertAdjustmentReason?.itemId ?? created?.insertAdjustmentReason?.itemId
try {
  assert.equal((await findByName(clientA)).length, 1, "Organization A cannot read its own record.")
  assert.equal((await findByName(clientB)).length, 0, "Organization B can read organization A's record: AC-2 fails.")
  console.log(`ok: a record in ${orgA} is invisible from ${orgB} (AC-2)`)
} finally {
  const leftover = itemId ?? (await findByName(clientA))[0]?.ItemId
  if (leftover) await clientA.data.collection("AdjustmentReason", { fields: ["ItemId"] }).delete(leftover)
}
