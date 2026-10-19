import type * as React from "react"

import { AppShell } from "@/app/layout/AppShell"
import { RedirectIfAuthenticated, RequireAuth } from "@/app/router/guards"
import { useNavigation } from "@/app/router/navigation"
import { CallbackPage } from "@/features/auth/CallbackPage"
import { LoginPage } from "@/features/auth/LoginPage"
import { NotFoundPage } from "@/features/auth/NotFoundPage"
import { HomePage } from "@/features/dashboard/HomePage"
import { LocationsPage } from "@/features/locations/LocationsPage"
import { CustomersPage } from "@/features/partners/CustomersPage"
import { VendorsPage } from "@/features/partners/VendorsPage"
import { PaymentsPage } from "@/features/payments/PaymentsPage"
import { PriceListsPage } from "@/features/pricing/PriceListsPage"
import { PurchaseOrdersPage } from "@/features/purchasing/PurchaseOrdersPage"
import { ReorderPage } from "@/features/reorder/ReorderPage"
import { ReportsPage } from "@/features/reports/ReportsPage"
import { SalesOrdersPage } from "@/features/sales/SalesOrdersPage"
import { AdjustmentsPage } from "@/features/stock/AdjustmentsPage"
import { CountsPage } from "@/features/stock/CountsPage"
import { LotsPage } from "@/features/stock/LotsPage"
import { StockPage } from "@/features/stock/StockPage"
import { TransfersPage } from "@/features/stock/TransfersPage"
import { CategoriesPage } from "@/features/products/CategoriesPage"
import { ProductsPage } from "@/features/products/ProductsPage"
import { AppearancePage } from "@/features/settings/AppearancePage"
import { CompanyPage } from "@/features/settings/CompanyPage"
import { CurrenciesPage } from "@/features/settings/CurrenciesPage"
import { ListsPage } from "@/features/settings/ListsPage"
import { NumberingPage } from "@/features/settings/NumberingPage"
import { SecurityPage } from "@/features/team/SecurityPage"
import { TeamPage } from "@/features/team/TeamPage"

// Signed in pages. Each is wrapped in RequireAuth and the app shell.
const protectedRoutes: Record<string, React.ComponentType> = {
  "/": HomePage,
  "/products": ProductsPage,
  "/categories": CategoriesPage,
  "/stock": StockPage,
  "/stock/adjustments": AdjustmentsPage,
  "/stock/transfers": TransfersPage,
  "/stock/counts": CountsPage,
  "/stock/lots": LotsPage,
  "/stock/reorder": ReorderPage,
  "/sales/orders": SalesOrdersPage,
  "/purchasing/orders": PurchaseOrdersPage,
  "/payments": PaymentsPage,
  "/reports": ReportsPage,
  "/locations": LocationsPage,
  "/customers": CustomersPage,
  "/price-lists": PriceListsPage,
  "/vendors": VendorsPage,
  "/settings/company": CompanyPage,
  "/settings/currencies": CurrenciesPage,
  "/settings/numbering": NumberingPage,
  "/settings/lists": ListsPage,
  "/settings/team": TeamPage,
  "/settings/security": SecurityPage,
  "/settings/appearance": AppearancePage,
}

export function AppRouter() {
  const { path, search } = useNavigation()

  // Must stay outside every guard: the user is not signed in yet here.
  if (path === "/login/callback") return <CallbackPage />

  if (path === "/login") {
    const returnTo = new URLSearchParams(search).get("returnTo") || undefined
    return (
      <RedirectIfAuthenticated>
        <LoginPage returnTo={returnTo} />
      </RedirectIfAuthenticated>
    )
  }

  const Page = protectedRoutes[path.replace(/\/+$/, "") || "/"] ?? NotFoundPage
  return (
    <RequireAuth>
      <AppShell>
        <Page />
      </AppShell>
    </RequireAuth>
  )
}
