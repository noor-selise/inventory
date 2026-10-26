// Checks the role to screen map that drives the sidebar and the router.
//   node scripts/checks/screen-access.mjs
import assert from "node:assert/strict"
import { canOpen, SCREEN_ACCESS } from "../../src/features/team/screen-access.ts"

const check = (name, fn) => {
  fn()
  console.log(`ok  ${name}`)
}
const screens = Object.keys(SCREEN_ACCESS)
const visible = (role) => screens.filter((path) => canOpen(path, [role], false)).sort()
const shared = ["/", "/reports", "/settings/appearance", "/settings/security"]

check("admins open every screen, including unknown ones", () => {
  assert.ok(screens.every((path) => canOpen(path, [], true)))
  assert.ok(canOpen("/something-new", [], true))
})

check("unknown paths and unknown roles are blocked", () => {
  assert.equal(canOpen("/something-new", ["manager"], false), false)
  assert.deepEqual(visible("nobody"), shared)
})

check("settings screens other than security and appearance are admin only", () => {
  for (const role of ["manager", "sales", "purchasing", "warehouse", "production", "readonly"]) {
    for (const path of ["/settings/company", "/settings/team", "/settings/depreciation", "/settings/lists"]) assert.equal(canOpen(path, [role], false), false, `${role} ${path}`)
  }
})

check("sales sees selling screens, not buying or stock moves", () => {
  assert.deepEqual(visible("sales"), [...shared, "/customers", "/payments", "/price-lists", "/products", "/sales/orders", "/stock"].sort())
})

check("warehouse sees picking, receiving and stock screens", () => {
  assert.deepEqual(
    visible("warehouse"),
    [...shared, "/locations", "/products", "/purchasing/orders", "/sales/orders", "/stock", "/stock/adjustments", "/stock/counts", "/stock/lots", "/stock/transfers"].sort()
  )
})

check("purchasing sees buying screens and fixed assets", () => {
  assert.deepEqual(
    visible("purchasing"),
    [...shared, "/assets", "/categories", "/payments", "/products", "/purchasing/orders", "/stock", "/stock/lots", "/stock/reorder", "/vendors"].sort()
  )
})

check("production sees products and stock only", () => {
  assert.deepEqual(visible("production"), [...shared, "/products", "/stock"].sort())
})

check("read only sees every business screen but no admin settings", () => {
  const admin = ["/settings/company", "/settings/currencies", "/settings/depreciation", "/settings/lists", "/settings/numbering", "/settings/team"]
  assert.deepEqual(visible("readonly"), screens.filter((path) => !admin.includes(path)).sort())
})

check("several roles add up", () => {
  assert.equal(canOpen("/vendors", ["sales", "purchasing"], false), true)
  assert.equal(canOpen("/settings/team", ["sales", "purchasing"], false), false)
})

check("a trailing slash matches the same screen", () => {
  assert.equal(canOpen("/customers/", ["sales"], false), true)
})
