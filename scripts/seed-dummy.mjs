#!/usr/bin/env node
// Seeds demo data into the Blocks project from the terminal, using a machine
// client (client credentials) instead of a person's password.
//
//   BLOCKS_SEED_CLIENT_ID=... BLOCKS_SEED_CLIENT_SECRET=... node scripts/seed-dummy.mjs
//
// The secret is read from the environment only and never printed. Safe to run
// again: each step adds only missing records. Needs Node 24 (loads the shared
// TypeScript seed modules with built in type stripping).
import { readFileSync } from "node:fs"
import { createBlocksClient } from "@seliseblocks/client"

import { createStore, runSeed } from "../src/features/settings/seed-runner.ts"

function env(name) {
  const fromProcess = process.env[name]
  if (fromProcess) return fromProcess
  const match = readFileSync(".env", "utf8").match(new RegExp(`^${name}=(.*)$`, "m"))
  return match?.[1].trim()
}

const clientId = process.env.BLOCKS_SEED_CLIENT_ID
const clientSecret = process.env.BLOCKS_SEED_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error("Set BLOCKS_SEED_CLIENT_ID and BLOCKS_SEED_CLIENT_SECRET (from 'blocks auth client-credentials').")
  process.exit(1)
}

const base = {
  apiUrl: env("VITE_BLOCKS_API_URL"),
  appDomain: env("VITE_BLOCKS_APP_DOMAIN"),
  xBlocksKey: env("VITE_BLOCKS_X_BLOCKS_KEY"),
}

console.log("Requesting a machine token…")
const tokenResponse = await createBlocksClient(base).auth.oidc.clientCredentials({ clientId, clientSecret })
const accessToken = tokenResponse.access_token ?? tokenResponse.accessToken
if (!accessToken) {
  console.error("Could not get a machine token:", tokenResponse.error_description ?? tokenResponse.error ?? "no access_token in response")
  process.exit(1)
}

console.log("Token ok, seeding…")
const client = createBlocksClient({ ...base, accessToken })
const store = createStore(client)
// Log each call so a slow or stuck request is visible.
// Pass every argument through: list takes an optional filter.
const logged = {
  ...store,
  list: (...args) => (console.log(`  read ${args[0]}`), store.list(...args)),
  create: (...args) => (console.log(`  add ${args[0]}`), store.create(...args)),
}
const report = await runSeed(logged, {
  demoCompany: true,
  starterSettings: true,
  demoRatesAndTaxCodes: true,
  sampleCatalog: true,
  demoLocations: true,
  demoPartnersAndPrices: true,
  openingStock: true,
  demoTeam: true,
  demoActivity: true,
})
for (const row of report) {
  console.log(`${row.label.padEnd(20)} ${String(row.added).padStart(3)} added, ${row.existing} already there`)
}
