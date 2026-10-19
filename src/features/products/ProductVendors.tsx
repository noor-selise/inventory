import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { SelectField, TextField } from "@/components/app/form"
import { ErrorBanner } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { vendors } from "@/features/partners/api"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { BlocksDataError } from "@/lib/blocks/data"
import { formatMoney } from "@/lib/format"
import { vendorItems, type Product, type VendorItem } from "./api"

// Each vendor's code, cost per purchasing unit, lead time and preference order
// for one product (spec 0005 AC-8).

export function ProductVendors({ product, canEdit }: { product: Product; canEdit: boolean }) {
  const { data, error, reload } = useResource(async () => {
    const [items, vendorRows] = await Promise.all([
      vendorItems.list({ filter: { productId: product.ItemId }, sort: { preference: 1 }, pageSize: 50 }),
      vendors.list({ filter: { isActive: { $ne: false } }, sort: { name: 1 }, pageSize: 500 }),
    ])
    return { items: items.items, vendors: vendorRows.items }
  }, [product.ItemId])
  const [adding, setAdding] = React.useState(false)
  const [draft, setDraft] = React.useState({ vendorId: "", vendorItemCode: "", unitCost: "", leadTimeDays: "" })
  const [saveError, setSaveError] = React.useState<string>()

  const vendorName = (id: string) => data?.vendors.find((vendor) => vendor.ItemId === id)?.name ?? "Unknown vendor"
  const unit = product.purchaseUom || product.standardUom

  async function add() {
    const vendor = data?.vendors.find((item) => item.ItemId === draft.vendorId)
    if (!vendor) return setSaveError("Choose a vendor.")
    if (draft.unitCost && !(Number(draft.unitCost) >= 0)) return setSaveError("Cost must be 0 or more.")
    setSaveError(undefined)
    try {
      await vendorItems.create({
        vendorId: vendor.ItemId,
        productId: product.ItemId,
        vendorItemCode: draft.vendorItemCode.trim() || null,
        unitCost: draft.unitCost === "" ? null : Number(draft.unitCost),
        currencyCode: vendor.currencyCode ?? null,
        leadTimeDays: draft.leadTimeDays === "" ? vendor.leadTimeDays ?? null : Number(draft.leadTimeDays),
        preference: (data?.items.length ?? 0) + 1,
      })
      setAdding(false)
      setDraft({ vendorId: "", vendorItemCode: "", unitCost: "", leadTimeDays: "" })
      toast.success("Vendor linked")
      await reload()
    } catch (caught) {
      setSaveError(caught instanceof BlocksDataError && caught.isDuplicate ? "This vendor is already linked." : errorMessage(caught))
    }
  }

  async function remove(item: VendorItem) {
    try {
      await vendorItems.remove(item.ItemId)
      await reload()
    } catch (caught) {
      setSaveError(errorMessage(caught))
    }
  }

  async function makePreferred(item: VendorItem) {
    // Preference order: the chosen vendor first, the rest keep their order.
    const ordered = [item, ...(data?.items ?? []).filter((other) => other.ItemId !== item.ItemId)]
    try {
      for (const [index, row] of ordered.entries()) {
        if (row.preference !== index + 1) await vendorItems.update(row.ItemId, { preference: index + 1 })
      }
      await reload()
    } catch (caught) {
      setSaveError(errorMessage(caught))
    }
  }

  const linked = new Set(data?.items.map((item) => item.vendorId))
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">Vendors</h3>
      {error ? <ErrorBanner message={error} /> : null}
      {saveError ? <ErrorBanner message={saveError} /> : null}
      {data?.items.length ? (
        <ul className="flex flex-col divide-y rounded-lg bg-muted text-sm">
          {data.items.map((item, index) => (
            <li key={item.ItemId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="font-medium">{vendorName(item.vendorId)}</span>
                {index === 0 ? <span className="ml-2 text-xs text-primary">Preferred</span> : null}
                <span className="block font-mono text-xs text-muted-foreground">{item.vendorItemCode}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="num text-muted-foreground">
                  {item.unitCost != null ? `${formatMoney(item.unitCost, item.currencyCode ?? "USD")} per ${unit}` : "No cost"}
                  {item.leadTimeDays != null ? ` · ${item.leadTimeDays} days` : ""}
                </span>
                {canEdit && index > 0 ? (
                  <Button type="button" size="xs" variant="ghost" onClick={() => void makePreferred(item)}>
                    Make preferred
                  </Button>
                ) : null}
                {canEdit ? (
                  <Button type="button" size="icon-xs" variant="ghost" aria-label={`Unlink ${vendorName(item.vendorId)}`} onClick={() => void remove(item)}>
                    <Trash2 />
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No vendors linked yet.</p>
      )}
      {canEdit && adding ? (
        <div className="grid grid-cols-1 gap-3 rounded-lg bg-muted p-3 sm:grid-cols-2">
          <SelectField
            id="vendor-item-vendor"
            label="Vendor"
            required
            options={(data?.vendors ?? []).filter((vendor) => !linked.has(vendor.ItemId)).map((vendor) => ({ value: vendor.ItemId, label: vendor.name }))}
            value={draft.vendorId}
            onChange={(vendorId) => setDraft({ ...draft, vendorId })}
          />
          <TextField id="vendor-item-code" label="Vendor's code" mono value={draft.vendorItemCode} onChange={(vendorItemCode) => setDraft({ ...draft, vendorItemCode })} />
          <TextField id="vendor-item-cost" label={`Cost per ${unit}`} type="number" inputMode="decimal" step="any" value={draft.unitCost} onChange={(unitCost) => setDraft({ ...draft, unitCost })} helper="In the vendor's currency." />
          <TextField id="vendor-item-lead" label="Lead time (days)" type="number" inputMode="numeric" value={draft.leadTimeDays} onChange={(leadTimeDays) => setDraft({ ...draft, leadTimeDays })} helper="Empty uses the vendor's default." />
          <div className="flex gap-2 sm:col-span-2">
            <Button type="button" size="sm" onClick={() => void add()}>
              Link vendor
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : canEdit ? (
        <div>
          <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus aria-hidden /> Link a vendor
          </Button>
        </div>
      ) : null}
    </div>
  )
}
