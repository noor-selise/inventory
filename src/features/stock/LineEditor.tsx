import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/app/date-picker"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { unitOptions, type Product } from "@/features/products/api"
import { cn } from "@/lib/utils"
import type { StockLookups } from "./lookups"

// Editable lines for stock documents. Text first: bins and lots are typed as
// codes, so new ones can be created on save (spec 0006 AC-3, spec 0009 AC-3).

export type LineDraft = {
  key: string
  productId: string
  uom: string
  qty: string
  /** "in" adds stock, "out" takes it away (adjustments only). */
  direction: "in" | "out"
  binCode: string
  toBinCode: string
  lotNumber: string
  lotExpiresOn: string
  serial: string
}

export function emptyLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    productId: "",
    uom: "",
    qty: "",
    direction: "in",
    binCode: "",
    toBinCode: "",
    lotNumber: "",
    lotExpiresOn: "",
    serial: "",
  }
}

/** Problems that stop a line from saving, or undefined when it is fine. */
export function lineProblem(line: LineDraft, product: Product | undefined, options: { lotsExist: (number: string) => boolean }): string | undefined {
  if (!product) return "Choose a product."
  if (product.itemType !== "stocked") return `${product.name} is not a stocked product.`
  const qty = Number(line.qty)
  if (!(qty > 0)) return "Enter a quantity above 0."
  if (product.trackSerials) {
    if (!line.serial.trim()) return `${product.name} needs a serial number.`
    if (qty !== 1) return "A serial number line moves exactly 1."
  }
  if (product.trackLots && !line.lotNumber.trim()) return `${product.name} needs a lot number.`
  if (product.trackLots && line.direction === "out" && !options.lotsExist(line.lotNumber.trim())) {
    return `Lot ${line.lotNumber.trim()} does not exist for ${product.name}.`
  }
  return undefined
}

const fieldClass = "h-10"

export function LineEditor({
  lines,
  onChange,
  lookups,
  locationId,
  toLocationId,
  mode,
  disabled,
  errors,
}: {
  lines: LineDraft[]
  onChange: (lines: LineDraft[]) => void
  lookups: StockLookups
  locationId: string
  toLocationId?: string
  mode: "adjustment" | "transfer"
  disabled?: boolean
  errors?: Record<string, string | undefined>
}) {
  const stocked = lookups.products.filter((product) => product.itemType === "stocked" && product.isActive !== false)
  const binsAt = (id?: string) => lookups.bins.filter((bin) => bin.locationId === id && bin.isActive !== false)
  const update = (key: string, patch: Partial<LineDraft>) => onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  return (
    <div className="flex flex-col gap-3">
      <datalist id="bins-from">
        {binsAt(locationId).map((bin) => (
          <option key={bin.ItemId} value={bin.code} />
        ))}
      </datalist>
      <datalist id="bins-to">
        {binsAt(toLocationId).map((bin) => (
          <option key={bin.ItemId} value={bin.code} />
        ))}
      </datalist>
      {lines.map((line, index) => {
        const product = lookups.product(line.productId)
        const productLots = lookups.lots.filter((lot) => lot.productId === line.productId)
        const error = errors?.[line.key]
        const id = (name: string) => `line-${index}-${name}`
        return (
          <div key={line.key} className={cn("rounded-lg bg-muted p-3", error && "ring-1 ring-destructive-text")}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
              <div className="col-span-2 flex flex-col gap-1.5 md:col-span-4">
                <Label htmlFor={id("product")}>Product</Label>
                <Select
                  value={line.productId || undefined}
                  onValueChange={(productId) => {
                    const next = lookups.product(productId)
                    update(line.key, { productId, uom: next?.standardUom ?? "", lotNumber: "", serial: "", qty: next?.trackSerials ? "1" : line.qty })
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger id={id("product")} className={cn(fieldClass, "w-full")}>
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {stocked.map((item) => (
                      <SelectItem key={item.ItemId} value={item.ItemId}>
                        {item.name} · {item.sku}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mode === "adjustment" ? (
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <Label htmlFor={id("direction")}>Change</Label>
                  <Select value={line.direction} onValueChange={(direction) => update(line.key, { direction: direction as LineDraft["direction"] })} disabled={disabled}>
                    <SelectTrigger id={id("direction")} className={cn(fieldClass, "w-full")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Add stock</SelectItem>
                      <SelectItem value="out">Remove stock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor={id("qty")}>Quantity</Label>
                <Input
                  id={id("qty")}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  className={cn(fieldClass, "text-right num")}
                  value={line.qty}
                  onChange={(event) => update(line.key, { qty: event.target.value })}
                  disabled={disabled || product?.trackSerials === true}
                />
              </div>
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor={id("uom")}>Unit</Label>
                <Select value={line.uom || undefined} onValueChange={(uom) => update(line.key, { uom })} disabled={disabled || !product || product.trackSerials === true}>
                  <SelectTrigger id={id("uom")} className={cn(fieldClass, "w-full")}>
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {(product ? unitOptions(product) : []).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor={id("bin")}>{mode === "transfer" ? "From bin" : "Bin"}</Label>
                <Input id={id("bin")} list="bins-from" className={cn(fieldClass, "font-mono uppercase")} placeholder="Optional" value={line.binCode} onChange={(event) => update(line.key, { binCode: event.target.value })} disabled={disabled} />
              </div>
              {mode === "transfer" ? (
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <Label htmlFor={id("to-bin")}>To bin</Label>
                  <Input id={id("to-bin")} list="bins-to" className={cn(fieldClass, "font-mono uppercase")} placeholder="Optional" value={line.toBinCode} onChange={(event) => update(line.key, { toBinCode: event.target.value })} disabled={disabled} />
                </div>
              ) : null}
              {product?.trackLots ? (
                <>
                  <div className="flex flex-col gap-1.5 md:col-span-3">
                    <Label htmlFor={id("lot")}>Lot number</Label>
                    <Input id={id("lot")} list={id("lots")} className={cn(fieldClass, "font-mono")} value={line.lotNumber} onChange={(event) => update(line.key, { lotNumber: event.target.value })} disabled={disabled} />
                    <datalist id={id("lots")}>
                      {productLots.map((lot) => (
                        <option key={lot.ItemId} value={lot.lotNumber} />
                      ))}
                    </datalist>
                  </div>
                  {product.trackExpiry && line.direction === "in" && mode === "adjustment" && !productLots.some((lot) => lot.lotNumber === line.lotNumber.trim()) ? (
                    <div className="flex flex-col gap-1.5 md:col-span-3">
                      <Label htmlFor={id("expiry")}>Expires on (new lot)</Label>
                      <DatePicker id={id("expiry")} className={fieldClass} value={line.lotExpiresOn} onChange={(lotExpiresOn) => update(line.key, { lotExpiresOn })} disabled={disabled} clearable placeholder="Expiry" />
                      <p className="text-xs text-muted-foreground">
                        {product.shelfLifeDays ? `Empty uses today + ${product.shelfLifeDays} days shelf life.` : "Optional."}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}
              {product?.trackSerials ? (
                <div className="flex flex-col gap-1.5 md:col-span-3">
                  <Label htmlFor={id("serial")}>Serial number</Label>
                  <Input id={id("serial")} className={cn(fieldClass, "font-mono")} value={line.serial} onChange={(event) => update(line.key, { serial: event.target.value })} disabled={disabled} />
                </div>
              ) : null}
              <div className="col-span-2 flex items-end justify-end md:col-span-12">
                <Button type="button" size="sm" variant="ghost" onClick={() => onChange(lines.filter((item) => item.key !== line.key))} disabled={disabled || lines.length === 1}>
                  <Trash2 aria-hidden /> Remove line
                </Button>
              </div>
            </div>
            {error ? <p className="mt-2 text-xs text-destructive-text">{error}</p> : null}
          </div>
        )
      })}
      <div>
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...lines, emptyLine()])} disabled={disabled}>
          <Plus aria-hidden /> Add line
        </Button>
      </div>
    </div>
  )
}
