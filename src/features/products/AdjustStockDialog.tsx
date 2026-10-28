import * as React from "react"
import { toast } from "sonner"

import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/app/form"
import { DateField } from "@/components/app/date-picker"
import { ErrorBanner } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useResource } from "@/hooks/use-resource"
import { formatNumber } from "@/lib/format"
import { postingMessage } from "@/features/stock/AdjustmentsPage"
import type { StockLookups } from "@/features/stock/lookups"
import { isOpeningStock } from "@/features/stock/reasons"
import { useLocationScope } from "@/features/team/location-scope"
import type { Product } from "./api"
import { openingLocations } from "./OpeningStockRows"
import { adjustTo, currentOnHand, type PlaceInput } from "./productStock"

// Change one product's stock to a new total from its Stock tab (spec 0029 G3).
// People know the total after a count, so the dialog asks for it and works out
// the difference, which posts as an ordinary adjustment.

const DEFAULT_REASON = "count correction"

export function AdjustStockDialog({
  product,
  lookups,
  place,
  canOverride,
  onClose,
  onDone,
}: {
  product: Product
  lookups: StockLookups
  /** Where to start: a row of the Stock tab, or the default location. */
  place?: PlaceInput
  canOverride: boolean
  onClose: () => void
  onDone: () => void
}) {
  const scope = useLocationScope()
  const locations = openingLocations(lookups, scope)
  const reasons = lookups.reasons.filter((reason) => reason.isActive !== false && !isOpeningStock(reason.ItemId, lookups.reasons))
  const [form, setForm] = React.useState<PlaceInput>(() => place ?? { locationId: locations[0]?.ItemId ?? "", binCode: "", lotNumber: "", serial: "" })
  const [newTotal, setNewTotal] = React.useState("")
  const [reasonId, setReasonId] = React.useState(() => reasons.find((reason) => reason.name.trim().toLowerCase() === DEFAULT_REASON)?.ItemId ?? "")
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [remarks, setRemarks] = React.useState("")
  const [allowNegative, setAllowNegative] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const set = (key: keyof PlaceInput) => (value: string) => setForm((current) => ({ ...current, [key]: value }))

  const ready = Boolean(form.locationId) && (!product.trackLots || form.lotNumber.trim()) && (!product.trackSerials || form.serial.trim())
  const onHand = useResource(
    () => (ready ? currentOnHand(product, form, lookups) : Promise.resolve(null)),
    [ready, form.locationId, form.binCode, form.lotNumber, form.serial]
  )
  const total = newTotal.trim() === "" ? null : Number(newTotal)
  const delta = total != null && onHand.data != null ? total - onHand.data : null
  const wouldGoNegative = total != null && total < 0
  const productLots = lookups.lots.filter((lot) => lot.productId === product.ItemId)

  function problem() {
    if (!form.locationId) return "Choose a location."
    if (product.trackLots && !form.lotNumber.trim()) return "Enter the lot number."
    if (product.trackSerials && !form.serial.trim()) return "Enter the serial number."
    if (total == null || Number.isNaN(total)) return "Enter the new total."
    if (product.trackSerials && total !== 0 && total !== 1) return "A serial number is either here (1) or not (0)."
    if (wouldGoNegative && !(canOverride && allowNegative)) return "The new total can't be below 0."
    if (!reasonId) return "Choose a reason."
    if (delta === 0) return "Nothing to change: stock is already at that total."
    return undefined
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const message = problem()
    if (message) {
      setError(message)
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const adjustedAt = date === today ? new Date().toISOString() : new Date(`${date}T12:00:00Z`).toISOString()
      const { doc } = await adjustTo(
        { product, ...form, newTotal: Number(total), reasonId, adjustedAt, remarks },
        lookups,
        canOverride && allowNegative
      )
      toast.success(`Stock adjusted (${doc.number})`)
      onDone()
    } catch (caught) {
      setError(postingMessage(caught, lookups))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {product.name}. Enter how many there are now; the difference posts as an adjustment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4">
          {error ? <ErrorBanner message={error} /> : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField
              id="adjust-location"
              label="Location"
              required
              options={locations.map((location) => ({ value: location.ItemId, label: location.name }))}
              value={form.locationId}
              onChange={(locationId) => setForm((current) => ({ ...current, locationId, binCode: "" }))}
            />
            <TextField id="adjust-bin" label="Bin" mono placeholder="Optional" value={form.binCode} onChange={set("binCode")} />
            {product.trackLots ? (
              <>
                <TextField id="adjust-lot" label="Lot number" required mono list="adjust-lots" value={form.lotNumber} onChange={set("lotNumber")} />
                <datalist id="adjust-lots">
                  {productLots.map((lot) => (
                    <option key={lot.ItemId} value={lot.lotNumber} />
                  ))}
                </datalist>
              </>
            ) : null}
            {product.trackSerials ? <TextField id="adjust-serial" label="Serial number" required mono value={form.serial} onChange={set("serial")} /> : null}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">On hand now</span>
              <p className="flex h-10 items-center text-sm num">
                {!ready ? "—" : onHand.loading ? "Checking…" : `${formatNumber(onHand.data ?? 0)} ${product.standardUom}`}
              </p>
            </div>
            <TextField
              id="adjust-total"
              label="New total"
              required
              suffix={product.standardUom}
              type="number"
              inputMode="decimal"
              step="any"
              value={newTotal}
              onChange={setNewTotal}
              helper={delta == null || delta === 0 ? undefined : `Change: ${delta > 0 ? "+" : "−"}${formatNumber(Math.abs(delta))} ${product.standardUom}`}
            />
            <SelectField
              id="adjust-reason"
              label="Reason"
              required
              options={reasons.map((reason) => ({ value: reason.ItemId, label: reason.name }))}
              value={reasonId}
              onChange={setReasonId}
            />
            <DateField id="adjust-date" label="Date" value={date} onChange={setDate} />
          </div>
          <TextAreaField id="adjust-remarks" label="Remarks" value={remarks} onChange={setRemarks} />
          {canOverride && wouldGoNegative ? (
            <CheckboxField
              id="adjust-negative"
              label="Allow stock to go below zero"
              helper="Only for correcting mistakes."
              checked={allowNegative}
              onChange={setAllowNegative}
            />
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-w-28">
              {saving ? "Posting…" : "Save and post"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
