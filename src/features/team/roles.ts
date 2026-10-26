// The seven ready made role bundles from spec 0003 (AC-4). The slugs must match
// the roles created in Blocks by scripts/blocks-setup.sh.
export const ADMIN_ROLE = "admin"

export const ROLE_BUNDLES = [
  { slug: "admin", name: "Admin", description: "Full access, manages the team and settings" },
  { slug: "manager", name: "Manager", description: "Everything except team and plan settings" },
  { slug: "sales", name: "Sales", description: "Customers, quotes and sales orders" },
  { slug: "purchasing", name: "Purchasing", description: "Vendors and purchase orders" },
  { slug: "warehouse", name: "Warehouse", description: "Picking, receiving, counts and transfers" },
  { slug: "production", name: "Production", description: "Manufacture orders and timesheets" },
  { slug: "readonly", name: "Read only", description: "Can view, cannot change anything" },
] as const

export type RoleSlug = (typeof ROLE_BUNDLES)[number]["slug"]

// Who may do what: the role matrix of spec 0003, kept in this one module.
// UI gating only; the server does not enforce these yet (spec 0003 exit gate).
export const SETTINGS_EDITORS: RoleSlug[] = ["admin"]
export const PRODUCT_EDITORS: RoleSlug[] = ["admin", "manager", "purchasing"]
export const PRICE_EDITORS: RoleSlug[] = ["admin", "manager"]
export const CUSTOMER_EDITORS: RoleSlug[] = ["admin", "manager", "sales"]
export const VENDOR_EDITORS: RoleSlug[] = ["admin", "manager", "purchasing"]
export const SALES_EDITORS: RoleSlug[] = ["admin", "manager", "sales"]
/** Roles holding the Confirm right for sales orders (spec 0027). */
export const CONFIRMERS: RoleSlug[] = ["admin", "manager"]
export const FULFILLERS: RoleSlug[] = ["admin", "manager", "sales", "warehouse"]
export const PURCHASE_EDITORS: RoleSlug[] = ["admin", "manager", "purchasing"]
export const RECEIVERS: RoleSlug[] = ["admin", "manager", "purchasing", "warehouse"]
export const STOCK_EDITORS: RoleSlug[] = ["admin", "manager", "warehouse"]
/** Count review; also stands in for the "override negative stock" right (spec 0026). */
export const STOCK_REVIEWERS: RoleSlug[] = ["admin", "manager"]
export const PAYMENT_EDITORS: RoleSlug[] = ["admin", "manager", "sales", "purchasing"]
/** Stands in for the Cost View right until field masking exists (spec 0003 step 5c). */
export const COST_VIEWERS: RoleSlug[] = ["admin", "manager", "purchasing"]
/** Who receives low stock alert emails (spec 0014). */
export const ALERT_ROLES: RoleSlug[] = ["purchasing"]

export function roleName(slug: string): string {
  return ROLE_BUNDLES.find((role) => role.slug === slug)?.name ?? slug
}

// IAM returns roles as a plain list on some endpoints and grouped by
// organization ({ default: [...] }) on others, like the user list.
export function roleSlugs(roles: unknown): string[] {
  if (Array.isArray(roles)) return roles.filter((role): role is string => typeof role === "string")
  if (roles && typeof roles === "object") {
    return Object.values(roles).flatMap((group) => roleSlugs(group))
  }
  return []
}
