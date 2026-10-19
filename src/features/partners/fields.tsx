import { Plus, Trash2 } from "lucide-react"

import { TextField } from "@/components/app/form"
import { Button } from "@/components/ui/button"
import type { Address, Contact } from "./api"

// Address and contact editors shared by customers and vendors.

export function AddressFields({
  idPrefix,
  legend,
  value,
  onChange,
  disabled,
}: {
  idPrefix: string
  legend: string
  value: Address
  onChange: (value: Address) => void
  disabled?: boolean
}) {
  const set = (key: keyof Address) => (next: string) => onChange({ ...value, [key]: next })
  return (
    <fieldset disabled={disabled} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <legend className="mb-2 text-base font-semibold">{legend}</legend>
      <TextField id={`${idPrefix}-line1`} label="Street" autoComplete="address-line1" value={value.line1 ?? ""} onChange={set("line1")} className="sm:col-span-2" />
      <TextField id={`${idPrefix}-line2`} label="More address" autoComplete="address-line2" value={value.line2 ?? ""} onChange={set("line2")} className="sm:col-span-2" />
      <TextField id={`${idPrefix}-city`} label="City" autoComplete="address-level2" value={value.city ?? ""} onChange={set("city")} />
      <TextField id={`${idPrefix}-region`} label="State or region" autoComplete="address-level1" value={value.region ?? ""} onChange={set("region")} />
      <TextField id={`${idPrefix}-postal`} label="Postal code" autoComplete="postal-code" value={value.postalCode ?? ""} onChange={set("postalCode")} />
      <TextField id={`${idPrefix}-country`} label="Country" autoComplete="country-name" value={value.country ?? ""} onChange={set("country")} />
    </fieldset>
  )
}

export function ContactsEditor({
  value,
  onChange,
  disabled,
}: {
  value: Contact[]
  onChange: (value: Contact[]) => void
  disabled?: boolean
}) {
  const update = (index: number, key: keyof Contact, next: string) =>
    onChange(value.map((contact, at) => (at === index ? { ...contact, [key]: next } : contact)))
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3">
      <legend className="mb-2 text-base font-semibold">Contacts</legend>
      {value.length === 0 ? <p className="text-xs text-muted-foreground">No contacts yet.</p> : null}
      {value.map((contact, index) => (
        <div key={index} className="grid grid-cols-1 items-end gap-3 rounded-lg bg-muted p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <TextField id={`contact-${index}-name`} label="Name" value={contact.name ?? ""} onChange={(next) => update(index, "name", next)} />
          <TextField id={`contact-${index}-email`} label="Email" type="email" inputMode="email" value={contact.email ?? ""} onChange={(next) => update(index, "email", next)} />
          <TextField id={`contact-${index}-phone`} label="Phone" type="tel" inputMode="tel" value={contact.phone ?? ""} onChange={(next) => update(index, "phone", next)} />
          <Button type="button" size="icon" variant="ghost" aria-label={`Remove contact ${contact.name || index + 1}`} onClick={() => onChange(value.filter((_, at) => at !== index))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...value, { name: "", email: "", phone: "", role: "" }])}>
          <Plus aria-hidden /> Add contact
        </Button>
      </div>
    </fieldset>
  )
}

/** Drops empty contacts and blank address parts before saving. */
export function cleanContacts(contacts: Contact[]): Contact[] {
  return contacts
    .map((contact) => ({
      name: contact.name?.trim() || null,
      email: contact.email?.trim() || null,
      phone: contact.phone?.trim() || null,
      role: contact.role?.trim() || null,
    }))
    .filter((contact) => contact.name || contact.email || contact.phone)
}

export function cleanAddress(address: Address): Address | null {
  const cleaned: Address = {
    line1: address.line1?.trim() || null,
    line2: address.line2?.trim() || null,
    city: address.city?.trim() || null,
    region: address.region?.trim() || null,
    postalCode: address.postalCode?.trim() || null,
    country: address.country?.trim() || null,
  }
  return Object.values(cleaned).some(Boolean) ? cleaned : null
}

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
