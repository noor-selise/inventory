import type { RoleSlug } from "./roles"

// Which roles may open each screen. The sidebar and the router both read this
// map, so a role never sees a link it cannot open, and a typed URL is blocked
// the same way. Admins open everything. Plain data with no app imports, so
// `node scripts/checks/screen-access.mjs` can test it. UI only: the Blocks
// server does not enforce roles yet (spec 0003).

const EVERYONE = "everyone"
type Access = RoleSlug[] | typeof EVERYONE

export const SCREEN_ACCESS: Record<string, Access> = {
  "/": EVERYONE,
  "/reports": EVERYONE,
  "/settings/security": EVERYONE,
  "/settings/appearance": EVERYONE,

  "/sales/orders": ["manager", "sales", "warehouse", "readonly"],
  "/customers": ["manager", "sales", "readonly"],
  "/price-lists": ["manager", "sales", "readonly"],
  "/payments": ["manager", "sales", "purchasing", "readonly"],

  "/purchasing/orders": ["manager", "purchasing", "warehouse", "readonly"],
  "/vendors": ["manager", "purchasing", "readonly"],

  "/products": ["manager", "sales", "purchasing", "warehouse", "production", "readonly"],
  "/stock": ["manager", "sales", "purchasing", "warehouse", "production", "readonly"],
  "/categories": ["manager", "purchasing", "readonly"],
  "/stock/adjustments": ["manager", "warehouse", "readonly"],
  "/stock/transfers": ["manager", "warehouse", "readonly"],
  "/stock/counts": ["manager", "warehouse", "readonly"],
  "/stock/lots": ["manager", "purchasing", "warehouse", "readonly"],
  "/stock/reorder": ["manager", "purchasing", "readonly"],
  "/locations": ["manager", "warehouse", "readonly"],
  "/assets": ["manager", "purchasing", "readonly"],
  "/assets/close": ["manager", "readonly"],

  "/settings/company": [],
  "/settings/currencies": [],
  "/settings/numbering": [],
  "/settings/depreciation": [],
  "/settings/lists": [],
  "/settings/team": [],
}

/** True when someone with these roles may open `path`. Unknown paths are blocked for everyone but admins. */
export function canOpen(path: string, roles: readonly string[], isAdmin: boolean) {
  if (isAdmin) return true
  const access = SCREEN_ACCESS[path.replace(/\/+$/, "") || "/"]
  if (!access) return false
  return access === EVERYONE || access.some((role) => roles.includes(role))
}
