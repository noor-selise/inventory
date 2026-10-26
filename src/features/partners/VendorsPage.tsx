import * as React from "react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { AuditLine } from "@/components/app/audit"
import { SelectField, TextAreaField, TextField } from "@/components/app/form"
import { ErrorBanner } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { products, vendorItems } from "@/features/products/api"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { BlocksDataError } from "@/lib/blocks/data"
import { formatMoney } from "@/lib/format"
import { VENDOR_EDITORS } from "@/features/team/roles"
import { vendors, type Address, type Contact, type Vendor } from "./api"
import { AddressFields, ContactsEditor, EMAIL_PATTERN, cleanAddress, cleanContacts } from "./fields"
import { PartnerList } from "./PartnerList"
import { usePartnerLookups } from "./useLookups"

// Vendors with their defaults (spec 0010 AC-2) and the products they supply (spec 0005 AC-8).


export function VendorsPage() {
  const canEdit = useCurrentUser().hasRole(...VENDOR_EDITORS)
  return (
    <PartnerList<Vendor>
      title="Vendors"
      description="The suppliers you buy from, with their currency, terms and lead time."
      noun="Vendor"
      source={vendors}
      canEdit={canEdit}
      columns={[
        { label: "City", className: "hidden md:table-cell", render: (row) => row.address?.city },
        { label: "Currency", render: (row) => <span className="font-mono">{row.currencyCode}</span> },
        { label: "Lead time", className: "hidden lg:table-cell text-right num", render: (row) => (row.leadTimeDays != null ? `${row.leadTimeDays} days` : "") },
      ]}
      renderDialog={(props) => <VendorDialog {...props} canEdit={canEdit} />}
    />
  )
}

type Form = {
  name: string
  email: string
  phone: string
  contacts: Contact[]
  address: Address
  currencyCode: string
  paymentTermId: string
  leadTimeDays: string
  remarks: string
}

function toForm(record?: Vendor): Form {
  return {
    name: record?.name ?? "",
    email: record?.email ?? "",
    phone: record?.phone ?? "",
    contacts: record?.contacts ?? [],
    address: record?.address ?? {},
    currencyCode: record?.currencyCode ?? "",
    paymentTermId: record?.paymentTermId ?? "",
    leadTimeDays: record?.leadTimeDays == null ? "" : String(record.leadTimeDays),
    remarks: record?.remarks ?? "",
  }
}

function SuppliedProducts({ vendor }: { vendor: Vendor }) {
  const { data } = useResource(async () => {
    const { items } = await vendorItems.list({ filter: { vendorId: vendor.ItemId }, pageSize: 200 })
    if (!items.length) return []
    const { items: productRows } = await products.list({ filter: { ItemId: { $in: items.map((item) => item.productId) } }, pageSize: 200 })
    return items.map((item) => ({ item, product: productRows.find((product) => product.ItemId === item.productId) }))
  }, [vendor.ItemId])
  if (!data?.length) return <p className="text-xs text-muted-foreground">No products linked yet. Link them from a product's Vendors section.</p>
  return (
    <ul className="flex flex-col divide-y rounded-lg bg-muted text-sm">
      {data.map(({ item, product }) => (
        <li key={item.ItemId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span>
            {product?.name ?? "Unknown product"} <span className="font-mono text-xs text-muted-foreground">{item.vendorItemCode}</span>
          </span>
          <span className="num text-muted-foreground">
            {item.unitCost != null ? formatMoney(item.unitCost, item.currencyCode ?? vendor.currencyCode ?? "USD") : ""}
            {item.leadTimeDays != null ? ` · ${item.leadTimeDays} days` : ""}
          </span>
        </li>
      ))}
    </ul>
  )
}

function VendorDialog({
  record,
  open,
  onOpenChange,
  onSaved,
  canEdit,
}: {
  record: Vendor | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  canEdit: boolean
}) {
  const lookups = usePartnerLookups()
  const [form, setForm] = React.useState<Form>(toForm())
  const [touched, setTouched] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string>()

  React.useEffect(() => {
    if (!open) return
    setForm(toForm(record))
    setTouched(false)
    setSaveError(undefined)
  }, [open, record])

  const set = <K extends keyof Form>(key: K) => (value: Form[K]) => setForm({ ...form, [key]: value })
  const errors = {
    name: form.name.trim() ? undefined : "Name is required.",
    email: form.email.trim() && !EMAIL_PATTERN.test(form.email.trim()) ? "Enter a valid email address." : undefined,
    leadTimeDays:
      form.leadTimeDays && !(Number.isInteger(Number(form.leadTimeDays)) && Number(form.leadTimeDays) >= 0) ? "Must be a whole number of days." : undefined,
  }
  const shown: Partial<typeof errors> = touched ? errors : {}

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (Object.values(errors).some(Boolean)) return
    setSaving(true)
    setSaveError(undefined)
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      contacts: cleanContacts(form.contacts),
      address: cleanAddress(form.address),
      currencyCode: form.currencyCode || null,
      paymentTermId: form.paymentTermId || null,
      leadTimeDays: form.leadTimeDays === "" ? null : Number(form.leadTimeDays),
      remarks: form.remarks.trim() || null,
    }
    try {
      if (record) await vendors.update(record.ItemId, payload)
      else await vendors.create({ ...payload, isActive: true })
      toast.success("Vendor saved")
      onOpenChange(false)
      onSaved()
    } catch (caught) {
      setSaveError(caught instanceof BlocksDataError && caught.isDuplicate ? "A vendor with this name already exists." : errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive() {
    if (!record) return
    try {
      await vendors.update(record.ItemId, { isActive: record.isActive === false })
      toast.success(record.isActive === false ? "Vendor reactivated" : "Vendor deactivated")
      onOpenChange(false)
      onSaved()
    } catch (caught) {
      setSaveError(errorMessage(caught))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record ? record.name : "New vendor"}</DialogTitle>
          <DialogDescription>Fields marked * are required.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-6">
          {saveError ? <ErrorBanner message={saveError} /> : null}
          <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField id="vendor-name" label="Name" required value={form.name} onChange={set("name")} error={shown.name} autoComplete="organization" className="sm:col-span-2" />
            <TextField id="vendor-email" label="Email" type="email" inputMode="email" value={form.email} onChange={set("email")} error={shown.email} />
            <TextField id="vendor-phone" label="Phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} />
            <SelectField id="vendor-currency" label="Currency" allowNone options={lookups.data?.currencies ?? []} value={form.currencyCode} onChange={set("currencyCode")} disabled={!canEdit} />
            <SelectField id="vendor-terms" label="Payment terms" allowNone options={lookups.data?.terms ?? []} value={form.paymentTermId} onChange={set("paymentTermId")} disabled={!canEdit} />
            <TextField id="vendor-lead" label="Lead time (days)" type="number" inputMode="numeric" value={form.leadTimeDays} onChange={set("leadTimeDays")} error={shown.leadTimeDays} />
          </fieldset>
          <Separator />
          <AddressFields idPrefix="vendor-address" legend="Address" value={form.address} onChange={set("address")} disabled={!canEdit} />
          <Separator />
          <ContactsEditor value={form.contacts} onChange={set("contacts")} disabled={!canEdit} />
          <TextAreaField id="vendor-remarks" label="Remarks" value={form.remarks} onChange={set("remarks")} />
          {record ? (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <h3 className="text-base font-semibold">Products supplied</h3>
                <SuppliedProducts vendor={record} />
              </div>
              <AuditLine record={record} />
            </>
          ) : null}
          <DialogFooter className="gap-2">
            {record && canEdit ? (
              <Button type="button" variant="secondary" className="sm:mr-auto" onClick={() => void toggleActive()}>
                {record.isActive === false ? "Reactivate" : "Deactivate"}
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
