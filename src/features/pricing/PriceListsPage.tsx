import * as React from "react"
import { Plus, Search, Tags, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { SelectField, TextField } from "@/components/app/form"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { RecordList } from "@/components/app/record-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { customers } from "@/features/partners/api"
import { products, type Product } from "@/features/products/api"
import { currencies, taxCodes, taxingSchemes } from "@/features/settings/api"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { CURRENCY_CODES, formatMoney, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { priceBreaks, pricingSchemes, productPrices, type PriceBreak, type PricingScheme, type ProductPrice } from "./api"
import { computeTax, resolvePrice } from "./pricing.ts"

// Pricing schemes with one default, product prices (fixed or markup over
// average cost) and volume breaks (spec 0010 AC-3, AC-4), plus a price check
// that runs the shared price and tax module (AC-5, AC-6).

const PRICE_EDITORS = ["admin", "manager"]
const headClass = "h-9 label-overline"

export function PriceListsPage() {
  const canEdit = useCurrentUser().hasRole(...PRICE_EDITORS)
  const schemes = useResource(() => pricingSchemes.list({ sort: { name: 1 } }), [])
  const money = useResource(() => currencies.list({ sort: { code: 1 } }), [])
  const [selectedId, setSelectedId] = React.useState<string>()
  const items = schemes.data?.items ?? []
  const selected = items.find((item) => item.ItemId === selectedId) ?? items.find((item) => item.isDefault) ?? items[0]
  const currencyOptions = (money.data?.items.length ? money.data.items.map((item) => item.code) : CURRENCY_CODES).map((code) => ({ value: code, label: code }))

  return (
    <>
      <PageHeader title="Price lists" description="Selling prices per pricing scheme, with quantity breaks. Customers use their scheme, or the default." />
      <div className="flex flex-col gap-6">
        <SectionCard title="Pricing schemes">
          <RecordList<PricingScheme>
            collection={pricingSchemes}
            noun="Pricing scheme"
            canEdit={canEdit}
            emptyMessage="No pricing schemes yet. Add one and make it the default."
            sort={{ name: 1 }}
            activeField="isActive"
            defaultField="isDefault"
            defaults={{ isActive: true, currencyCode: "USD" }}
            isLocked={(scheme) => scheme.isDefault === true}
            onChanged={() => void schemes.reload()}
            fields={[
              { name: "name", label: "Name", type: "text", required: true },
              { name: "currencyCode", label: "Currency", type: "select", required: true, options: currencyOptions },
              { name: "isTaxInclusive", label: "Prices include tax", type: "checkbox" },
              { name: "isDefault", label: "Default pricing scheme", type: "checkbox" },
            ]}
            validate={(values, all, editing) => {
              const name = String(values.name ?? "").trim().toLowerCase()
              if (all.some((item) => item.ItemId !== editing?.ItemId && item.name.trim().toLowerCase() === name)) return "A scheme with this name already exists."
              if (!values.isDefault && !all.some((item) => item.isDefault && item.ItemId !== editing?.ItemId)) return "One scheme must be the default."
              return undefined
            }}
            columns={[
              {
                label: "Name",
                render: (scheme) => (
                  <button
                    type="button"
                    className={cn("flex cursor-pointer items-center gap-2 font-medium hover:underline", selected?.ItemId === scheme.ItemId && "text-primary")}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedId(scheme.ItemId)
                    }}
                  >
                    {scheme.name}
                    {scheme.isDefault ? <Badge variant="success">Default</Badge> : null}
                  </button>
                ),
              },
              { label: "Currency", render: (scheme) => <span className="font-mono">{scheme.currencyCode}</span> },
              { label: "Prices", render: (scheme) => (scheme.isTaxInclusive ? "Include tax" : "Exclude tax") },
            ]}
          />
        </SectionCard>
        {selected ? <SchemePrices scheme={selected} canEdit={canEdit} /> : null}
        <PriceCheck />
      </div>
    </>
  )
}

type PriceRow = { product: Product; price?: ProductPrice; breaks: PriceBreak[] }

function SchemePrices({ scheme, canEdit }: { scheme: PricingScheme; canEdit: boolean }) {
  const [query, setQuery] = React.useState("")
  const [editing, setEditing] = React.useState<PriceRow>()
  const { data, error, loading, reload } = useResource(async (): Promise<PriceRow[]> => {
    const [productRows, prices] = await Promise.all([
      products.list({ filter: { isActive: { $ne: false } }, sort: { name: 1 }, pageSize: 500 }),
      productPrices.list({ filter: { pricingSchemeId: scheme.ItemId }, pageSize: 1000 }),
    ])
    const priceIds = prices.items.map((price) => price.ItemId)
    const breaks = priceIds.length ? (await priceBreaks.list({ filter: { productPriceId: { $in: priceIds } }, sort: { minQty: 1 }, pageSize: 1000 })).items : []
    return productRows.items.map((product) => {
      const price = prices.items.find((row) => row.productId === product.ItemId)
      return { product, price, breaks: price ? breaks.filter((item) => item.productPriceId === price.ItemId) : [] }
    })
  }, [scheme.ItemId])
  const needle = query.trim().toLowerCase()
  const rows = (data ?? []).filter((row) => !needle || row.product.name.toLowerCase().includes(needle) || row.product.sku.toLowerCase().includes(needle))
  const priced = (data ?? []).filter((row) => row.price).length

  const describe = (row: PriceRow) => {
    if (!row.price) return <span className="text-muted-foreground">No price</span>
    if (row.price.priceType === "markup") {
      const resolved = row.product.averageCost != null ? row.product.averageCost * (1 + (row.price.markupPct ?? 0) / 100) : null
      return (
        <span>
          Cost + {formatNumber(row.price.markupPct ?? 0, 2)}%
          <span className="block text-xs text-muted-foreground">{resolved != null ? `now ${formatMoney(resolved, scheme.currencyCode)}` : "no cost yet"}</span>
        </span>
      )
    }
    return formatMoney(row.price.unitPrice ?? 0, scheme.currencyCode)
  }

  return (
    <SectionCard
      title={`Prices in ${scheme.name}`}
      description={`${priced} of ${data?.length ?? 0} active products have a price in this scheme. Products without one use the default scheme.`}
    >
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" aria-label="Filter products" placeholder="Filter by name or SKU" className="h-10 rounded-full pl-10" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}
      {loading && !data ? (
        <LoadingRows />
      ) : rows.length === 0 ? (
        <EmptyState icon={Tags} message="No products match." />
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className={headClass}>Product</TableHead>
                <TableHead className={cn(headClass, "text-right")}>Price</TableHead>
                <TableHead className={cn(headClass, "hidden md:table-cell")}>Quantity breaks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.product.ItemId} className={cn("h-11", canEdit && "cursor-pointer")} onClick={canEdit ? () => setEditing(row) : undefined}>
                  <TableCell>
                    <span className="block font-medium">{row.product.name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{row.product.sku}</span>
                  </TableCell>
                  <TableCell className="text-right num">{describe(row)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {row.breaks.length ? (
                      <span className="flex flex-wrap gap-1">
                        {row.breaks.map((item) => (
                          <Badge key={item.ItemId} variant="neutral" className="num">
                            {formatNumber(item.minQty)}+ at {formatMoney(item.unitPrice, scheme.currencyCode)}
                          </Badge>
                        ))}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editing ? (
        <PriceDialog
          scheme={scheme}
          row={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined)
            void reload()
          }}
        />
      ) : null}
    </SectionCard>
  )
}

type BreakDraft = { ItemId?: string; minQty: string; unitPrice: string }

function PriceDialog({ scheme, row, onClose, onSaved }: { scheme: PricingScheme; row: PriceRow; onClose: () => void; onSaved: () => void }) {
  const [priceType, setPriceType] = React.useState(row.price?.priceType ?? "fixed")
  const [unitPrice, setUnitPrice] = React.useState(row.price?.unitPrice == null ? "" : String(row.price.unitPrice))
  const [markupPct, setMarkupPct] = React.useState(row.price?.markupPct == null ? "" : String(row.price.markupPct))
  const [breaks, setBreaks] = React.useState<BreakDraft[]>(row.breaks.map((item) => ({ ItemId: item.ItemId, minQty: String(item.minQty), unitPrice: String(item.unitPrice) })))
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string>()

  function validate(): string | undefined {
    if (priceType === "fixed" && !(Number(unitPrice) >= 0 && unitPrice !== "")) return "Enter a price of 0 or more."
    if (priceType === "markup" && !(markupPct !== "" && Number.isFinite(Number(markupPct)))) return "Enter a markup percent."
    const parsed = breaks.map((item) => ({ minQty: Number(item.minQty), unitPrice: Number(item.unitPrice) }))
    if (parsed.some((item) => !(item.minQty > 0) || !(item.unitPrice >= 0))) return "Each break needs a quantity above 0 and a price of 0 or more."
    const sorted = [...parsed].sort((a, b) => a.minQty - b.minQty)
    if (new Set(sorted.map((item) => item.minQty)).size !== sorted.length) return "Two breaks have the same quantity."
    // Spec 0010 invariant: higher quantities never cost more per unit.
    if (sorted.some((item, index) => index > 0 && item.unitPrice > sorted[index - 1].unitPrice)) return "A larger quantity break cannot have a higher price."
    return undefined
  }

  async function save() {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      const payload = {
        priceType,
        unitPrice: priceType === "fixed" ? Number(unitPrice) : null,
        markupPct: priceType === "markup" ? Number(markupPct) : null,
      } as const
      let priceId = row.price?.ItemId
      if (priceId) await productPrices.update(priceId, payload)
      else priceId = await productPrices.create({ ...payload, productId: row.product.ItemId, pricingSchemeId: scheme.ItemId })
      const keep = new Set(breaks.map((item) => item.ItemId).filter(Boolean))
      for (const old of row.breaks) if (!keep.has(old.ItemId)) await priceBreaks.remove(old.ItemId)
      for (const item of breaks) {
        const values = { minQty: Number(item.minQty), unitPrice: Number(item.unitPrice) }
        if (item.ItemId) await priceBreaks.update(item.ItemId, values)
        else await priceBreaks.create({ ...values, productPriceId: priceId })
      }
      toast.success("Price saved")
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  async function removePrice() {
    if (!row.price) return
    setSaving(true)
    try {
      for (const item of row.breaks) await priceBreaks.remove(item.ItemId)
      await productPrices.remove(row.price.ItemId)
      toast.success("Price removed; the default scheme applies")
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row.product.name}</DialogTitle>
          <DialogDescription>
            Price in {scheme.name} ({scheme.currencyCode}){scheme.isTaxInclusive ? ", tax included" : ""}.
            {row.product.averageCost != null ? ` Average cost now ${formatMoney(row.product.averageCost, scheme.currencyCode)}.` : " No average cost yet."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error ? <ErrorBanner message={error} /> : null}
          <SelectField
            id="price-type"
            label="Price type"
            options={[
              { value: "fixed", label: "Fixed price" },
              { value: "markup", label: "Markup over average cost" },
            ]}
            value={priceType}
            onChange={(value) => setPriceType(value as "fixed" | "markup")}
          />
          {priceType === "fixed" ? (
            <TextField id="price-unit" label={`Unit price (${scheme.currencyCode})`} type="number" inputMode="decimal" step="any" value={unitPrice} onChange={setUnitPrice} />
          ) : (
            <TextField id="price-markup" label="Markup (%)" type="number" inputMode="decimal" step="any" value={markupPct} onChange={setMarkupPct} helper="The price follows the product's average cost as it changes." />
          )}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Quantity breaks</h3>
            <p className="text-xs text-muted-foreground">From this quantity the unit price drops to the break price, when that is lower than the discounted price.</p>
            {breaks.map((item, index) => (
              <div key={item.ItemId ?? `new-${index}`} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <TextField id={`break-qty-${index}`} label="From quantity" type="number" inputMode="decimal" step="any" value={item.minQty} onChange={(value) => setBreaks(breaks.map((b, at) => (at === index ? { ...b, minQty: value } : b)))} />
                <TextField id={`break-price-${index}`} label="Unit price" type="number" inputMode="decimal" step="any" value={item.unitPrice} onChange={(value) => setBreaks(breaks.map((b, at) => (at === index ? { ...b, unitPrice: value } : b)))} />
                <Button type="button" size="icon" variant="ghost" aria-label={`Remove break ${index + 1}`} onClick={() => setBreaks(breaks.filter((_, at) => at !== index))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div>
              <Button type="button" size="sm" variant="secondary" onClick={() => setBreaks([...breaks, { minQty: "", unitPrice: "" }])}>
                <Plus aria-hidden /> Add break
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {row.price ? (
            <Button type="button" variant="secondary" className="sm:mr-auto" disabled={saving} onClick={() => void removePrice()}>
              Remove price
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()} className="min-w-24">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PriceCheck() {
  const lookups = useResource(async () => {
    const [customerRows, productRows, schemeRows, taxRows, codeRows] = await Promise.all([
      customers.list({ filter: { isActive: { $ne: false } }, sort: { name: 1 }, pageSize: 500 }),
      products.list({ filter: { isActive: { $ne: false } }, sort: { name: 1 }, pageSize: 500 }),
      pricingSchemes.list({ pageSize: 100 }),
      taxingSchemes.list({ pageSize: 100 }),
      taxCodes.list({ pageSize: 200 }),
    ])
    return { customers: customerRows.items, products: productRows.items, schemes: schemeRows.items, taxes: taxRows.items, codes: codeRows.items }
  }, [])
  const [customerId, setCustomerId] = React.useState("")
  const [productId, setProductId] = React.useState("")
  const [qty, setQty] = React.useState("1")
  const [discount, setDiscount] = React.useState("")
  const [taxCodeId, setTaxCodeId] = React.useState("")
  const [result, setResult] = React.useState<React.ReactNode>()

  async function check(event: React.FormEvent) {
    event.preventDefault()
    const data = lookups.data
    if (!data) return
    const customer = data.customers.find((item) => item.ItemId === customerId)
    const product = data.products.find((item) => item.ItemId === productId)
    if (!product) {
      setResult(<ErrorBanner message="Choose a product." />)
      return
    }
    const prices = (await productPrices.list({ filter: { productId: product.ItemId }, pageSize: 50 })).items
    const breaks = prices.length ? (await priceBreaks.list({ filter: { productPriceId: { $in: prices.map((price) => price.ItemId) } }, pageSize: 200 })).items : []
    const defaultScheme = data.schemes.find((scheme) => scheme.isDefault)
    const resolved = resolvePrice({
      customerSchemeId: customer?.pricingSchemeId,
      defaultSchemeId: defaultScheme?.ItemId,
      customerDiscountPct: customer?.defaultDiscountPct,
      lineDiscount: discount ? { type: "percent", value: Number(discount) } : null,
      prices,
      breaks,
      averageCost: product.averageCost,
      qty: Number(qty) || 0,
    })
    if (!resolved.ok) {
      setResult(<ErrorBanner message={resolved.reason === "no_cost_for_markup" ? "This scheme prices by markup, but the product has no average cost yet." : "No price for this product in the customer's scheme or the default scheme."} />)
      return
    }
    const scheme = data.schemes.find((item) => item.ItemId === resolved.schemeId)
    const taxScheme = data.taxes.find((item) => item.ItemId === customer?.taxingSchemeId) ?? data.taxes.find((item) => item.isDefault)
    const currency = scheme?.currencyCode ?? "USD"
    const amount = resolved.unitPrice * (Number(qty) || 0)
    const tax = computeTax(
      [{ amount, taxCode: data.codes.find((code) => code.ItemId === taxCodeId) ?? null }],
      { ...taxScheme, isTaxInclusive: scheme?.isTaxInclusive ?? taxScheme?.isTaxInclusive }
    )
    const rows: [string, string][] = [
      [`Base price (${scheme?.name ?? "scheme"})`, formatMoney(resolved.basePrice, currency)],
      ["After customer discount", formatMoney(resolved.afterCustomerDiscount, currency)],
      ["After line discount", formatMoney(resolved.afterLineDiscount, currency)],
      ["Quantity break", resolved.breakPrice != null ? formatMoney(resolved.breakPrice, currency) : "none"],
      ["Unit price", formatMoney(resolved.unitPrice, currency)],
      [`Net for ${formatNumber(Number(qty) || 0)}`, formatMoney(tax.net, currency)],
      [`Tax (${taxScheme?.name ?? "none"})`, formatMoney(tax.tax1 + tax.tax2, currency)],
      ["Total", formatMoney(tax.total, currency)],
    ]
    setResult(
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm" aria-live="polite">
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt className={cn("text-muted-foreground", label === "Total" && "font-semibold text-foreground")}>{label}</dt>
            <dd className={cn("text-right num", label === "Total" && "font-semibold")}>{value}</dd>
          </React.Fragment>
        ))}
      </dl>
    )
  }

  const data = lookups.data
  return (
    <SectionCard title="Price check" description="Try a customer, product and quantity to see the price and tax an order line would get.">
      <form onSubmit={check} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SelectField id="check-customer" label="Customer" allowNone options={(data?.customers ?? []).map((item) => ({ value: item.ItemId, label: item.name }))} value={customerId} onChange={setCustomerId} />
        <SelectField id="check-product" label="Product" options={(data?.products ?? []).map((item) => ({ value: item.ItemId, label: `${item.name} (${item.sku})` }))} value={productId} onChange={setProductId} />
        <TextField id="check-qty" label="Quantity" type="number" inputMode="decimal" step="any" value={qty} onChange={setQty} />
        <TextField id="check-discount" label="Line discount (%)" type="number" inputMode="decimal" step="any" value={discount} onChange={setDiscount} />
        <SelectField id="check-tax-code" label="Tax code" allowNone options={(data?.codes ?? []).map((item) => ({ value: item.ItemId, label: item.name }))} value={taxCodeId} onChange={setTaxCodeId} />
        <div className="md:col-span-2 xl:col-span-5">
          <Button type="submit" variant="secondary" disabled={!data}>
            Check price
          </Button>
        </div>
      </form>
      {result ? <div className="mt-4 max-w-md rounded-lg bg-muted p-4">{result}</div> : null}
    </SectionCard>
  )
}
