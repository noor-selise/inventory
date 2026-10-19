import * as React from "react"
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  Contact,
  Coins,
  FolderTree,
  Hash,
  LayoutDashboard,
  ListChecks,
  ListRestart,
  LogOut,
  Menu,
  MapPin,
  Package,
  ShieldCheck,
  PackageSearch,
  Palette,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  Wallet,
  Waypoints,
} from "lucide-react"

import { useAuth } from "@/app/providers/AuthProvider"
import {
  useCurrentUser,
  userDisplayName,
} from "@/app/providers/CurrentUserProvider"
import { Link, useNavigation } from "@/app/router/navigation"
import { ThemeMenu } from "@/components/app/theme-menu"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { roleName } from "@/features/team/roles"
import { cn } from "@/lib/utils"
import { useDailyReorderCheck } from "@/features/reorder/useDailyReorderCheck"

type NavItem = {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Sales",
    items: [
      { to: "/sales/orders", label: "Sales orders", icon: ShoppingCart },
      { to: "/customers", label: "Customers", icon: Contact },
      { to: "/price-lists", label: "Price lists", icon: Tags },
      { to: "/payments", label: "Payments", icon: Wallet },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { to: "/purchasing/orders", label: "Purchase orders", icon: ClipboardList },
      { to: "/vendors", label: "Vendors", icon: Truck },
    ],
  },
  {
    label: "Inventory",
    items: [
      { to: "/products", label: "Products", icon: Package },
      { to: "/categories", label: "Categories", icon: FolderTree },
      { to: "/stock", label: "Stock", icon: PackageSearch },
      { to: "/stock/adjustments", label: "Adjustments", icon: ClipboardList },
      { to: "/stock/transfers", label: "Transfers", icon: ArrowLeftRight },
      { to: "/stock/counts", label: "Counts", icon: ClipboardCheck },
      { to: "/stock/lots", label: "Lots and serials", icon: Waypoints },
      { to: "/stock/reorder", label: "Reordering", icon: ListRestart },
      { to: "/locations", label: "Locations", icon: MapPin },
    ],
  },
  {
    label: "Reports",
    items: [{ to: "/reports", label: "Reports", icon: ChartColumn }],
  },
  {
    label: "Settings",
    items: [
      { to: "/settings/company", label: "Company", icon: Building2 },
      { to: "/settings/currencies", label: "Currencies", icon: Coins },
      { to: "/settings/numbering", label: "Numbering", icon: Hash },
      { to: "/settings/lists", label: "Lists and taxes", icon: ListChecks },
      { to: "/settings/team", label: "Team", icon: Users, adminOnly: true },
      { to: "/settings/security", label: "Security", icon: ShieldCheck },
      { to: "/settings/appearance", label: "Appearance", icon: Palette },
    ],
  },
]

// Exact match for parents that have their own child entries (/stock vs /stock/counts).
const EXACT = new Set(["/", "/stock"])

function isActive(path: string, to: string) {
  return EXACT.has(to) ? path === to : path === to || path.startsWith(`${to}/`)
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { path } = useNavigation()
  const { isAdmin } = useCurrentUser()

  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label || "main"} className="flex flex-col gap-1">
          {section.label ? (
            <p className="px-3 pb-1 label-overline">
              {section.label}
            </p>
          ) : null}
          {section.items
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => {
              const active = isActive(path, item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-10 items-center gap-3 rounded-sm px-3 text-sm font-semibold text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    active &&
                      "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary"
                  )}
                >
                  <item.icon className="size-5 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
        </div>
      ))}
    </nav>
  )
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2 px-3 text-sm font-bold">
      <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Boxes className="size-4" aria-hidden />
      </span>
      Inventory
    </Link>
  )
}

function UserMenu() {
  const { logout } = useAuth()
  const { user, roles } = useCurrentUser()
  const name = userDisplayName(user)
  const initial = (name[0] ?? "?").toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
            {initial}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>
          <span className="block truncate text-sm">{name || "Signed in"}</span>
          {roles.length ? (
            <span className="block text-xs font-normal text-muted-foreground">
              {roles.map(roleName).join(", ")}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  useDailyReorderCheck()

  return (
    <div className="flex min-h-svh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-6 overflow-y-auto bg-sidebar px-3 py-4 lg:flex">
        <Brand />
        <NavLinks />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:px-6 lg:h-16 lg:px-8">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-4">
              <SheetHeader className="p-0 pb-4">
                <SheetTitle asChild>
                  <div>
                    <Brand />
                  </div>
                </SheetTitle>
              </SheetHeader>
              <NavLinks onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeMenu />
            <UserMenu />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
