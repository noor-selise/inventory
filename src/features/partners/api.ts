import { collection, type Entity } from "@/lib/blocks/data"

// Customer and Vendor from spec 0010. Contacts and addresses are stored inside
// the record (Dto types Contact and Address).

export type Address = {
  line1?: string | null
  line2?: string | null
  city?: string | null
  region?: string | null
  postalCode?: string | null
  country?: string | null
}

export type Contact = {
  name?: string | null
  email?: string | null
  phone?: string | null
  role?: string | null
}

export type Customer = Entity & {
  name: string
  email?: string | null
  phone?: string | null
  contacts?: Contact[] | null
  billingAddress?: Address | null
  shippingAddress?: Address | null
  pricingSchemeId?: string | null
  taxingSchemeId?: string | null
  paymentTermId?: string | null
  currencyCode?: string | null
  defaultDiscountPct?: number | null
  salesRepUserId?: string | null
  creditLimit?: number | null
  remarks?: string | null
  isActive?: boolean | null
}

export type Vendor = Entity & {
  name: string
  email?: string | null
  phone?: string | null
  contacts?: Contact[] | null
  address?: Address | null
  currencyCode?: string | null
  paymentTermId?: string | null
  leadTimeDays?: number | null
  remarks?: string | null
  isActive?: boolean | null
}

const ADDRESS = "{ line1 line2 city region postalCode country }"
const CONTACT = "contacts { name email phone role }"

export const customers = collection<Customer>("Customer", [
  "name",
  "email",
  "phone",
  CONTACT,
  `billingAddress ${ADDRESS}`,
  `shippingAddress ${ADDRESS}`,
  "pricingSchemeId",
  "taxingSchemeId",
  "paymentTermId",
  "currencyCode",
  "defaultDiscountPct",
  "salesRepUserId",
  "creditLimit",
  "remarks",
  "isActive",
])

export const vendors = collection<Vendor>("Vendor", [
  "name",
  "email",
  "phone",
  CONTACT,
  `address ${ADDRESS}`,
  "currencyCode",
  "paymentTermId",
  "leadTimeDays",
  "remarks",
  "isActive",
])

export function formatAddress(address?: Address | null): string {
  if (!address) return ""
  return [address.line1, address.line2, [address.postalCode, address.city].filter(Boolean).join(" "), address.region, address.country]
    .filter((part) => part && String(part).trim())
    .join(", ")
}
