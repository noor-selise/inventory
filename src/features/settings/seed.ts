import { blocksClient } from "@/lib/blocks/client"
import { createStore, runSeed, type SeedReport } from "./seed-runner.ts"

// The dashboard's Starter data card runs these with the signed in admin's session.
// The data and logic live in seed-data.ts and seed-runner.ts, shared with
// scripts/seed-dummy.mjs.

export type { SeedReport }

const store = () => createStore(blocksClient)

export function seedStarterSettings(): Promise<SeedReport> {
  return runSeed(store(), { starterSettings: true })
}

export function seedSampleCatalog(): Promise<SeedReport> {
  return runSeed(store(), {
    sampleCatalog: true,
    demoLocations: true,
    demoPartnersAndPrices: true,
    openingStock: true,
  })
}
