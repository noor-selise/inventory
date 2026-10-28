import { Plus, Trash2 } from "lucide-react"

import { SelectField, TextAreaField, TextField } from "@/components/app/form"
import { DateField } from "@/components/app/date-picker"
import { Button } from "@/components/ui/button"
import type { StockLookups } from "@/features/stock/lookups"
import { seesLocation, useLocationScope } from "@/features/team/location-scope"
import { cn } from "@/lib/utils"
import { unitOptions, type Product } from "./api"
import { emptyOpeningRow, serialList, type OpeningRow } from "./productStock"

// Opening stock for one product, one row per location, bin and lot
// (spec 0029). Takes the product's settings from the form being filled, so it
// works before the product exists.

export type OpeningProduct = Pick<
  Product,
  "standardUom" | "purchaseUom" | "purchaseUomRatio" | "salesUom" | "salesUomRatio" | "trackLots" | "trackSerials" | "trackExpiry"
>

/** Allowed, active locations, default first. */
export function openingLocations(lookups: Pick<StockLookups, "locations">, scope: ReturnType<typeof useLocationScope>) {
  return lookups.locations
    .filter((location) => location.isActive !== false && seesLocation(scope, location.ItemId))
    .sort((a, b) => Number(b.isDefault === true) - Number(a.isDefault === true))
}

const fieldGrid = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12"

export function OpeningStockRows({
  product,
  rows,
  onChange,
  lookups,
  errors,
  disabled,
}: {
  product: OpeningProduct
  rows: OpeningRow[]
  onChange: (rows: OpeningRow[]) => void
  lookups: Pick<StockLookups, "locations" | "bins">
  errors?: Record<string, string | undefined>
  disabled?: boolean
}) {
  const scope = useLocationScope()
  const locations = openingLocations(lookups, scope)
  const locationOptions = locations.map((location) => ({ value: location.ItemId, label: location.name }))
  const oneLocation = locationOptions.length === 1
  const units = unitOptions(product)
  const update = (key: string, patch: Partial<OpeningRow>) => onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const binsAt = (locationId: string) => lookups.bins.filter((bin) => bin.locationId === locationId && bin.isActive !== false)
  const locationLabel = (locationId: string) => locations.find((location) => location.ItemId === locationId)?.name ?? "Location"

  if (!locationOptions.length) {
    return <p className="text-sm text-muted-foreground">You can't use any location yet. Ask an admin to give you a location first.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, index) => {
        const id = (name: string) => `opening-${index}-${name}`
        const error = errors?.[row.key]
        const costUnit = product.trackSerials ? product.standardUom : row.uom || product.standardUom
        return (
          <div
            key={row.key}
            className={cn(
              "rounded-lg border border-border/60 bg-muted/40 p-4",
              error && "border-destructive/40 ring-1 ring-destructive-text/30",
            )}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-sm font-medium leading-snug">
                {oneLocation ? locationLabel(row.locationId) : `Location ${index + 1}`}
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-9 shrink-0"
                onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
                disabled={disabled}
              >
                <Trash2 aria-hidden /> Remove
              </Button>
            </div>

            <div className={fieldGrid}>
              {oneLocation ? null : (
                <SelectField
                  id={id("location")}
                  label="Location"
                  required
                  options={locationOptions}
                  value={row.locationId}
                  onChange={(locationId) => update(row.key, { locationId, binCode: "" })}
                  disabled={disabled}
                  className="sm:col-span-2 lg:col-span-12"
                />
              )}
              <TextField
                id={id("bin")}
                label="Bin"
                mono
                list={id("bins")}
                placeholder="Optional"
                value={row.binCode}
                onChange={(binCode) => update(row.key, { binCode })}
                disabled={disabled}
                className="lg:col-span-4"
              />
              <datalist id={id("bins")}>
                {binsAt(row.locationId).map((bin) => (
                  <option key={bin.ItemId} value={bin.code} />
                ))}
              </datalist>
              {product.trackSerials ? null : (
                <>
                  <TextField
                    id={id("qty")}
                    label="Quantity"
                    required
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={row.qty}
                    onChange={(qty) => update(row.key, { qty })}
                    disabled={disabled}
                    className="lg:col-span-3"
                  />
                  {units.length > 1 ? (
                    <SelectField
                      id={id("uom")}
                      label="Unit"
                      options={units}
                      value={row.uom || product.standardUom}
                      onChange={(uom) => update(row.key, { uom })}
                      disabled={disabled}
                      className="lg:col-span-2"
                    />
                  ) : null}
                </>
              )}
              <TextField
                id={id("cost")}
                label="Unit cost"
                required
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                suffix={`/${costUnit}`}
                helper={`Per ${costUnit}`}
                value={row.unitCost}
                onChange={(unitCost) => update(row.key, { unitCost })}
                disabled={disabled}
                className={cn(units.length > 1 && !product.trackSerials ? "lg:col-span-3" : "lg:col-span-5")}
              />
              {product.trackLots ? (
                <>
                  <TextField
                    id={id("lot")}
                    label="Lot number"
                    required
                    mono
                    value={row.lotNumber}
                    onChange={(lotNumber) => update(row.key, { lotNumber })}
                    disabled={disabled}
                    className="sm:col-span-2 lg:col-span-6"
                  />
                  {product.trackExpiry ? (
                    <DateField
                      id={id("expiry")}
                      label="Expires on"
                      value={row.lotExpiresOn}
                      onChange={(lotExpiresOn) => update(row.key, { lotExpiresOn })}
                      disabled={disabled}
                      clearable
                      className="sm:col-span-2 lg:col-span-6"
                    />
                  ) : null}
                </>
              ) : null}
              {product.trackSerials ? (
                <TextAreaField
                  id={id("serials")}
                  label="Serial numbers"
                  value={row.serials}
                  onChange={(serials) => update(row.key, { serials })}
                  helper={`One per line, or scan them in. ${serialList(row).length} entered.`}
                  className="sm:col-span-2 lg:col-span-12"
                />
              ) : null}
            </div>
            {error ? <p className="mt-2 text-xs text-destructive-text">{error}</p> : null}
          </div>
        )
      })}
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-10 w-full sm:w-auto"
          onClick={() => onChange([...rows, emptyOpeningRow(locations[0]?.ItemId ?? "", product.standardUom)])}
          disabled={disabled}
        >
          <Plus aria-hidden /> {rows.length ? "Add another location" : "Add stock"}
        </Button>
      </div>
    </div>
  )
}
