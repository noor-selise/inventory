import { Plus, Trash2 } from "lucide-react"

import { NONE } from "@/components/app/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { unitOptions, type Product } from "@/features/products/api"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { discounted } from "./order-math"
import { headClass } from "./OrderBits"
import type { OrderLookups } from "./lookups"

// Lines of a sales or purchase order. Sales prices come from the price lists
// (spec 0010) until the user types a price; purchase prices from the vendor's
// item price. A negative quantity is a return.

export type OrderLineDraft = {
  key: string
  lineId?: string
  productId: string
  description: string
  qty: string
  uom: string
  unitPrice: string
  priceEdited: boolean
  discountType: "" | "percent" | "fixed"
  discount: string
  taxCodeId: string
  returnAction: "" | "restock" | "discard"
  vendorItemCode: string
  /** Progress already recorded on the saved line; it limits what can change. */
  done: number
}

export function emptyOrderLine(): OrderLineDraft {
  return { key: crypto.randomUUID(), productId: "", description: "", qty: "1", uom: "", unitPrice: "", priceEdited: false, discountType: "", discount: "", taxCodeId: "", returnAction: "", vendorItemCode: "", done: 0 }
}

/** Amount of a draft line in the order currency. Sales prices are net already; purchase prices take the discount. */
export function draftAmount(line: OrderLineDraft, mode: "sales" | "purchase") {
  const qty = Number(line.qty) || 0
  const price = Number(line.unitPrice) || 0
  return qty * (mode === "sales" ? price : discounted(price, line.discountType || null, Number(line.discount) || 0))
}

type Props = {
  mode: "sales" | "purchase"
  lines: OrderLineDraft[]
  onChange: (lines: OrderLineDraft[]) => void
  lookups: OrderLookups
  currency: string
  taxSchemeId: string
  /** Works out the default unit price for a line (per entered unit). */
  priceFor: (line: OrderLineDraft, product: Product) => { price: number | null; note?: string }
  /** Purchase only: the vendor's own code for the product. */
  vendorCodeFor?: (product: Product) => string
  errors?: Record<string, string | undefined>
  disabled?: boolean
}

export function OrderLinesEditor({ mode, lines, onChange, lookups, currency, taxSchemeId, priceFor, vendorCodeFor, errors, disabled }: Props) {
  // Fixed assets are bought, never sold (spec 0028 AC-5).
  const products = lookups.products.filter((product) => product.isActive !== false && (mode === "purchase" || product.itemType !== "fixed_asset"))
  const codes = lookups.taxCodes.filter((code) => code.taxingSchemeId === taxSchemeId && code.isActive !== false)

  function update(key: string, patch: Partial<OrderLineDraft>) {
    onChange(
      lines.map((line) => {
        if (line.key !== key) return line
        let next = { ...line, ...patch }
        if (patch.productId !== undefined) {
          const product = lookups.productOf(patch.productId)
          next = {
            ...next,
            uom: product ? (mode === "sales" ? product.salesUom || product.standardUom : product.purchaseUom || product.standardUom) : "",
            description: "",
            priceEdited: false,
            vendorItemCode: product && vendorCodeFor ? vendorCodeFor(product) : "",
          }
        }
        if (Number(next.qty) >= 0) next.returnAction = ""
        else if (!next.returnAction && mode === "sales") next.returnAction = "restock"
        const product = lookups.productOf(next.productId)
        if (product && !next.priceEdited) {
          const { price } = priceFor(next, product)
          next.unitPrice = price == null ? "" : String(Math.round(price * 10000) / 10000)
        }
        return next
      })
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="bg-muted text-left">
              <th className={cn(headClass, "px-2")}>Product</th>
              <th className={cn(headClass, "w-24 px-2 text-right")}>Qty</th>
              <th className={cn(headClass, "w-32 px-2")}>Unit</th>
              <th className={cn(headClass, "w-28 px-2 text-right")}>Price</th>
              <th className={cn(headClass, "w-40 px-2")}>Discount</th>
              <th className={cn(headClass, "w-36 px-2")}>Tax code</th>
              <th className={cn(headClass, "w-28 px-2 text-right")}>Amount</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const product = lookups.productOf(line.productId)
              const note = product && !line.priceEdited ? priceFor(line, product).note : undefined
              const error = errors?.[line.key]
              return (
                <tr key={line.key} className="border-t align-top">
                  <td className="px-2 py-2">
                    <Select value={line.productId || undefined} onValueChange={(value) => update(line.key, { productId: value })} disabled={disabled || line.done > 0}>
                      <SelectTrigger aria-label={`Line ${index + 1} product`} className="w-full">
                        <SelectValue placeholder="Choose a product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((item) => (
                          <SelectItem key={item.ItemId} value={item.ItemId}>
                            {item.name} <span className="text-muted-foreground">({item.sku})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      aria-label={`Line ${index + 1} description`}
                      placeholder="Description (optional)"
                      className="mt-1 h-8 text-xs"
                      value={line.description}
                      onChange={(event) => update(line.key, { description: event.target.value })}
                      disabled={disabled}
                    />
                    {mode === "sales" && Number(line.qty) < 0 ? (
                      <Select value={line.returnAction || "restock"} onValueChange={(value) => update(line.key, { returnAction: value as OrderLineDraft["returnAction"] })} disabled={disabled}>
                        <SelectTrigger aria-label={`Line ${index + 1} return action`} className="mt-1 h-8 w-full text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="restock">Return: put back in stock</SelectItem>
                          <SelectItem value="discard">Return: discard (damaged)</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                    {mode === "purchase" ? (
                      <Input
                        aria-label={`Line ${index + 1} vendor item code`}
                        placeholder="Vendor item code"
                        className="mt-1 h-8 font-mono text-xs"
                        value={line.vendorItemCode}
                        onChange={(event) => update(line.key, { vendorItemCode: event.target.value })}
                        disabled={disabled}
                      />
                    ) : null}
                    {error ? <p className="mt-1 text-xs text-destructive-text">{error}</p> : note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
                  </td>
                  <td className="px-2 py-2">
                    <Input aria-label={`Line ${index + 1} quantity`} type="number" step="any" allowNegative className="text-right num" value={line.qty} onChange={(event) => update(line.key, { qty: event.target.value })} disabled={disabled} />
                    {line.done > 0 ? <p className="mt-1 text-right text-xs text-muted-foreground">{line.done} done</p> : null}
                  </td>
                  <td className="px-2 py-2">
                    <Select value={line.uom || undefined} onValueChange={(value) => update(line.key, { uom: value })} disabled={disabled || !product || line.done > 0}>
                      <SelectTrigger aria-label={`Line ${index + 1} unit`} className="w-full">
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
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      aria-label={`Line ${index + 1} unit price`}
                      type="number"
                      step="any"
                      className="text-right num"
                      value={line.unitPrice}
                      onChange={(event) => update(line.key, { unitPrice: event.target.value, priceEdited: true })}
                      disabled={disabled}
                    />
                    {line.priceEdited && product ? (
                      <button type="button" className="mt-1 text-xs text-muted-foreground underline" onClick={() => update(line.key, { priceEdited: false })}>
                        Use list price
                      </button>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <Select value={line.discountType || NONE} onValueChange={(value) => update(line.key, { discountType: value === NONE ? "" : (value as OrderLineDraft["discountType"]) })} disabled={disabled}>
                        <SelectTrigger aria-label={`Line ${index + 1} discount type`} className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>None</SelectItem>
                          <SelectItem value="percent">%</SelectItem>
                          <SelectItem value="fixed">Off</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        aria-label={`Line ${index + 1} discount`}
                        type="number"
                        step="any"
                        className="text-right num"
                        value={line.discount}
                        onChange={(event) => update(line.key, { discount: event.target.value })}
                        disabled={disabled || !line.discountType}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <Select value={line.taxCodeId || NONE} onValueChange={(value) => update(line.key, { taxCodeId: value === NONE ? "" : value })} disabled={disabled}>
                      <SelectTrigger aria-label={`Line ${index + 1} tax code`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Scheme rate</SelectItem>
                        {codes.map((code) => (
                          <SelectItem key={code.ItemId} value={code.ItemId}>
                            {code.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2 pt-4 text-right num">{formatMoney(draftAmount(line, mode), currency)}</td>
                  <td className="px-1 py-2">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${index + 1}`} onClick={() => onChange(lines.filter((item) => item.key !== line.key))} disabled={disabled || line.done > 0 || lines.length === 1}>
                      <Trash2 aria-hidden />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div>
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...lines, emptyOrderLine()])} disabled={disabled}>
          <Plus aria-hidden /> Add line
        </Button>
      </div>
    </div>
  )
}
