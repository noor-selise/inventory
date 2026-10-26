#!/usr/bin/env node
// Deploys blocks/data to the Blocks project with CLI 0.9.x quirks handled:
//  1. Pushes schemas in dependency order (a schema whose field uses another
//     schema's name goes after it), one wave at a time.
//  2. CLI 0.9.0 makes newly created schemas public, so right after the push it
//     rewrites the `security` entries in blocks/data/rules.json (signed in users
//     only for read, write, edit, delete on every Entity schema), with the
//     schemaId that CLI 0.9.0 needs, and deploys them.
//  3. Adds the indexes in blocks/data/indexes.json that do not exist yet.
//  4. Reloads the gateway and prints the access summary (public must be 0).
//
//   node scripts/blocks-data-deploy.mjs --dry-run   # show the plan, change nothing
//   node scripts/blocks-data-deploy.mjs             # apply
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const workspace = JSON.parse(readFileSync(join(root, "blocks.json"), "utf8"))
const project = workspace.project.tenantId
const schemaDir = join(root, workspace.data.schemas)
const rulesPath = join(root, workspace.data.rules)
const dryRun = process.argv.includes("--dry-run")
const SCALARS = new Set(["String", "Int", "Float", "Boolean", "DateTime", "ID", "GeoJson"])

function blocks(args, cwd = root) {
  let out
  // Blocks sometimes drops a connection (502, 503, 504). Every step here is
  // safe to repeat, so wait a little and try again.
  for (let attempt = 1; ; attempt++) {
    try {
      out = execFileSync("blocks", [...args, "--project", project, "--json"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        // The schema list for 60 schemas is over Node's 1 MB default.
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, BLOCKS_STRICT_FLAGS: "1" },
      })
      break
    } catch (error) {
      if (attempt >= 4 || !/\b50[234]\b/.test(String(error.stderr ?? ""))) throw error
      console.log(`  temporary Blocks error, trying again (${attempt})`)
      execFileSync("sleep", [String(attempt * 3)])
    }
  }
  try {
    return JSON.parse(out)
  } catch {
    return out
  }
}

const files = readdirSync(schemaDir).filter((file) => file.endsWith(".json"))
const schemas = files.map((file) => ({ file, schema: JSON.parse(readFileSync(join(schemaDir, file), "utf8")) }))
const names = new Set(schemas.map(({ schema }) => schema.schemaName))

// Dependency waves.
const waves = []
const placed = new Set()
while (placed.size < schemas.length) {
  const wave = schemas.filter(
    ({ schema }) =>
      !placed.has(schema.schemaName) &&
      schema.fields.every((field) => SCALARS.has(field.type) || !names.has(field.type) || placed.has(field.type) || field.type === schema.schemaName)
  )
  if (wave.length === 0) throw new Error("Schemas reference each other in a loop; push cannot order them.")
  wave.forEach(({ schema }) => placed.add(schema.schemaName))
  waves.push(wave)
}

console.log(`Project ${project}: ${schemas.length} schemas in ${waves.length} wave(s)`)
waves.forEach((wave, index) => console.log(`  wave ${index + 1}: ${wave.map(({ schema }) => schema.schemaName).join(", ")}`))
if (dryRun) {
  console.log("Dry run: nothing pushed.")
  process.exit(0)
}

for (const [index, wave] of waves.entries()) {
  const dir = mkdtempSync(join(tmpdir(), "blocks-wave-"))
  try {
    writeFileSync(join(dir, "blocks.json"), JSON.stringify({ project: workspace.project, data: { schemas: "schemas", rules: "rules.json" } }))
    execFileSync("mkdir", ["-p", join(dir, "schemas")])
    for (const { file } of wave) copyFileSync(join(schemaDir, file), join(dir, "schemas", file))
    writeFileSync(join(dir, "rules.json"), JSON.stringify({ security: [], policies: [] }))
    const result = blocks(["data", "schema", "push", "--yes"], dir)
    console.log(`wave ${index + 1} pushed${result?.grantedPublicAccess ? ` (new: ${result.grantedPublicAccess.join(", ")})` : ""}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Lock every Entity schema to signed in users, by id.
const listed = blocks(["data", "schema", "list", "--page-size", "200"])
const idByName = new Map(listed.data.items.map((item) => [item.schemaName, item.id]))
const rules = JSON.parse(readFileSync(rulesPath, "utf8"))
rules.security = schemas
  .filter(({ schema }) => schema.schemaType === 1)
  .map(({ schema }) => schema.schemaName)
  .sort()
  .flatMap((schemaName) => {
    const schemaId = idByName.get(schemaName)
    if (!schemaId) throw new Error(`Schema ${schemaName} was not found after the push.`)
    return [0, 1, 2, 3].map((operation) => ({ schemaName, schemaId, operation, policyType: 0, accessLevel: 1, fieldNames: [] }))
  })
writeFileSync(rulesPath, `${JSON.stringify(rules, null, 2)}\n`)
blocks(["data", "rules", "deploy", "--yes"])
console.log(`rules deployed for ${rules.security.length / 4} entity schemas`)
// Indexes declared in the repo; existing ones (same fields, same order) are skipped.
const { indexes = [] } = JSON.parse(readFileSync(join(root, "blocks/data/indexes.json"), "utf8"))
const normalize = (fields) =>
  fields
    .split(",")
    .map((part) => {
      const [name, direction = "asc"] = part.split(":")
      return `${name}:${direction.toLowerCase()}`
    })
    .join(",")
const existingBySchema = new Map()
for (const index of indexes) {
  const schemaId = idByName.get(index.schema)
  if (!schemaId) throw new Error(`Index target ${index.schema} is not a pushed schema.`)
  if (!existingBySchema.has(index.schema)) {
    const listedIndexes = blocks(["data", "schema", "indexes", "list", schemaId]).data.indexes ?? []
    existingBySchema.set(
      index.schema,
      new Set(listedIndexes.map((item) => item.fields.map((field) => `${field.fieldName}:${field.direction.toLowerCase()}`).join(",")))
    )
  }
  const key = normalize(index.fields)
  if (existingBySchema.get(index.schema).has(key)) continue
  blocks(["data", "schema", "indexes", "create", "--schema-id", schemaId, "--fields", index.fields, ...(index.unique ? ["--unique"] : []), "--yes"])
  existingBySchema.get(index.schema).add(key)
  console.log(`index added: ${index.schema}(${index.fields})${index.unique ? " unique" : ""}`)
}

blocks(["data", "reload", "--yes"])
console.log("gateway reloaded")

const summary = blocks(["data", "schema", "aggregation"]).data.aggregation
console.log("access summary:", JSON.stringify(summary))
if (summary.totalPublicPermission > 0) {
  console.error("WARNING: some schemas are still public. Check `blocks data schema aggregation --json`.")
  process.exit(1)
}
