import * as React from "react"
import { Barcode, Lock, Plus, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { AuditLine } from "@/components/app/audit"
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
  type Option,
} from "@/components/app/form"
import { ErrorBanner } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { listClasses } from "@/features/depreciation/api"
import { withNextNumber } from "@/features/settings/numbering"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { BlocksDataError } from "@/lib/blocks/data"
import {
  ITEM_TYPES,
  PRODUCT_DIMENSION_UNIT,
  PRODUCT_WEIGHT_UNIT,
  productBarcodes,
  products,
  type ItemType,
  type Product,
  type ProductBarcode,
} from "./api"
import { generateEan13, normalizeBarcode } from "./barcode"
import { ProductVendors } from "./ProductVendors"
import { PACKAGING_UOM_OPTIONS, STANDARD_UOM_OPTIONS, withCurrentUom } from "./uom"

// Create and edit a product (spec 0005 AC-1 to AC-6). The type and tracking
// flags lock after the first save; Blocks cannot enforce that, the form does.
// A fixed asset product carries a default depreciation class (spec 0028 AC-5).

type Form = {
  name: string
  sku: string
  itemType: ItemType
  standardUom: string
  purchaseUom: string
  purchaseUomRatio: string
  salesUom: string
  salesUomRatio: string
  categoryId: string
  description: string
  length: string
  width: string
  height: string
  weight: string
  remarks: string
  trackLots: boolean
  trackSerials: boolean
  trackExpiry: boolean
  shelfLifeDays: string
  sellBeforeExpiryDays: string
  expiryNoticeDays: string
  depreciationClassId: string
}

const text = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "" : String(value)

function toForm(product: Product | undefined, defaultCategoryId: string): Form {
  return {
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    itemType: product?.itemType ?? "stocked",
    standardUom: product?.standardUom ?? "each",
    purchaseUom: text(product?.purchaseUom),
    purchaseUomRatio: text(product?.purchaseUomRatio),
    salesUom: text(product?.salesUom),
    salesUomRatio: text(product?.salesUomRatio),
    categoryId: product ? text(product.categoryId) : defaultCategoryId,
    description: text(product?.description),
    length: text(product?.length),
    width: text(product?.width),
    height: text(product?.height),
    weight: text(product?.weight),
    remarks: text(product?.remarks),
    trackLots: product?.trackLots === true,
    trackSerials: product?.trackSerials === true,
    trackExpiry: product?.trackExpiry === true,
    shelfLifeDays: text(product?.shelfLifeDays),
    sellBeforeExpiryDays: text(product?.sellBeforeExpiryDays),
    expiryNoticeDays: text(product?.expiryNoticeDays),
    depreciationClassId: text(product?.depreciationClassId),
  }
}

const optionalNumber = (value: string) => (value.trim() === "" ? null : Number(value))

function validate(form: Form): Partial<Record<keyof Form, string>> {
  const errors: Partial<Record<keyof Form, string>> = {}
  if (!form.name.trim()) errors.name = "Name is required."
  if (!form.standardUom.trim()) errors.standardUom = "Standard unit is required."
  if (form.itemType === "fixed_asset" && !form.depreciationClassId) errors.depreciationClassId = "Choose the depreciation class new assets get."
  for (const [uom, ratio] of [
    ["purchaseUom", "purchaseUomRatio"],
    ["salesUom", "salesUomRatio"],
  ] as const) {
    if (form[uom].trim() && !(Number(form[ratio]) > 0)) {
      errors[ratio] = "Enter how many standard units are in one of these."
    }
  }
  for (const key of ["length", "width", "height", "weight"] as const) {
    if (form[key].trim() && !(Number(form[key]) >= 0)) errors[key] = "Must be 0 or more."
  }
  for (const key of ["shelfLifeDays", "sellBeforeExpiryDays", "expiryNoticeDays"] as const) {
    const value = form[key].trim()
    if (value && !(Number.isInteger(Number(value)) && Number(value) >= 0)) {
      errors[key] = "Must be a whole number of days."
    }
  }
  return errors
}

function toPayload(form: Form, locked: boolean) {
  const stocked = form.itemType === "stocked"
  const payload: Partial<Product> = {
    name: form.name.trim(),
    standardUom: form.standardUom.trim(),
    purchaseUom: form.purchaseUom.trim() || null,
    purchaseUomRatio: form.purchaseUom.trim() ? Number(form.purchaseUomRatio) : null,
    salesUom: form.salesUom.trim() || null,
    salesUomRatio: form.salesUom.trim() ? Number(form.salesUomRatio) : null,
    categoryId: form.categoryId || null,
    description: form.description.trim() || null,
    length: optionalNumber(form.length),
    width: optionalNumber(form.width),
    height: optionalNumber(form.height),
    weight: optionalNumber(form.weight),
    remarks: form.remarks.trim() || null,
    shelfLifeDays: stocked && form.trackLots ? optionalNumber(form.shelfLifeDays) : null,
    sellBeforeExpiryDays: stocked && form.trackExpiry ? optionalNumber(form.sellBeforeExpiryDays) : null,
    expiryNoticeDays: stocked && form.trackExpiry ? optionalNumber(form.expiryNoticeDays) : null,
    ...(form.itemType === "fixed_asset" ? { depreciationClassId: form.depreciationClassId } : {}),
  }
  if (!locked) {
    // Type and tracking are written once, on create (AC-2, AC-5).
    payload.itemType = form.itemType
    payload.trackLots = stocked && form.trackLots
    payload.trackSerials = stocked && form.trackSerials
    payload.trackExpiry = stocked && form.trackLots && form.trackExpiry
  }
  return payload
}

function duplicateMessage(error: unknown, fallback: string) {
  return error instanceof BlocksDataError && error.isDuplicate ? fallback : errorMessage(error)
}

export function ProductDialog({
  product,
  open,
  onOpenChange,
  onSaved,
  categoryOptions,
  defaultCategoryId,
  canEdit,
}: {
  product: Product | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  categoryOptions: Option[]
  defaultCategoryId: string
  canEdit: boolean
}) {
  const locked = Boolean(product)
  const [form, setForm] = React.useState<Form>(() => toForm(product, defaultCategoryId))
  const [touched, setTouched] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string>()
  const [barcodes, setBarcodes] = React.useState<ProductBarcode[]>([])
  const [queued, setQueued] = React.useState<string[]>([])
  const [barcodeInput, setBarcodeInput] = React.useState("")
  const [barcodeError, setBarcodeError] = React.useState<string>()

  React.useEffect(() => {
    if (!open) return
    setForm(toForm(product, defaultCategoryId))
    setTouched(false)
    setSaveError(undefined)
    setQueued([])
    setBarcodeInput("")
    setBarcodeError(undefined)
    setBarcodes([])
    if (product) {
      productBarcodes
        .list({ filter: { productId: product.ItemId }, pageSize: 50 })
        .then((result) => setBarcodes(result.items))
        .catch((caught) => setBarcodeError(errorMessage(caught)))
    }
  }, [open, product, defaultCategoryId])

  const errors = validate(form)
  const shown = touched ? errors : {}
  const stocked = form.itemType === "stocked"
  const fixedAsset = form.itemType === "fixed_asset"
  const classes = useResource(() => (open && fixedAsset ? listClasses() : Promise.resolve([])), [open, fixedAsset])
  const classOptions = (classes.data ?? [])
    .filter((item) => item.isActive !== false || item.ItemId === form.depreciationClassId)
    .map((item) => ({ value: item.ItemId, label: `${item.name} (${item.ratePercent}%)` }))
  const standardUomOptions = React.useMemo(() => withCurrentUom(STANDARD_UOM_OPTIONS, form.standardUom), [form.standardUom])
  const purchaseUomOptions = React.useMemo(() => withCurrentUom(PACKAGING_UOM_OPTIONS, form.purchaseUom), [form.purchaseUom])
  const salesUomOptions = React.useMemo(() => withCurrentUom(PACKAGING_UOM_OPTIONS, form.salesUom), [form.salesUom])
  const set = <K extends keyof Form>(key: K) => (value: Form[K]) => setForm({ ...form, [key]: value })

  const choosePurchaseUom = (value: string) => {
    setForm((current) => ({ ...current, purchaseUom: value, purchaseUomRatio: value ? current.purchaseUomRatio : "" }))
  }
  const chooseSalesUom = (value: string) => {
    setForm((current) => ({ ...current, salesUom: value, salesUomRatio: value ? current.salesUomRatio : "" }))
  }

  async function barcodeTaken(code: string) {
    const { items } = await productBarcodes.list({ filter: { barcode: code }, pageSize: 1 })
    return items.length > 0
  }

  async function addBarcode(code: string) {
    const value = normalizeBarcode(code)
    setBarcodeError(undefined)
    if (!value) return
    if (barcodes.some((item) => item.barcode === value) || queued.includes(value)) {
      setBarcodeError("This barcode is already on the product.")
      return
    }
    try {
      if (await barcodeTaken(value)) {
        setBarcodeError("This barcode belongs to another product.")
        return
      }
      if (product) {
        const itemId = await productBarcodes.create({ barcode: value, productId: product.ItemId })
        setBarcodes([...barcodes, { ItemId: itemId, barcode: value, productId: product.ItemId }])
        toast.success("Barcode added")
      } else {
        setQueued([...queued, value])
      }
      setBarcodeInput("")
    } catch (caught) {
      setBarcodeError(duplicateMessage(caught, "This barcode belongs to another product."))
    }
  }

  async function removeBarcode(item: ProductBarcode) {
    try {
      await productBarcodes.remove(item.ItemId)
      setBarcodes(barcodes.filter((barcode) => barcode.ItemId !== item.ItemId))
    } catch (caught) {
      setBarcodeError(errorMessage(caught))
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (Object.keys(errors).length) return
    setSaving(true)
    setSaveError(undefined)
    try {
      const payload = toPayload(form, locked)
      if (product) {
        await products.update(product.ItemId, payload)
      } else {
        const sku = form.sku.trim()
        const create = (value: string) =>
          products.create({ ...payload, sku: value, isActive: true } as Omit<Product, "ItemId">)
        // Empty SKU: number it from the "product" rule so the unique index holds (spec 0005).
        const productId = sku ? await create(sku) : (await withNextNumber("product", create)).result
        const failed: string[] = []
        for (const code of queued) {
          try {
            await productBarcodes.create({ barcode: code, productId })
          } catch {
            failed.push(code)
          }
        }
        if (failed.length) toast.error(`These barcodes were not added: ${failed.join(", ")}`)
      }
      toast.success("Product saved")
      onOpenChange(false)
      onSaved()
    } catch (caught) {
      setSaveError(duplicateMessage(caught, "A product with this name or SKU already exists."))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive() {
    if (!product) return
    const active = product.isActive !== false
    try {
      await products.update(product.ItemId, { isActive: !active })
      toast.success(active ? "Product deactivated" : "Product reactivated")
      onOpenChange(false)
      onSaved()
    } catch (caught) {
      setSaveError(errorMessage(caught))
    }
  }

  const lockNote = locked ? "Set when the product was created. It cannot change." : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? product.name : "New product"}</DialogTitle>
          <DialogDescription>Fields marked * are required.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-6">
          {saveError ? <ErrorBanner message={saveError} /> : null}
          <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField id="product-name" label="Name" required value={form.name} onChange={set("name")} error={shown.name} className="md:col-span-2" />
            <TextField
              id="product-sku"
              label="SKU"
              mono
              value={form.sku}
              onChange={set("sku")}
              disabled={locked}
              helper={locked ? "The SKU is fixed once saved." : "Leave empty to number it automatically."}
            />
            <SelectField
              id="product-type"
              label="Type"
              required
              options={[...ITEM_TYPES]}
              value={form.itemType}
              onChange={(value) => set("itemType")(value as ItemType)}
              disabled={locked || !canEdit}
              helper={lockNote}
            />
            <SelectField
              id="product-category"
              label="Category"
              allowNone
              options={categoryOptions}
              value={form.categoryId}
              onChange={set("categoryId")}
              disabled={!canEdit}
            />
            <SelectField
              id="product-uom"
              label="Standard unit"
              required
              options={standardUomOptions}
              value={form.standardUom}
              onChange={set("standardUom")}
              error={shown.standardUom}
              disabled={!canEdit}
              placeholder="Choose…"
              helper="How stock quantities are counted on hand and on orders."
            />
            {fixedAsset ? (
              <SelectField
                id="product-depreciation-class"
                label="Depreciation class"
                required
                options={classOptions}
                value={form.depreciationClassId}
                onChange={set("depreciationClassId")}
                error={shown.depreciationClassId}
                disabled={!canEdit}
                placeholder={classes.loading ? "Loading…" : classOptions.length ? "Choose…" : "Set the country in Company settings first"}
                helper="Each unit you receive or add becomes an asset in this class. You can change it per asset."
              />
            ) : null}
            <TextAreaField id="product-description" label="Description" value={form.description} onChange={set("description")} className="md:col-span-2" />
          </fieldset>

          <Separator />
          <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <legend className="mb-1 text-base font-semibold">Units</legend>
            <p className="col-span-full -mt-1 mb-1 text-xs text-muted-foreground">
              Inventory counts in the <strong className="font-medium text-foreground">standard unit</strong>. Purchase and sales units are optional
              names (case, roll) with a conversion — not dimensions like cm or kg.
            </p>
            <SelectField
              id="product-purchase-uom"
              label="Purchasing unit"
              allowNone
              options={purchaseUomOptions}
              value={form.purchaseUom}
              onChange={choosePurchaseUom}
              placeholder="None"
              helper="How vendors sell it (case, box). Leave none if you only buy in the standard unit."
            />
            <TextField
              id="product-purchase-ratio"
              label={form.purchaseUom.trim() ? `1 ${form.purchaseUom.trim()} =` : "Conversion"}
              suffix={form.standardUom.trim() || "standard"}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={form.purchaseUomRatio}
              onChange={set("purchaseUomRatio")}
              error={shown.purchaseUomRatio}
              disabled={!form.purchaseUom.trim()}
              helper={
                form.purchaseUom.trim()
                  ? `How many ${form.standardUom || "standard units"} you receive per one ${form.purchaseUom}. Example: 12 for a case of 12.`
                  : "Enter a purchasing unit first."
              }
            />
            <SelectField
              id="product-sales-uom"
              label="Sales unit"
              allowNone
              options={salesUomOptions}
              value={form.salesUom}
              onChange={chooseSalesUom}
              placeholder="None"
              helper="How customers can order it (pack). Leave none to sell only in the standard unit."
            />
            <TextField
              id="product-sales-ratio"
              label={form.salesUom.trim() ? `1 ${form.salesUom.trim()} =` : "Conversion"}
              suffix={form.standardUom.trim() || "standard"}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={form.salesUomRatio}
              onChange={set("salesUomRatio")}
              error={shown.salesUomRatio}
              disabled={!form.salesUom.trim()}
              helper={
                form.salesUom.trim()
                  ? `How many ${form.standardUom || "standard units"} are in one ${form.salesUom}. Example: 50 for a pack of 50.`
                  : "Enter a sales unit first."
              }
            />
          </fieldset>

          {stocked ? (
            <>
              <Separator />
              <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <legend className="mb-2 flex items-center gap-2 text-base font-semibold">
                  Tracking {locked ? <Lock className="size-4 text-muted-foreground" aria-label="Locked" /> : null}
                </legend>
                <CheckboxField id="product-lots" label="Track lots" checked={form.trackLots} onChange={(value) => setForm({ ...form, trackLots: value, trackExpiry: value && form.trackExpiry })} disabled={locked} helper={lockNote} />
                <CheckboxField id="product-serials" label="Track serial numbers" checked={form.trackSerials} onChange={set("trackSerials")} disabled={locked} />
                <CheckboxField
                  id="product-expiry"
                  label="Track expiry dates"
                  checked={form.trackExpiry}
                  onChange={set("trackExpiry")}
                  disabled={locked || !form.trackLots}
                  helper={form.trackLots ? undefined : "Needs lot tracking."}
                />
                {form.trackLots ? (
                  <TextField id="product-shelf-life" label="Shelf life (days)" type="number" inputMode="numeric" value={form.shelfLifeDays} onChange={set("shelfLifeDays")} error={shown.shelfLifeDays} />
                ) : null}
                {form.trackExpiry ? (
                  <>
                    <TextField id="product-sell-before" label="Stop selling (days before expiry)" type="number" inputMode="numeric" value={form.sellBeforeExpiryDays} onChange={set("sellBeforeExpiryDays")} error={shown.sellBeforeExpiryDays} />
                    <TextField id="product-expiry-notice" label="Warn (days before expiry)" type="number" inputMode="numeric" value={form.expiryNoticeDays} onChange={set("expiryNoticeDays")} error={shown.expiryNoticeDays} />
                  </>
                ) : null}
              </fieldset>
            </>
          ) : null}

          <Separator />
          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">Barcodes</h3>
            {barcodeError ? <ErrorBanner message={barcodeError} /> : null}
            <ul className="flex flex-wrap gap-2" aria-label="Barcodes">
              {[...barcodes.map((item) => ({ code: item.barcode, item })), ...queued.map((code) => ({ code, item: undefined }))].map(({ code, item }) => (
                <li key={code} className="flex h-8 items-center gap-1 rounded-full bg-secondary pr-1 pl-3 font-mono text-[13px]">
                  <Barcode className="size-4 text-muted-foreground" aria-hidden />
                  {code}
                  {canEdit ? (
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Remove barcode ${code}`}
                      onClick={() => (item ? void removeBarcode(item) : setQueued(queued.filter((value) => value !== code)))}
                    >
                      <X />
                    </Button>
                  ) : null}
                </li>
              ))}
              {barcodes.length + queued.length === 0 ? <li className="text-xs text-muted-foreground">No barcodes yet.</li> : null}
            </ul>
            {canEdit ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  aria-label="New barcode"
                  placeholder="Scan or type a barcode"
                  className="font-mono"
                  inputMode="numeric"
                  value={barcodeInput}
                  onChange={(event) => setBarcodeInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void addBarcode(barcodeInput)
                    }
                  }}
                />
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => void addBarcode(barcodeInput)}>
                    <Plus aria-hidden /> Add
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => void addBarcode(generateEan13())}>
                    <Sparkles aria-hidden /> Generate
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {product ? (
            <>
              <Separator />
              <ProductVendors product={product} canEdit={canEdit} />
            </>
          ) : null}

          <Separator />
          <fieldset disabled={!canEdit} className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <legend className="mb-1 text-base font-semibold">Size and weight</legend>
            <p className="col-span-full -mt-1 mb-1 text-xs text-muted-foreground">
              Outer dimensions in <strong className="font-medium text-foreground">{PRODUCT_DIMENSION_UNIT}</strong> and weight in{" "}
              <strong className="font-medium text-foreground">{PRODUCT_WEIGHT_UNIT}</strong>. Values are stored in these units everywhere (not meters or
              pounds).
            </p>
            <TextField
              id="product-length"
              label="Length"
              suffix={PRODUCT_DIMENSION_UNIT}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={form.length}
              onChange={set("length")}
              error={shown.length}
            />
            <TextField
              id="product-width"
              label="Width"
              suffix={PRODUCT_DIMENSION_UNIT}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={form.width}
              onChange={set("width")}
              error={shown.width}
            />
            <TextField
              id="product-height"
              label="Height"
              suffix={PRODUCT_DIMENSION_UNIT}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={form.height}
              onChange={set("height")}
              error={shown.height}
            />
            <TextField
              id="product-weight"
              label="Weight"
              suffix={PRODUCT_WEIGHT_UNIT}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={form.weight}
              onChange={set("weight")}
              error={shown.weight}
            />
            <TextAreaField id="product-remarks" label="Remarks" value={form.remarks} onChange={set("remarks")} className="col-span-2 md:col-span-4" />
          </fieldset>

          {product ? <AuditLine record={product} /> : null}

          <DialogFooter className="gap-2">
            {product && canEdit ? (
              <Button type="button" variant="secondary" className="sm:mr-auto" onClick={() => void toggleActive()}>
                {product.isActive === false ? "Reactivate" : "Deactivate"}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {canEdit ? "Cancel" : "Close"}
            </Button>
            {canEdit ? (
              <Button type="submit" disabled={saving} className="min-w-24">
                {saving ? "Saving…" : "Save"}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
