import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { SelectField, TextAreaField, TextField } from "@/components/app/form"
import { DateField } from "@/components/app/date-picker"
import { ErrorBanner } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatAddress } from "@/features/partners/api"
import { toStandardQty, type Product } from "@/features/products/api"
import { dueDateFor } from "@/features/sales/actions"
import type { OrderLookups } from "@/features/sales/lookups"
import { extraCosts, landedUnitCosts } from "@/features/sales/order-math"
import { OrderLinesEditor, emptyOrderLine, type OrderLineDraft } from "@/features/sales/OrderLinesEditor"
import { TotalsBlock } from "@/features/sales/OrderBits"
import { errorMessage } from "@/hooks/use-resource"
import { formatMoney } from "@/lib/format"
import { createPurchaseOrder, purchaseTotals, updatePurchaseOrder, type PurchaseDraft } from "./actions"
import type { ExtraCost, PurchaseLine, PurchaseOrder } from "./api"

// Create or edit a purchase quote or order (spec 0012 AC-1, AC-2), with
// freight and non vendor costs and a preview of the landed unit costs (AC-5).

const today = () => new Date().toISOString().slice(0, 10)
const toIso = (day: string) => (day ? new Date(`${day}T12:00:00Z`).toISOString() : null)

function toDraftLines(order?: PurchaseOrder): OrderLineDraft[] {
  if (!order) return [emptyOrderLine()]
  return order.lines.map((line) => ({
    key: line.lineId,
    lineId: line.lineId,
    productId: line.productId,
    description: line.description ?? "",
    qty: String(line.qty),
    uom: line.uom ?? "",
    unitPrice: String(line.unitPrice ?? ""),
    priceEdited: true,
    discountType: line.discountType ?? "",
    discount: line.discount == null ? "" : String(line.discount),
    taxCodeId: line.taxCodeId ?? "",
    returnAction: "",
    vendorItemCode: line.vendorItemCode ?? "",
    done: Math.abs(Number(line.receivedQty ?? 0)),
  }))
}

export function PurchaseOrderEditor({
  lookups,
  order,
  isQuote,
  initialLines,
  initialVendorId,
  initialLocationId,
  onClose,
  onSaved,
}: {
  lookups: OrderLookups
  order?: PurchaseOrder
  isQuote: boolean
  initialLines?: OrderLineDraft[]
  initialVendorId?: string
  initialLocationId?: string
  onClose: () => void
  onSaved: (order: PurchaseOrder) => void
}) {
  const { user, profile, isAdmin } = useCurrentUser()
  const by = user?.email ?? "unknown"
  const defaultLocation = lookups.locations.find((location) => location.isDefault)?.ItemId ?? ""
  const defaultTax = lookups.taxSchemes.find((scheme) => scheme.isDefault)?.ItemId ?? ""
  const [vendorId, setVendorId] = React.useState(order?.vendorId ?? initialVendorId ?? "")
  const [locationId, setLocationId] = React.useState(order?.receiveLocationId ?? initialLocationId ?? defaultLocation)
  const [orderDate, setOrderDate] = React.useState(order?.orderDate?.slice(0, 10) ?? today())
  const [shipDate, setShipDate] = React.useState(order?.requestedShipDate?.slice(0, 10) ?? "")
  const vendorDefaults = lookups.vendorOf(order?.vendorId ?? initialVendorId)
  const [currencyCode, setCurrency] = React.useState(order?.currencyCode ?? vendorDefaults?.currencyCode ?? lookups.homeCurrency)
  const [exchangeRate, setRate] = React.useState(String(order?.exchangeRate ?? lookups.rateFor(vendorDefaults?.currencyCode ?? lookups.homeCurrency)))
  const [taxingSchemeId, setTaxScheme] = React.useState(order?.taxingSchemeId ?? defaultTax)
  const [paymentTermId, setTerm] = React.useState(order?.paymentTermId ?? vendorDefaults?.paymentTermId ?? "")
  const [carrierId, setCarrier] = React.useState(order?.carrierId ?? "")
  const [vendorOrderNumber, setVendorNumber] = React.useState(order?.vendorOrderNumber ?? "")
  const [freight, setFreight] = React.useState(order?.freight ? String(order.freight) : "")
  const [allocationMethod, setMethod] = React.useState<PurchaseOrder["allocationMethod"]>(order?.allocationMethod ?? "value")
  const [costs, setCosts] = React.useState<{ key: string; name: string; type: ExtraCost["type"]; amount: string }[]>(
    () => (order?.nonVendorCosts ?? []).map((cost) => ({ key: crypto.randomUUID(), name: cost.name, type: cost.type, amount: String(cost.amount) }))
  )
  const [remarks, setRemarks] = React.useState(order?.remarks ?? "")
  const [lines, setLines] = React.useState<OrderLineDraft[]>(() => initialLines ?? toDraftLines(order))
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const vendor = lookups.vendorOf(vendorId)

  function chooseVendor(id: string) {
    setVendorId(id)
    const picked = lookups.vendorOf(id)
    if (!picked || order) return
    if (picked.paymentTermId) setTerm(picked.paymentTermId)
    const code = picked.currencyCode || lookups.homeCurrency
    setCurrency(code)
    setRate(String(lookups.rateFor(code, toIso(orderDate) ?? undefined)))
    setLines((current) => current.map((line) => ({ ...line, priceEdited: line.lineId ? line.priceEdited : false })))
  }

  const vendorItem = React.useCallback((product: Product) => lookups.vendorItems.find((item) => item.vendorId === vendorId && item.productId === product.ItemId), [lookups, vendorId])

  /** The vendor's price per standard unit, converted to the order currency, per entered unit. */
  const priceFor = React.useCallback(
    (line: OrderLineDraft, product: Product) => {
      const item = vendorItem(product)
      if (!item?.unitCost) return { price: null, note: vendorId ? "No vendor price on file. Type a price." : undefined }
      const from = item.currencyCode || lookups.homeCurrency
      const perStd = from === currencyCode ? item.unitCost : (item.unitCost / lookups.rateFor(from)) * (Number(exchangeRate) || 1)
      return { price: perStd * (toStandardQty(product, 1, line.uom || product.standardUom) || 1) }
    },
    [vendorItem, vendorId, lookups, currencyCode, exchangeRate]
  )

  React.useEffect(() => {
    setLines((current) =>
      current.map((line) => {
        const product = lookups.productOf(line.productId)
        if (!product || line.priceEdited) return line
        const { price } = priceFor(line, product)
        const item = vendorItem(product)
        return { ...line, unitPrice: price == null ? "" : String(Math.round(price * 10000) / 10000), vendorItemCode: line.vendorItemCode || item?.vendorItemCode || "" }
      })
    )
  }, [priceFor, vendorItem, lookups])

  const builtLines: PurchaseLine[] = lines
    .filter((line) => line.productId)
    .map((line) => {
      const product = lookups.productOf(line.productId)!
      const qty = Number(line.qty) || 0
      const old = order?.lines.find((item) => item.lineId === line.lineId)
      return {
        lineId: line.lineId ?? crypto.randomUUID(),
        productId: line.productId,
        vendorItemCode: line.vendorItemCode.trim() || null,
        description: line.description.trim() || null,
        qty,
        uom: line.uom || product.standardUom,
        stdQty: toStandardQty(product, qty, line.uom || product.standardUom),
        unitPrice: Number(line.unitPrice) || 0,
        discountType: line.discountType || null,
        discount: line.discountType ? Number(line.discount) || 0 : null,
        taxCodeId: line.taxCodeId || null,
        receivedQty: old?.receivedQty ?? 0,
      }
    })
  const nonVendorCosts: ExtraCost[] = costs.filter((cost) => cost.name.trim() && Number(cost.amount)).map((cost) => ({ name: cost.name.trim(), type: cost.type, amount: Number(cost.amount) }))
  const preview = { lines: builtLines, freight: Number(freight) || 0, nonVendorCosts, allocationMethod, exchangeRate: Number(exchangeRate) || 1, taxingSchemeId }
  const totals = purchaseTotals(preview, lookups)
  const landed = landedUnitCosts(preview, (id) => lookups.productOf(id))

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!vendor) return setError("Choose a vendor.")
    if (!locationId) return setError("Choose where it is received.")
    const draft: PurchaseDraft = {
      isQuote: order ? order.isQuote : isQuote,
      vendorId,
      contact: order?.contact ?? vendor.contacts?.[0] ?? null,
      vendorAddress: order?.vendorAddress ?? vendor.address ?? null,
      receiveLocationId: locationId,
      orderDate: toIso(orderDate) ?? new Date().toISOString(),
      dueDate: dueDateFor(toIso(orderDate) ?? new Date().toISOString(), lookups.termOf(paymentTermId)),
      requestedShipDate: toIso(shipDate),
      currencyCode,
      exchangeRate: Number(exchangeRate) || 1,
      taxingSchemeId: taxingSchemeId || null,
      paymentTermId: paymentTermId || null,
      carrierId: carrierId || null,
      vendorOrderNumber: vendorOrderNumber.trim() || null,
      freight: Number(freight) || 0,
      nonVendorCosts,
      allocationMethod,
      remarks: remarks.trim() || null,
      lines: builtLines,
    }
    setSaving(true)
    setError(undefined)
    try {
      const saved = order ? await updatePurchaseOrder(order.ItemId, draft, lookups, by, { by, profile, isAdmin }) : await createPurchaseOrder(draft, lookups, by, { by, profile, isAdmin })
      toast.success(`${saved.number} saved`)
      onSaved(saved)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const options = {
    vendors: lookups.vendors.filter((row) => row.isActive !== false || row.ItemId === vendorId).map((row) => ({ value: row.ItemId, label: row.name })),
    locations: lookups.locations.filter((row) => row.isActive !== false).map((row) => ({ value: row.ItemId, label: row.name })),
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{order ? `Edit ${order.number}` : isQuote ? "New purchase quote" : "New purchase order"}</DialogTitle>
          <DialogDescription>Prices start from the vendor's item price. Freight and other costs are spread into the landed cost of stocked lines.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-5">
          {error ? <ErrorBanner message={error} /> : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SelectField id="po-vendor" label="Vendor" required options={options.vendors} value={vendorId} onChange={chooseVendor} disabled={Boolean(order)} />
            <SelectField id="po-location" label="Receive at" required options={options.locations} value={locationId} onChange={setLocationId} />
            <DateField id="po-date" label="Order date" value={orderDate} onChange={setOrderDate} />
            <SelectField
              id="po-currency"
              label="Currency"
              options={lookups.currencies.map((code) => ({ value: code, label: code }))}
              value={currencyCode}
              onChange={(code) => {
                setCurrency(code)
                setRate(String(lookups.rateFor(code, toIso(orderDate) ?? undefined)))
              }}
            />
            <TextField id="po-rate" label="Exchange rate" type="number" step="any" value={exchangeRate} onChange={setRate} disabled={currencyCode === lookups.homeCurrency} helper={`${currencyCode} per 1 ${lookups.homeCurrency}`} />
            <SelectField id="po-tax" label="Taxing scheme" options={lookups.taxSchemes.map((row) => ({ value: row.ItemId, label: row.name }))} value={taxingSchemeId} onChange={setTaxScheme} allowNone />
            <SelectField id="po-term" label="Payment terms" options={lookups.terms.map((row) => ({ value: row.ItemId, label: row.name }))} value={paymentTermId} onChange={setTerm} allowNone />
            <SelectField id="po-carrier" label="Carrier" options={lookups.carriers.map((row) => ({ value: row.ItemId, label: row.name }))} value={carrierId} onChange={setCarrier} allowNone />
            <TextField id="po-vendor-number" label="Vendor's order number" value={vendorOrderNumber} onChange={setVendorNumber} mono />
            <DateField id="po-ship-date" label="Requested ship date" value={shipDate} onChange={setShipDate} />
          </div>
          {vendor ? <p className="rounded-md bg-muted p-3 text-sm">Vendor address: {formatAddress(order?.vendorAddress ?? vendor.address) || "none"}</p> : null}
          <OrderLinesEditor
            mode="purchase"
            lines={lines}
            onChange={setLines}
            lookups={lookups}
            currency={currencyCode}
            taxSchemeId={taxingSchemeId}
            priceFor={priceFor}
            vendorCodeFor={(product) => vendorItem(product)?.vendorItemCode ?? ""}
            disabled={saving}
          />
          <section className="flex flex-col gap-3 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Landed cost</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <TextField id="po-freight" label="Freight" type="number" step="any" value={freight} onChange={setFreight} />
              <SelectField
                id="po-method"
                label="Spread by"
                options={[
                  { value: "value", label: "Value" },
                  { value: "weight", label: "Weight" },
                  { value: "volume", label: "Volume" },
                ]}
                value={allocationMethod ?? "value"}
                onChange={(value) => setMethod(value as PurchaseOrder["allocationMethod"])}
              />
            </div>
            {costs.map((cost) => (
              <div key={cost.key} className="flex flex-wrap items-center gap-2">
                <Input aria-label="Cost name" placeholder="Duty, insurance…" className="max-w-xs" value={cost.name} onChange={(event) => setCosts((current) => current.map((item) => (item.key === cost.key ? { ...item, name: event.target.value } : item)))} />
                <Select value={cost.type} onValueChange={(value) => setCosts((current) => current.map((item) => (item.key === cost.key ? { ...item, type: value as ExtraCost["type"] } : item)))}>
                  <SelectTrigger aria-label="Cost type" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                    <SelectItem value="pct">% of lines</SelectItem>
                  </SelectContent>
                </Select>
                <Input aria-label="Cost amount" type="number" step="any" className="w-28 text-right num" value={cost.amount} onChange={(event) => setCosts((current) => current.map((item) => (item.key === cost.key ? { ...item, amount: event.target.value } : item)))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove cost" onClick={() => setCosts((current) => current.filter((item) => item.key !== cost.key))}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <div>
              <Button type="button" size="sm" variant="secondary" onClick={() => setCosts((current) => [...current, { key: crypto.randomUUID(), name: "", type: "fixed", amount: "" }])}>
                <Plus aria-hidden /> Add a non vendor cost
              </Button>
            </div>
            {landed.size ? (
              <p className="text-xs text-muted-foreground">
                Extra costs {formatMoney(extraCosts(preview), currencyCode)}. Landed unit cost in {lookups.homeCurrency}:{" "}
                {builtLines
                  .filter((line) => landed.has(line.lineId))
                  .map((line) => `${lookups.productOf(line.productId)?.name} ${formatMoney(landed.get(line.lineId)!, lookups.homeCurrency)}`)
                  .join(", ")}
              </p>
            ) : null}
          </section>
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <TextAreaField id="po-remarks" label="Remarks" value={remarks} onChange={setRemarks} className="md:flex-1" />
            <TotalsBlock
              currency={currencyCode}
              rows={[
                { label: "Subtotal", value: totals.subtotal },
                { label: "Freight", value: Number(freight) || 0 },
                { label: "Tax", value: totals.taxTotal },
                { label: "Total", value: totals.total, strong: true },
              ]}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-w-24">
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
