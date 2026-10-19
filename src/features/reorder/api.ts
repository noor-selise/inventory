import { blocksClient } from "@/lib/blocks/client"
import { collection, dateFilter, type Entity } from "@/lib/blocks/data"
import { products, vendorItems, type VendorItem } from "@/features/products/api"
import { locations } from "@/features/locations/api"
import { roleSlugs } from "@/features/team/roles"
import { OPEN_PO_FILTER, purchaseOrders } from "@/features/purchasing/api"
import { OPEN_ORDER_FILTER, salesOrders } from "@/features/sales/api"
import { posting, stockTransfers } from "@/features/stock/api"
import { computeQuantities } from "@/features/stock/quantities"
import { computeReorder, type ReorderOutcome } from "./check"
import { SALES_WINDOW_DAYS, suggestedPoint, unitsSold } from "./suggest"

// Reorder settings and the reorder list (spec 0014). The list is rebuilt every
// night by the `reorder-check` workflow; "Check now" runs the same function in
// the browser and writes the same records.

export const REORDER_METHODS = [
  { value: "purchase", label: "Purchase order" },
  { value: "transfer", label: "Stock transfer" },
  { value: "manufacture", label: "Manufacture order" },
] as const

export type ReorderSetting = Entity & {
  productId: string
  locationId: string
  reorderPoint: number
  reorderQty?: number | null
  method: (typeof REORDER_METHODS)[number]["value"]
  vendorId?: string | null
  sourceLocationId?: string | null
  sublocationId?: string | null
  /** Extra units kept on top of lead time demand (spec 0014 AC-5). */
  safetyStock?: number | null
  isAlerting?: boolean | null
  lastAlertedAt?: string | null
}

export type ReorderSuggestion = Entity & ReorderOutcome["suggestions"][number] & { computedAt: string }

export const reorderSettings = collection<ReorderSetting>("ReorderSetting", [
  "productId",
  "locationId",
  "reorderPoint",
  "reorderQty",
  "method",
  "vendorId",
  "sourceLocationId",
  "sublocationId",
  "safetyStock",
  "isAlerting",
  "lastAlertedAt",
])

export const reorderSuggestions = collection<ReorderSuggestion>("ReorderSuggestion", [
  "productId",
  "locationId",
  "onHand",
  "reserved",
  "onOrder",
  "anticipated",
  "reorderPoint",
  "suggestedQty",
  "method",
  "vendorId",
  "sourceLocationId",
  "computedAt",
])

/** Runs the reorder check now and replaces the list (the same work as the nightly workflow). */
export async function runReorderCheck(): Promise<ReorderOutcome> {
  const [settings, balances, transfers, sales, purchases] = await Promise.all([
    reorderSettings.list({ pageSize: 5000 }),
    posting.balances({}, { pageSize: 5000 }),
    stockTransfers.list({ filter: { status: { $in: ["open", "in_transit"] } }, pageSize: 1000 }),
    salesOrders.list({ filter: OPEN_ORDER_FILTER, pageSize: 2000 }),
    purchaseOrders.list({ filter: OPEN_PO_FILTER, pageSize: 2000 }),
  ])
  const quantities = computeQuantities({ balances: balances.items, transfers: transfers.items, salesOrders: sales.items, purchaseOrders: purchases.items })
  const outcome = computeReorder(settings.items, quantities)
  const computedAt = new Date().toISOString()

  const existing = (await reorderSuggestions.list({ pageSize: 5000 })).items
  const keyOf = (row: { productId: string; locationId: string }) => `${row.productId}|${row.locationId}`
  const wanted = new Map(outcome.suggestions.map((row) => [keyOf(row), row]))
  for (const row of existing) if (!wanted.has(keyOf(row))) await reorderSuggestions.remove(row.ItemId)
  for (const row of outcome.suggestions) {
    const current = existing.find((item) => keyOf(item) === keyOf(row))
    if (current) await reorderSuggestions.update(current.ItemId, { ...row, computedAt })
    else await reorderSuggestions.create({ ...row, computedAt })
  }
  for (const alert of outcome.alerts) {
    await reorderSettings.updateWhere(
      { ItemId: alert.settingId, isAlerting: alert.alerting ? { $ne: true } : true },
      alert.alerting ? { isAlerting: true, lastAlertedAt: computedAt } : { isAlerting: false }
    )
  }
  return outcome
}

// Suggested reorder points (spec 0014 AC-5).

/** The vendor item a reorder point buys from: its own vendor, else the most preferred one. */
function preferredItem(setting: ReorderSetting, items: VendorItem[]) {
  const mine = items.filter((item) => item.productId === setting.productId)
  return mine.find((item) => item.vendorId === setting.vendorId) ?? [...mine].sort((a, b) => Number(a.preference ?? 99) - Number(b.preference ?? 99))[0]
}

export async function suggestedPoints(settings: ReorderSetting[]) {
  const since = new Date(Date.now() - SALES_WINDOW_DAYS * 86_400_000).toISOString()
  const [moves, items] = await Promise.all([
    posting.movements({ sourceType: { $in: ["sales_pick", "sales_reversal"] }, status: "posted", effectiveAt: { $gte: dateFilter(since) } }, { pageSize: 5000 }),
    vendorItems.list({ pageSize: 5000 }),
  ])
  const sold = unitsSold(moves.items)
  return new Map(
    settings.map((setting) => {
      const item = preferredItem(setting, items.items)
      return [setting.ItemId, { ...suggestedPoint(sold.get(`${setting.productId}|${setting.locationId}`) ?? 0, item?.leadTimeDays, setting.safetyStock), sold: sold.get(`${setting.productId}|${setting.locationId}`) ?? 0 }]
    })
  )
}

// Low stock alerts (spec 0014 AC-4, spec 0027). In app: the Low stock card on
// the home page lists every breach until it is restocked (LowStockAlerts). By
// email: Blocks mail to active users with the purchasing role. Each breach
// alerts once; computeReorder decides which are new. A notifier push is not
// used: notify needs a notification configuration, a connection id and a
// response key and value, and Blocks publishes no channel values to create one.

export const ALERT_ROLES = ["purchasing"]
export const ALERT_MAIL_PURPOSE = "low-stock-alert"

export type AlertResult = { count: number; inApp: string; email: string }

export async function sendLowStockAlerts(outcome: ReorderOutcome): Promise<AlertResult> {
  const fresh = outcome.alerts.filter((alert) => alert.alerting)
  if (!fresh.length) return { count: 0, inApp: "none", email: "none" }
  const [productRows, locationRows] = await Promise.all([
    products.list({ filter: { ItemId: { $in: [...new Set(fresh.map((alert) => alert.productId))] } }, pageSize: 500 }),
    locations.list({ pageSize: 500 }),
  ])
  const lines = fresh.map((alert) => {
    const suggestion = outcome.suggestions.find((row) => row.productId === alert.productId && row.locationId === alert.locationId)
    const product = productRows.items.find((row) => row.ItemId === alert.productId)?.name ?? "A product"
    const location = locationRows.items.find((row) => row.ItemId === alert.locationId)?.name ?? ""
    return `${product} at ${location}: ${suggestion?.anticipated ?? 0} left, reorder point ${suggestion?.reorderPoint ?? 0}`
  })
  const result: AlertResult = { count: fresh.length, inApp: "shown on the home page", email: "sent" }
  try {
    const users = await blocksClient.iam.users.list({ pageNo: 1, pageSize: 200 })
    const to = (users.data ?? [])
      .filter((user) => user.active !== false && user.email && roleSlugs(user.roles).some((slug) => ALERT_ROLES.includes(slug)))
      .map((user) => String(user.email))
    if (!to.length) result.email = "no purchasing users with an email"
    else {
      await blocksClient.mail.send({
        to,
        purpose: ALERT_MAIL_PURPOSE,
        language: "en",
        subjectDataContext: { count: String(fresh.length) },
        bodyDataContext: { count: String(fresh.length), lines: lines.join("\n") },
      })
      result.email = `sent to ${to.length}`
    }
  } catch (caught) {
    result.email = `failed: ${caught instanceof Error ? caught.message : String(caught)}`
  }
  return result
}

// The daily run (spec 0027): with no working workflow sign in yet, the first
// signed in person each day runs the reorder check in their browser. A unique
// runKey per day makes it run once; a failed run frees the key for a retry.

export type WorkflowRun = Entity & { workflow: string; trigger: string; status: string; details?: string | null; ranAt: string; runKey?: string | null }

export const workflowRuns = collection<WorkflowRun>("WorkflowRun", ["workflow", "trigger", "status", "details", "ranAt", "runKey"])

export async function runDailyReorderCheck(today = new Date().toISOString().slice(0, 10), send: (outcome: ReorderOutcome) => Promise<AlertResult> = sendLowStockAlerts) {
  const runKey = `reorder-check:${today}`
  let runId: string
  try {
    runId = await workflowRuns.create({ workflow: "reorder-check", trigger: "app daily", status: "running", ranAt: new Date().toISOString(), runKey })
  } catch {
    return null // Someone already ran it today.
  }
  try {
    const outcome = await runReorderCheck()
    const alerts = await send(outcome)
    await workflowRuns.update(runId, { status: "success", details: JSON.stringify({ suggestions: outcome.suggestions.length, alerts }) })
    return { outcome, alerts }
  } catch (caught) {
    await workflowRuns.update(runId, { status: "error", runKey: `${runKey}:failed:${Date.now()}`, details: caught instanceof Error ? caught.message : String(caught) }).catch(() => undefined)
    throw caught
  }
}
