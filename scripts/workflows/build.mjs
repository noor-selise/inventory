#!/usr/bin/env node
// Builds the Blocks workflow files in blocks/workflows/ from the same functions
// the app runs, so the server and the browser compute the same numbers:
//   payment-ledger  on every Payment insert or update, and nightly: order paid
//                   amounts, payment statuses and PartyBalance (spec 0013)
//   reorder-check   nightly: the reorder list and low stock alert flags (spec 0014)
// Each Code node gets the function source (Node strips the TypeScript types).
// Data actions use the delegated login (blocksAuthentication); no secret is
// ever written to these files.
//
//   node scripts/workflows/build.mjs
// Then, per file (dry run first, publish only when you decide to):
//   blocks logic workflow import --file blocks/workflows/<name>.json --project-slug dbpgei --dry-run
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { computeLedger } from "../../src/features/payments/ledger.ts"
import { computeReorder } from "../../src/features/reorder/check.ts"
import { purchasePaymentStatus, salesPaymentStatus } from "../../src/features/sales/order-math.ts"
import { computeQuantities } from "../../src/features/stock/quantities.ts"

const root = resolve(import.meta.dirname, "../..")
const outDir = join(root, "blocks/workflows")
const SHORT_KEY = "dbpgei"
const AUTH = { authenticationType: "blocksAuthentication" }

// Row lists may arrive as an array, { items }, or wrapped in output/data; the
// engine's exact shape is not documented, so the scripts accept each.
const PRELUDE = `
const EPSILON = 0.005;
const rowsOf = (value) => {
  let v = value;
  for (let i = 0; i < 4 && v && !Array.isArray(v); i++) v = v.items ?? v.output ?? v.data ?? (v.json && v.json !== v ? v.json : undefined);
  return Array.isArray(v) ? v : [];
};
const nodeRows = (name) => { try { return rowsOf($node[name].json); } catch (e) { return []; } };
const gql = (value) => JSON.stringify(value).replace(/"([A-Za-z_][A-Za-z0-9_]*)":/g, "$1:");
`

let x = 0
function node(id, name, category, type, parameters) {
  x += 240
  return { id, name, category, type, version: "v1", position: { x, y: 0 }, parameters, settings: {}, pinData: null }
}
const edge = (source, target) => ({ id: `e-${source}-${target}`, source, target, sourceHandle: "source", targetHandle: "target" })
const getData = (id, name, schema, fields, filter = {}) =>
  node(id, name, "action", "dataAction", { actionType: "getData", collectionName: `${schema}s`, schemaName: schema, projectShortKey: SHORT_KEY, filter, getFields: fields, fieldMapping: {}, rawQueryMode: false, ...AUTH })
const rawMutation = (id, name, expression) =>
  node(id, name, "action", "dataAction", { actionType: "updateData", collectionName: "WorkflowRuns", schemaName: "WorkflowRun", projectShortKey: SHORT_KEY, rawQueryMode: true, rawQuery: expression, filter: {}, getFields: [], fieldMapping: {}, ...AUTH })
const code = (id, name, script) => node(id, name, "transform", "code", { mode: "all", language: "js", script })

function write(name, workflow) {
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(workflow, null, 2)}\n`)
  console.log(`wrote blocks/workflows/${name}.json (${workflow.nodes.length} nodes)`)
}

// payment-ledger -----------------------------------------------------------

{
  x = 0
  const ledgerScript = `${PRELUDE}
${computeLedger.toString()}
${salesPaymentStatus.toString()}
${purchasePaymentStatus.toString()}
const payments = nodeRows("Get Payments");
const sales = nodeRows("Get Sales Orders").map((o) => ({ ...o, party: "customer", partyId: o.customerId }));
const purchases = nodeRows("Get Purchase Orders").map((o) => ({ ...o, party: "vendor", partyId: o.vendorId }));
const balances = nodeRows("Get Balances");
const ledger = computeLedger(payments, [...sales, ...purchases]);
const parts = [];
let n = 0;
for (const order of [...sales, ...purchases]) {
  if (order.isQuote) continue;
  const amountPaid = ledger.orderPaid[order.ItemId] ?? 0;
  if (Math.abs(amountPaid - Number(order.amountPaid ?? 0)) < EPSILON) continue;
  const schema = order.party === "customer" ? "SalesOrder" : "PurchaseOrder";
  const status = order.party === "customer" ? salesPaymentStatus({ ...order, amountPaid }) : purchasePaymentStatus({ ...order, amountPaid });
  // Compare and set on revision, like the app; a clash is fixed by the next run.
  const filter = JSON.stringify({ ItemId: order.ItemId, revision: order.revision ?? null });
  parts.push(\`o\${n++}: update\${schema}(filter: \${JSON.stringify(filter)}, input: \${gql({ amountPaid, paymentStatus: status, revision: (order.revision ?? 0) + 1 })}) { acknowledged totalImpactedData }\`);
}
const rebuiltAt = new Date().toISOString();
for (const row of ledger.balances) {
  const existing = balances.find((b) => b.party === row.party && b.partyId === row.partyId && b.currencyCode === row.currencyCode);
  const values = { invoiced: row.invoiced, paid: row.paid, openBalance: row.openBalance, storeCredit: row.storeCredit, rebuiltAt };
  if (existing) parts.push(\`b\${n++}: updatePartyBalance(filter: \${JSON.stringify(JSON.stringify({ ItemId: existing.ItemId }))}, input: \${gql(values)}) { acknowledged }\`);
  else parts.push(\`b\${n++}: insertPartyBalance(input: \${gql({ party: row.party, partyId: row.partyId, currencyCode: row.currencyCode, ...values })}) { acknowledged }\`);
}
const details = \`\${payments.length} payments, \${sales.length + purchases.length} orders, \${parts.length} writes\`;
parts.push(\`log: insertWorkflowRun(input: \${gql({ workflow: "payment-ledger", status: "ok", details, ranAt: rebuiltAt })}) { acknowledged }\`);
return { query: \`mutation { \${parts.join(" ")} }\`, details };`

  const nodes = [
    node("t1", "Payment Inserted", "trigger", "dataGateway", { collectionName: "Payments", schemaName: "Payment", operation: "Inserted" }),
    getData("g1", "Get Payments", "Payment", ["ItemId", "party", "partyId", "type", "amount", "currencyCode", "isVoided", "allocations { orderType orderId amount }"]),
    getData("g2", "Get Sales Orders", "SalesOrder", ["ItemId", "customerId", "currencyCode", "total", "amountPaid", "isQuote", "isCancelled", "invoicedOn", "needsConfirmation", "confirmedBy", "revision"], { isQuote: false }),
    getData("g3", "Get Purchase Orders", "PurchaseOrder", ["ItemId", "vendorId", "currencyCode", "total", "amountPaid", "isQuote", "isCancelled", "revision"], { isQuote: false }),
    getData("g4", "Get Balances", "PartyBalance", ["ItemId", "party", "partyId", "currencyCode"]),
    code("c1", "Compute Ledger", ledgerScript),
    rawMutation("m1", "Apply Ledger", "{{$json.output.query}}"),
  ]
  write("payment-ledger", {
    name: "Payment Ledger",
    settings: {},
    nodes,
    edges: [edge("t1", "g1"), edge("g1", "g2"), edge("g2", "g3"), edge("g3", "g4"), edge("g4", "c1"), edge("c1", "m1")],
  })
  // The nightly rebuild runs the same chain on a schedule, as its own workflow
  // (one trigger per workflow keeps the import simple).
  x = 0
  write("payment-ledger-nightly", {
    name: "Payment Ledger Nightly",
    settings: {},
    nodes: [node("t1", "Every Night", "trigger", "schedule", { triggerInterval: "custom", cronExpression: "15 2 * * *" }), ...nodes.slice(1)],
    edges: [edge("t1", "g1"), edge("g1", "g2"), edge("g2", "g3"), edge("g3", "g4"), edge("g4", "c1"), edge("c1", "m1")],
  })
}

// reorder-check --------------------------------------------------------------

{
  x = 0
  const reorderScript = `${PRELUDE}
${computeQuantities.toString()}
${computeReorder.toString()}
const settings = nodeRows("Get Settings");
const quantities = computeQuantities({
  balances: nodeRows("Get Balances"),
  transfers: nodeRows("Get Transfers"),
  salesOrders: nodeRows("Get Open Sales"),
  purchaseOrders: nodeRows("Get Open Purchases"),
});
const outcome = computeReorder(settings, quantities);
const existing = nodeRows("Get Suggestions");
const computedAt = new Date().toISOString();
const key = (r) => r.productId + "|" + r.locationId;
const wanted = new Map(outcome.suggestions.map((r) => [key(r), r]));
const parts = [];
let n = 0;
for (const row of existing) if (!wanted.has(key(row))) parts.push(\`d\${n++}: deleteReorderSuggestion(filter: \${JSON.stringify(JSON.stringify({ ItemId: row.ItemId }))}) { acknowledged }\`);
for (const row of outcome.suggestions) {
  const current = existing.find((e) => key(e) === key(row));
  if (current) parts.push(\`s\${n++}: updateReorderSuggestion(filter: \${JSON.stringify(JSON.stringify({ ItemId: current.ItemId }))}, input: \${gql({ ...row, computedAt })}) { acknowledged }\`);
  else parts.push(\`s\${n++}: insertReorderSuggestion(input: \${gql({ ...row, computedAt })}) { acknowledged }\`);
}
for (const alert of outcome.alerts) {
  const filter = JSON.stringify({ ItemId: alert.settingId, isAlerting: alert.alerting ? { $ne: true } : true });
  const input = alert.alerting ? { isAlerting: true, lastAlertedAt: computedAt } : { isAlerting: false };
  parts.push(\`a\${n++}: updateReorderSetting(filter: \${JSON.stringify(filter)}, input: \${gql(input)}) { acknowledged }\`);
}
const details = \`\${outcome.suggestions.length} below reorder point, \${outcome.alerts.filter((a) => a.alerting).length} new alerts\`;
parts.push(\`log: insertWorkflowRun(input: \${gql({ workflow: "reorder-check", status: "ok", details, ranAt: computedAt })}) { acknowledged }\`);
return { query: \`mutation { \${parts.join(" ")} }\`, details };`

  const open = { isQuote: false, isCancelled: { $ne: true }, inventoryStatus: { $in: ["unconfirmed", "unapproved", "unfulfilled", "started"] } }
  const nodes = [
    node("t1", "Every Night", "trigger", "schedule", { triggerInterval: "custom", cronExpression: "30 2 * * *" }),
    getData("g1", "Get Settings", "ReorderSetting", ["ItemId", "productId", "locationId", "reorderPoint", "reorderQty", "method", "vendorId", "sourceLocationId", "isAlerting"]),
    getData("g2", "Get Balances", "InventoryBalance", ["productId", "locationId", "onHand"]),
    getData("g3", "Get Transfers", "StockTransfer", ["fromLocationId", "toLocationId", "status", "lines { productId qty }"], { status: { $in: ["open", "in_transit"] } }),
    getData("g4", "Get Open Sales", "SalesOrder", ["locationId", "lines { productId stdQty pickedQty shippedQty }"], open),
    getData("g5", "Get Open Purchases", "PurchaseOrder", ["receiveLocationId", "lines { productId stdQty receivedQty }"], open),
    getData("g6", "Get Suggestions", "ReorderSuggestion", ["ItemId", "productId", "locationId"]),
    code("c1", "Compute Reorder List", reorderScript),
    rawMutation("m1", "Apply Reorder List", "{{$json.output.query}}"),
  ]
  write("reorder-check", {
    name: "Reorder Check",
    settings: {},
    nodes,
    edges: [edge("t1", "g1"), edge("g1", "g2"), edge("g2", "g3"), edge("g3", "g4"), edge("g4", "g5"), edge("g5", "g6"), edge("g6", "c1"), edge("c1", "m1")],
  })
}
