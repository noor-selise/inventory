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

// Who may edit what in the screens built so far (UI gating only).
export const SETTINGS_EDITORS: RoleSlug[] = ["admin"]
export const PRODUCT_EDITORS: RoleSlug[] = ["admin", "manager", "purchasing"]

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
