import * as React from "react"
import { toast } from "sonner"

import { Link } from "@/app/router/navigation"
import { DateField } from "@/components/app/date-picker"
import { SelectField, TextField } from "@/components/app/form"
import { ErrorBanner } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { Location } from "@/features/locations/api"
import type { Product } from "@/features/products/api"
import { errorMessage } from "@/hooks/use-resource"
import { firstDayOf, periodOfDate } from "./calc"
import { createAsset, updateAsset, type DepreciationState } from "./actions"
import type { DepreciationClass, FixedAsset } from "./api"

type Form = { productId: string; classId: string; locationId: string; cost: string; inServiceDay: string; serialNumber: string; openingWdv: string }

function toForm(asset: FixedAsset | undefined, state: DepreciationState, locations: Location[]): Form {
  return {
    productId: asset?.productId ?? "",
    classId: asset?.classId ?? "",
    locationId: asset?.locationId ?? locations.find((item) => item.isDefault)?.ItemId ?? "",
    cost: asset ? String(asset.cost) : "",
    inServiceDay: asset?.inServiceDate.slice(0, 10) ?? state.today,
    serialNumber: asset?.serialNumber ?? "",
    openingWdv: asset?.openingWdv === null || asset?.openingWdv === undefined ? "" : String(asset.openingWdv),
  }
}

// Add an asset by hand, or edit one (spec 0028 AC-7). Cost and dates are fixed
// once the asset has entries; the action checks that again before saving.
export function AssetDialog({
  open,
  onOpenChange,
  asset,
  locked,
  state,
  products,
  classes,
  locations,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset?: FixedAsset
  /** The asset has entries: cost and dates cannot change. */
  locked: boolean
  state: DepreciationState
  products: Product[]
  classes: DepreciationClass[]
  locations: Location[]
  onSaved: () => void
}) {
  const [form, setForm] = React.useState<Form>(() => toForm(asset, state, locations))
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string>()

  React.useEffect(() => {
    if (!open) return
    setForm(toForm(asset, state, locations))
    setError(undefined)
  }, [open, asset, state, locations])

  const set = <K extends keyof Form>(key: K) => (value: Form[K]) => setForm((current) => ({ ...current, [key]: value }))
  const product = products.find((item) => item.ItemId === form.productId)
  const cls = classes.find((item) => item.ItemId === form.classId)
  const beforeStart = Boolean(form.inServiceDay) && periodOfDate(form.inServiceDay) < state.setup.startPeriod
  const earliest = state.latestClosed ? firstDayOf(state.nextOpen) : undefined

  function chooseProduct(productId: string) {
    const next = products.find((item) => item.ItemId === productId)
    setForm((current) => ({ ...current, productId, classId: current.classId || next?.depreciationClassId || "" }))
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    const draft = {
      productId: form.productId,
      classId: form.classId,
      locationId: form.locationId,
      cost: form.cost.trim() === "" ? Number.NaN : Number(form.cost),
      inServiceDay: form.inServiceDay,
      serialNumber: form.serialNumber,
      openingWdv: beforeStart && form.openingWdv.trim() !== "" ? Number(form.openingWdv) : beforeStart ? Number.NaN : null,
    }
    try {
      if (asset) await updateAsset(asset, draft, product, cls)
      else await createAsset(draft, product, cls)
      toast.success(asset ? "Asset saved" : "Asset added")
      onOpenChange(false)
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const classOptions = classes.filter((item) => item.isActive !== false || item.ItemId === asset?.classId).map((item) => ({ value: item.ItemId, label: `${item.name} (${item.ratePercent}%)` }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{asset ? `Edit ${asset.assetNumber}` : "Add asset"}</DialogTitle>
          <DialogDescription>
            {asset ? "Class changes take effect from the asset's next income year." : "For an asset you already own. Assets you buy are added by receiving their purchase order."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {error ? (
            <div className="md:col-span-2">
              <ErrorBanner message={error} />
            </div>
          ) : null}
          <SelectField
            id="asset-product"
            label="Product"
            required
            options={products.map((item) => ({ value: item.ItemId, label: `${item.name} (${item.sku})` }))}
            value={form.productId}
            onChange={chooseProduct}
            disabled={Boolean(asset) || products.length === 0}
            placeholder={products.length ? "Choose…" : "No fixed asset products yet"}
            className="md:col-span-2"
          />
          {!asset && products.length === 0 ? (
            <p className="text-xs text-muted-foreground md:col-span-2">
              Add a product with type <strong className="font-semibold text-foreground">Fixed asset</strong> on the{" "}
              <Link to="/products" className="font-semibold text-primary underline-offset-2 hover:underline">
                Products
              </Link>{" "}
              page, then reopen this dialog.
            </p>
          ) : null}
          <SelectField id="asset-class" label="Depreciation class" required options={classOptions} value={form.classId} onChange={set("classId")} />
          <SelectField id="asset-location" label="Location" required options={locations.map((item) => ({ value: item.ItemId, label: item.name }))} value={form.locationId} onChange={set("locationId")} />
          <TextField
            id="asset-cost"
            label={`Cost (${state.company.homeCurrency})`}
            required
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            value={form.cost}
            onChange={set("cost")}
            disabled={locked}
            helper={locked ? "Fixed: this asset has depreciation entries." : undefined}
          />
          <DateField
            id="asset-in-service"
            label="In service date"
            required
            value={form.inServiceDay}
            onChange={set("inServiceDay")}
            max={state.today}
            min={earliest}
            disabled={locked}
            helper={earliest ? `From ${earliest}: earlier months are closed.` : "The day the asset started being used."}
          />
          {beforeStart ? (
            <TextField
              id="asset-opening"
              label={`Value left at the start (${state.setup.startPeriod})`}
              required
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={form.openingWdv}
              onChange={set("openingWdv")}
              disabled={locked}
              helper="In service before depreciation starts here: enter its written down value as at the start period."
            />
          ) : null}
          <TextField id="asset-serial" label="Serial number" mono value={form.serialNumber} onChange={set("serialNumber")} />
          <DialogFooter className="gap-2 md:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-w-24">
              {saving ? "Saving…" : asset ? "Save" : "Add asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
