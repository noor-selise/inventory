import * as React from "react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { AuditLine } from "@/components/app/audit"
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/app/form"
import { ErrorBanner } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { errorMessage } from "@/hooks/use-resource"
import { BlocksDataError } from "@/lib/blocks/data"
import { formatMoney } from "@/lib/format"
import { CUSTOMER_EDITORS } from "@/features/team/roles"
import { customers, type Address, type Contact, type Customer } from "./api"
import { AddressFields, ContactsEditor, EMAIL_PATTERN, cleanAddress, cleanContacts } from "./fields"
import { PartnerList } from "./PartnerList"
import { usePartnerLookups } from "./useLookups"

// Customers with their order defaults (spec 0010 AC-1).


export function CustomersPage() {
  const { hasRole, profile, user } = useCurrentUser()
  const canEdit = hasRole(...CUSTOMER_EDITORS)
  // A rep limited to their own customers sees only those (spec 0011 AC-8, spec 0027).
  const scope = profile?.ownCustomersOnly ? { salesRepUserId: String(user?.itemId ?? "none") } : undefined
  return (
    <PartnerList<Customer>
      title="Customers"
      description="The people and companies you sell to, with the price list, terms and tax their orders start with."
      noun="Customer"
      source={customers}
      scope={scope}
      canEdit={canEdit}
      columns={[
        { label: "City", className: "hidden md:table-cell", render: (row) => row.billingAddress?.city },
        { label: "Currency", render: (row) => <span className="font-mono">{row.currencyCode}</span> },
        {
          label: "Credit limit",
          className: "hidden lg:table-cell text-right num",
          render: (row) => (row.creditLimit ? formatMoney(row.creditLimit, row.currencyCode ?? "USD") : ""),
        },
      ]}
      renderDialog={(props) => <CustomerDialog {...props} canEdit={canEdit} />}
    />
  )
}

type Form = {
  name: string
  email: string
  phone: string
  contacts: Contact[]
  billing: Address
  shipping: Address
  sameAddress: boolean
  pricingSchemeId: string
  taxingSchemeId: string
  paymentTermId: string
  currencyCode: string
  defaultDiscountPct: string
  salesRepUserId: string
  creditLimit: string
  remarks: string
}

function toForm(record?: Customer): Form {
  const billing = record?.billingAddress ?? {}
  const shipping = record?.shippingAddress ?? {}
  return {
    name: record?.name ?? "",
    email: record?.email ?? "",
    phone: record?.phone ?? "",
    contacts: record?.contacts ?? [],
    billing,
    shipping,
    sameAddress: !record || JSON.stringify(billing) === JSON.stringify(shipping),
    pricingSchemeId: record?.pricingSchemeId ?? "",
    taxingSchemeId: record?.taxingSchemeId ?? "",
    paymentTermId: record?.paymentTermId ?? "",
    currencyCode: record?.currencyCode ?? "",
    defaultDiscountPct: record?.defaultDiscountPct == null ? "" : String(record.defaultDiscountPct),
    salesRepUserId: record?.salesRepUserId ?? "",
    creditLimit: !record?.creditLimit ? "" : String(record.creditLimit),
    remarks: record?.remarks ?? "",
  }
}

function CustomerDialog({
  record,
  open,
  onOpenChange,
  onSaved,
  canEdit,
}: {
  record: Customer | undefined
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
    const next = toForm(record)
    // New customers start from the company defaults.
    if (!record && lookups.data) {
      next.pricingSchemeId = lookups.data.defaultSchemeId
      next.taxingSchemeId = lookups.data.defaultTaxId
    }
    setForm(next)
    setTouched(false)
    setSaveError(undefined)
  }, [open, record, lookups.data])

  const set = <K extends keyof Form>(key: K) => (value: Form[K]) => setForm({ ...form, [key]: value })
  const errors = {
    name: form.name.trim() ? undefined : "Name is required.",
    email: form.email.trim() && !EMAIL_PATTERN.test(form.email.trim()) ? "Enter a valid email address." : undefined,
    defaultDiscountPct:
      form.defaultDiscountPct && !(Number(form.defaultDiscountPct) >= 0 && Number(form.defaultDiscountPct) <= 100) ? "Between 0 and 100." : undefined,
    creditLimit: form.creditLimit && !(Number(form.creditLimit) >= 0) ? "Must be 0 or more." : undefined,
  }
  const shown: Partial<typeof errors> = touched ? errors : {}

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (Object.values(errors).some(Boolean)) return
    setSaving(true)
    setSaveError(undefined)
    const billing = cleanAddress(form.billing)
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      contacts: cleanContacts(form.contacts),
      billingAddress: billing,
      shippingAddress: form.sameAddress ? billing : cleanAddress(form.shipping),
      pricingSchemeId: form.pricingSchemeId || null,
      taxingSchemeId: form.taxingSchemeId || null,
      paymentTermId: form.paymentTermId || null,
      currencyCode: form.currencyCode || null,
      defaultDiscountPct: form.defaultDiscountPct === "" ? null : Number(form.defaultDiscountPct),
      salesRepUserId: form.salesRepUserId || null,
      // 0 means no limit: Blocks ignores null in an update, so an emptied limit could never clear.
      creditLimit: form.creditLimit === "" ? 0 : Number(form.creditLimit),
      remarks: form.remarks.trim() || null,
    }
    try {
      if (record) await customers.update(record.ItemId, payload)
      else await customers.create({ ...payload, isActive: true })
      toast.success("Customer saved")
      onOpenChange(false)
      onSaved()
    } catch (caught) {
      setSaveError(caught instanceof BlocksDataError && caught.isDuplicate ? "A customer with this name already exists." : errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive() {
    if (!record) return
    try {
      await customers.update(record.ItemId, { isActive: record.isActive === false })
      toast.success(record.isActive === false ? "Customer reactivated" : "Customer deactivated")
      onOpenChange(false)
      onSaved()
    } catch (caught) {
      setSaveError(errorMessage(caught))
    }
  }

  const options = lookups.data
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record ? record.name : "New customer"}</DialogTitle>
          <DialogDescription>Fields marked * are required. Defaults fill in new orders for this customer.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-6">
          {saveError ? <ErrorBanner message={saveError} /> : null}
          {lookups.error ? <ErrorBanner message={lookups.error} /> : null}
          <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField id="customer-name" label="Name" required value={form.name} onChange={set("name")} error={shown.name} autoComplete="organization" className="sm:col-span-2" />
            <TextField id="customer-email" label="Email" type="email" inputMode="email" value={form.email} onChange={set("email")} error={shown.email} />
            <TextField id="customer-phone" label="Phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} />
          </fieldset>
          <Separator />
          <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-base font-semibold">Order defaults</legend>
            <SelectField id="customer-scheme" label="Pricing scheme" allowNone options={options?.schemes ?? []} value={form.pricingSchemeId} onChange={set("pricingSchemeId")} disabled={!canEdit} helper="Empty uses the default price list." />
            <SelectField id="customer-tax" label="Taxing scheme" allowNone options={options?.taxes ?? []} value={form.taxingSchemeId} onChange={set("taxingSchemeId")} disabled={!canEdit} />
            <SelectField id="customer-terms" label="Payment terms" allowNone options={options?.terms ?? []} value={form.paymentTermId} onChange={set("paymentTermId")} disabled={!canEdit} />
            <SelectField id="customer-currency" label="Currency" allowNone options={options?.currencies ?? []} value={form.currencyCode} onChange={set("currencyCode")} disabled={!canEdit} />
            <TextField id="customer-discount" label="Default discount (%)" type="number" inputMode="decimal" step="any" value={form.defaultDiscountPct} onChange={set("defaultDiscountPct")} error={shown.defaultDiscountPct} />
            <TextField id="customer-credit" label="Credit limit" type="number" inputMode="decimal" step="any" value={form.creditLimit} onChange={set("creditLimit")} error={shown.creditLimit} helper="Empty means no limit." />
            <SelectField id="customer-rep" label="Sales rep" allowNone options={options?.reps ?? []} value={form.salesRepUserId} onChange={set("salesRepUserId")} disabled={!canEdit} className="sm:col-span-2" />
          </fieldset>
          <Separator />
          <AddressFields idPrefix="customer-billing" legend="Billing address" value={form.billing} onChange={set("billing")} disabled={!canEdit} />
          <CheckboxField id="customer-same-address" label="Ship to the billing address" checked={form.sameAddress} onChange={set("sameAddress")} disabled={!canEdit} />
          {!form.sameAddress ? (
            <AddressFields idPrefix="customer-shipping" legend="Shipping address" value={form.shipping} onChange={set("shipping")} disabled={!canEdit} />
          ) : null}
          <Separator />
          <ContactsEditor value={form.contacts} onChange={set("contacts")} disabled={!canEdit} />
          <TextAreaField id="customer-remarks" label="Remarks" value={form.remarks} onChange={set("remarks")} />
          {record ? <AuditLine record={record} /> : null}
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
