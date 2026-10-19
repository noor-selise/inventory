import * as React from "react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { SelectField, TextAreaField, TextField } from "@/components/app/form"
import { ErrorBanner } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatAddress } from "@/features/partners/api"
import { resolvePrice } from "@/features/pricing/pricing"
import { toStandardQty, type Product } from "@/features/products/api"
import { errorMessage } from "@/hooks/use-resource"
import { createSalesOrder, dueDateFor, salesTotals, updateSalesOrder, type SalesDraft } from "./actions"
import type { SalesLine, SalesOrder } from "./api"
import type { OrderLookups } from "./lookups"
import { OrderLinesEditor, emptyOrderLine, type OrderLineDraft } from "./OrderLinesEditor"
import { TotalsBlock } from "./OrderBits"

// Create or edit a sales quote or order (spec 0011 AC-1, AC-2). Choosing the
// customer fills in their defaults; the order keeps a snapshot of them.

const today = () => new Date().toISOString().slice(0, 10)
const toIso = (day: string) => (day ? new Date(`${day}T12:00:00Z`).toISOString() : null)

function toDraftLines(order?: SalesOrder): OrderLineDraft[] {
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
    returnAction: line.returnAction ?? "",
    vendorItemCode: "",
    done: Math.max(Number(line.pickedQty ?? 0), Number(line.restockedQty ?? 0)),
  }))
}

export function SalesOrderEditor({
  lookups,
  order,
  isQuote,
  onClose,
  onSaved,
}: {
  lookups: OrderLookups
  order?: SalesOrder
  isQuote: boolean
  onClose: () => void
  onSaved: (order: SalesOrder) => void
}) {
  const { user } = useCurrentUser()
  const by = user?.email ?? "unknown"
  const defaultLocation = lookups.locations.find((location) => location.isDefault)?.ItemId ?? lookups.locations[0]?.ItemId ?? ""
  const defaultScheme = lookups.schemes.find((scheme) => scheme.isDefault)?.ItemId ?? ""
  const defaultTax = lookups.taxSchemes.find((scheme) => scheme.isDefault)?.ItemId ?? ""
  const [customerId, setCustomerId] = React.useState(order?.customerId ?? "")
  const [locationId, setLocationId] = React.useState(order?.locationId ?? defaultLocation)
  const [orderDate, setOrderDate] = React.useState(order?.orderDate?.slice(0, 10) ?? today())
  const [shipDate, setShipDate] = React.useState(order?.requestedShipDate?.slice(0, 10) ?? "")
  const [currencyCode, setCurrency] = React.useState(order?.currencyCode ?? lookups.homeCurrency)
  const [exchangeRate, setRate] = React.useState(String(order?.exchangeRate ?? 1))
  const [pricingSchemeId, setScheme] = React.useState(order?.pricingSchemeId ?? defaultScheme)
  const [taxingSchemeId, setTaxScheme] = React.useState(order?.taxingSchemeId ?? defaultTax)
  const [paymentTermId, setTerm] = React.useState(order?.paymentTermId ?? "")
  const [salesRepUserId, setRep] = React.useState(order?.salesRepUserId ?? "")
  const [customerPoNumber, setPo] = React.useState(order?.customerPoNumber ?? "")
  const [freight, setFreight] = React.useState(order?.freight ? String(order.freight) : "")
  const [remarks, setRemarks] = React.useState(order?.remarks ?? "")
  const [lines, setLines] = React.useState<OrderLineDraft[]>(() => toDraftLines(order))
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string>()

  const customer = lookups.customerOf(customerId)

  function chooseCustomer(id: string) {
    setCustomerId(id)
    const picked = lookups.customerOf(id)
    if (!picked || order) return
    if (picked.pricingSchemeId) setScheme(picked.pricingSchemeId)
    if (picked.taxingSchemeId) setTaxScheme(picked.taxingSchemeId)
    if (picked.paymentTermId) setTerm(picked.paymentTermId)
    if (picked.salesRepUserId) setRep(picked.salesRepUserId)
    const code = picked.currencyCode || lookups.homeCurrency
    setCurrency(code)
    setRate(String(lookups.rateFor(code, toIso(orderDate) ?? undefined)))
    setLines((current) => current.map((line) => ({ ...line, priceEdited: line.lineId ? line.priceEdited : false })))
  }

  /** Spec 0010 price for the line, per entered unit, in the order currency. */
  const priceFor = React.useCallback(
    (line: OrderLineDraft, product: Product) => {
      const stdQty = Math.abs(toStandardQty(product, Number(line.qty) || 0, line.uom || product.standardUom)) || 1
      const prices = lookups.prices.filter((row) => row.productId === product.ItemId)
      const result = resolvePrice({
        customerSchemeId: pricingSchemeId || null,
        defaultSchemeId: defaultScheme || null,
        customerDiscountPct: customer?.defaultDiscountPct ?? null,
        lineDiscount: line.discountType ? { type: line.discountType, value: Number(line.discount) || 0 } : null,
        prices,
        breaks: lookups.breaks.filter((row) => prices.some((price) => price.ItemId === row.productPriceId)),
        averageCost: product.averageCost ?? null,
        qty: stdQty,
      })
      if (!result.ok) return { price: null, note: result.reason === "no_cost_for_markup" ? "No cost yet, so the markup price is unknown. Type a price." : "No list price. Type a price." }
      const scheme = lookups.schemes.find((row) => row.ItemId === result.schemeId)
      const schemeCurrency = scheme?.currencyCode ?? lookups.homeCurrency
      const rate = Number(exchangeRate) || 1
      // Scheme currency to home, then home to the order currency.
      const inHome = result.unitPrice / lookups.rateFor(schemeCurrency, toIso(orderDate) ?? undefined)
      const perStd = schemeCurrency === currencyCode ? result.unitPrice : inHome * rate
      const perEntered = perStd * (toStandardQty(product, 1, line.uom || product.standardUom) || 1)
      return { price: perEntered, note: result.source === "break" ? "Volume price" : undefined }
    },
    [lookups, pricingSchemeId, defaultScheme, customer, exchangeRate, currencyCode, orderDate]
  )

  // Prices follow header changes for lines whose price was not typed.
  React.useEffect(() => {
    setLines((current) =>
      current.map((line) => {
        const product = lookups.productOf(line.productId)
        if (!product || line.priceEdited) return line
        const { price } = priceFor(line, product)
        return { ...line, unitPrice: price == null ? "" : String(Math.round(price * 10000) / 10000) }
      })
    )
  }, [priceFor, lookups])

  function buildLines(): SalesLine[] {
    return lines
      .filter((line) => line.productId)
      .map((line) => {
        const product = lookups.productOf(line.productId)!
        const qty = Number(line.qty) || 0
        const old = order?.lines.find((item) => item.lineId === line.lineId)
        return {
          lineId: line.lineId ?? crypto.randomUUID(),
          productId: line.productId,
          description: line.description.trim() || null,
          qty,
          uom: line.uom || product.standardUom,
          stdQty: toStandardQty(product, qty, line.uom || product.standardUom),
          unitPrice: Number(line.unitPrice) || 0,
          discountType: line.discountType || null,
          discount: line.discountType ? Number(line.discount) || 0 : null,
          taxCodeId: line.taxCodeId || null,
          serviceDone: old?.serviceDone ?? false,
          returnAction: qty < 0 ? line.returnAction || "restock" : null,
          pickedQty: old?.pickedQty ?? 0,
          packedQty: old?.packedQty ?? 0,
          shippedQty: old?.shippedQty ?? 0,
          restockedQty: old?.restockedQty ?? 0,
        }
      })
  }

  const draftLines = buildLines()
  const totals = salesTotals({ lines: draftLines, freight: Number(freight) || 0, taxingSchemeId }, lookups)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!customer) return setError("Choose a customer.")
    if (!locationId) return setError("Choose the location the order ships from.")
    if (!draftLines.length) return setError("Add at least one line.")
    const contact = customer.contacts?.[0] ?? null
    const draft: SalesDraft = {
      isQuote: order ? order.isQuote : isQuote,
      customerId,
      contact: order?.contact ?? contact,
      billingAddress: order?.billingAddress ?? customer.billingAddress ?? null,
      shippingAddress: order?.shippingAddress ?? customer.shippingAddress ?? customer.billingAddress ?? null,
      locationId,
      orderDate: toIso(orderDate) ?? new Date().toISOString(),
      dueDate: dueDateFor(toIso(orderDate) ?? new Date().toISOString(), lookups.termOf(paymentTermId)),
      requestedShipDate: toIso(shipDate),
      currencyCode,
      exchangeRate: Number(exchangeRate) || 1,
      pricingSchemeId: pricingSchemeId || null,
      taxingSchemeId: taxingSchemeId || null,
      paymentTermId: paymentTermId || null,
      salesRepUserId: salesRepUserId || null,
      customerPoNumber: customerPoNumber.trim() || null,
      freight: Number(freight) || 0,
      remarks: remarks.trim() || null,
      source: order?.source ?? "manual",
      priority: order?.priority ?? 0,
      lines: draftLines,
    }
    setSaving(true)
    setError(undefined)
    try {
      const saved = order ? await updateSalesOrder(order.ItemId, draft, lookups, by) : await createSalesOrder(draft, lookups, by)
      toast.success(`${saved.number} saved`)
      onSaved(saved)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const options = {
    customers: lookups.customers.filter((row) => row.isActive !== false || row.ItemId === customerId).map((row) => ({ value: row.ItemId, label: row.name })),
    locations: lookups.locations.filter((row) => row.isActive !== false).map((row) => ({ value: row.ItemId, label: row.name })),
    currencies: lookups.currencies.map((code) => ({ value: code, label: code })),
    schemes: lookups.schemes.filter((row) => row.isActive !== false).map((row) => ({ value: row.ItemId, label: `${row.name} (${row.currencyCode})` })),
    taxes: lookups.taxSchemes.filter((row) => row.isActive !== false).map((row) => ({ value: row.ItemId, label: row.name })),
    terms: lookups.terms.filter((row) => row.isActive !== false).map((row) => ({ value: row.ItemId, label: row.name })),
  }
  const kind = order ? (order.isQuote ? "quote" : "order") : isQuote ? "quote" : "order"

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{order ? `Edit ${order.number}` : `New sales ${kind}`}</DialogTitle>
          <DialogDescription>Prices come from the customer's price list and update as you change quantity, unit or discount, until you type your own.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-5">
          {error ? <ErrorBanner message={error} /> : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SelectField id="so-customer" label="Customer" required options={options.customers} value={customerId} onChange={chooseCustomer} disabled={Boolean(order)} />
            <SelectField id="so-location" label="Ship from" required options={options.locations} value={locationId} onChange={setLocationId} />
            <TextField id="so-date" label="Order date" type="date" required value={orderDate} onChange={setOrderDate} />
            <SelectField id="so-scheme" label="Price list" options={options.schemes} value={pricingSchemeId} onChange={setScheme} allowNone />
            <SelectField id="so-tax" label="Taxing scheme" options={options.taxes} value={taxingSchemeId} onChange={setTaxScheme} allowNone />
            <SelectField id="so-term" label="Payment terms" options={options.terms} value={paymentTermId} onChange={setTerm} allowNone />
            <SelectField
              id="so-currency"
              label="Currency"
              options={options.currencies}
              value={currencyCode}
              onChange={(code) => {
                setCurrency(code)
                setRate(String(lookups.rateFor(code, toIso(orderDate) ?? undefined)))
              }}
            />
            <TextField
              id="so-rate"
              label="Exchange rate"
              type="number"
              step="any"
              value={exchangeRate}
              onChange={setRate}
              disabled={currencyCode === lookups.homeCurrency}
              helper={`${currencyCode} per 1 ${lookups.homeCurrency}`}
            />
            <SelectField id="so-rep" label="Sales rep" options={lookups.users} value={salesRepUserId} onChange={setRep} allowNone />
            <TextField id="so-po" label="Customer PO number" value={customerPoNumber} onChange={setPo} />
            <TextField id="so-ship-date" label="Requested ship date" type="date" value={shipDate} onChange={setShipDate} />
            <TextField id="so-freight" label="Freight" type="number" step="any" value={freight} onChange={setFreight} />
          </div>
          {customer ? (
            <div className="grid grid-cols-1 gap-2 rounded-md bg-muted p-3 text-sm md:grid-cols-2">
              <p>
                <span className="font-semibold">Bill to: </span>
                {formatAddress(order?.billingAddress ?? customer.billingAddress) || "No address"}
              </p>
              <p>
                <span className="font-semibold">Ship to: </span>
                {formatAddress(order?.shippingAddress ?? customer.shippingAddress ?? customer.billingAddress) || "No address"}
              </p>
            </div>
          ) : null}
          <OrderLinesEditor mode="sales" lines={lines} onChange={setLines} lookups={lookups} currency={currencyCode} taxSchemeId={taxingSchemeId} priceFor={priceFor} disabled={saving} />
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <TextAreaField id="so-remarks" label="Remarks" value={remarks} onChange={setRemarks} className="md:flex-1" />
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
