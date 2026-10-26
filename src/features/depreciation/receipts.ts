import { BlocksDataError } from "@/lib/blocks/data"
import type { Product } from "@/features/products/api"
import type { PurchaseOrder } from "@/features/purchasing/api"
import { withNextNumber } from "@/features/settings/numbering"
import { dayInZone, firstDayOf, periodOfDate, storedDay } from "./calc"
import { loadState } from "./actions"
import { fixedAssets } from "./api"

// Assets from purchase receipts (spec 0028 AC-6). Each unit of a fixed asset
// line in a posted receive step gets one asset, keyed by a unitKey that is
// unique, so this is safe to run again at any time: after receiving, after a
// stuck step is finished, and whenever the order is opened.

export const unitKey = (stepId: string, row: number, unit: number) => `receipt:${stepId}:${row}:${unit}`

/** Inserts the assets still missing for this order's receipts; returns how many were added. */
export async function syncReceiptAssets(order: PurchaseOrder, productOf: (id?: string | null) => Product | undefined) {
  if (order.isCancelled) return 0
  const wanted: { key: string; stepAt: string; productId: string; cost: number; serial: string | null; classId: string }[] = []
  for (const step of order.stockSteps ?? []) {
    if (step.kind !== "receive" || step.status !== "posted") continue
    step.lines.forEach((line, row) => {
      const orderLine = order.lines.find((item) => item.lineId === line.lineId)
      const product = productOf(orderLine?.productId)
      if (!orderLine || product?.itemType !== "fixed_asset") return
      const units = Math.round(Number(line.qty))
      for (let unit = 0; unit < units; unit++) {
        wanted.push({
          key: unitKey(step.stepId, row, unit),
          stepAt: step.at,
          productId: product.ItemId,
          cost: Number(line.unitCost ?? 0),
          serial: units === 1 ? line.serial ?? null : null,
          classId: product.depreciationClassId ?? "",
        })
      }
    })
  }
  if (!wanted.length) return 0
  const state = await loadState()
  if (!state) throw new Error("Set the company's country for depreciation before receiving fixed assets.")
  const { items } = await fixedAssets.list({ filter: { purchaseOrderId: order.ItemId }, pageSize: 2000 })
  const have = new Set(items.map((asset) => asset.unitKey))
  let added = 0
  for (const unit of wanted) {
    if (have.has(unit.key)) continue
    // The receipt day in the company time zone; a month already closed (only near midnight) moves to the next open month.
    let day = dayInZone(unit.stepAt, state.timeZone)
    if (periodOfDate(day) < state.nextOpen) day = firstDayOf(state.nextOpen)
    await withNextNumber("fixed_asset", async (assetNumber) => {
      try {
        await fixedAssets.create({
          assetNumber,
          unitKey: unit.key,
          productId: unit.productId,
          classId: unit.classId,
          locationId: order.receiveLocationId,
          purchaseOrderId: order.ItemId,
          source: "receipt",
          serialNumber: unit.serial,
          inServiceDate: storedDay(day),
          cost: unit.cost,
          status: "active",
        })
      } catch (error) {
        // Another tab already added this unit: fine. A number clash is retried by withNextNumber.
        if (error instanceof BlocksDataError && error.isDuplicate) {
          const { items: same } = await fixedAssets.list({ filter: { unitKey: unit.key }, pageSize: 1 })
          if (same.length) return
        }
        throw error
      }
    })
    have.add(unit.key)
    added++
  }
  return added
}

/** Assets from this order, for the cancel check. */
export const assetsForOrder = (orderId: string) => fixedAssets.list({ filter: { purchaseOrderId: orderId }, pageSize: 2000 }).then((result) => result.items)
