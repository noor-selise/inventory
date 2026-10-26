import * as React from "react"
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  ChartColumn,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Contact,
  FolderTree,
  Hash,
  LayoutDashboard,
  ListChecks,
  ListRestart,
  LogOut,
  MapPin,
  Menu,
  Package,
  PackageSearch,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  Wallet,
  Waypoints,
} from "lucide-react"

import { useAuth } from "@/app/providers/AuthProvider"
import { useCurrentUser, userDisplayName } from "@/app/providers/CurrentUserProvider"
import { Link, useNavigation } from "@/app/router/navigation"
import { LoadingRows } from "@/components/app/page"
import { ThemeMenu } from "@/components/app/theme-menu"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { reorderSuggestions } from "@/features/reorder/api"
import { useDailyReorderCheck } from "@/features/reorder/useDailyReorderCheck"
import { companies } from "@/features/settings/api"
import { roleName } from "@/features/team/roles"
import { useResource } from "@/hooks/use-resource"
import { cn } from "@/lib/utils"
import { locationFilter, useLocationScope } from "@/features/team/location-scope"

// App shell (docs/DESIGN.md §6.6, §7.2): from md up, sidebar expands to 240px or
// folds to a 64px rail (preference remembered); phones use a sheet. Footer is
// legal/meta only — navigation lives in the sidebar and account menu.

type NavItem = {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
  /** Shows a live count beside the link. */
  badge?: "reorder"
}

type NavSection = { key: string; label: string; items: NavItem[] }

const HOME: NavItem = { to: "/", label: "Dashboard", icon: LayoutDashboard }

const NAV_SECTIONS: NavSection[] = [
  {
    key: "sales",
    label: "Sales",
    items: [
      { to: "/sales/orders", label: "Sales orders", icon: ShoppingCart },
      { to: "/customers", label: "Customers", icon: Contact },
      { to: "/price-lists", label: "Price lists", icon: Tags },
      { to: "/payments", label: "Payments", icon: Wallet },
    ],
  },
  {
    key: "purchasing",
    label: "Purchasing",
    items: [
      { to: "/purchasing/orders", label: "Purchase orders", icon: ClipboardList },
      { to: "/vendors", label: "Vendors", icon: Truck },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    items: [
      { to: "/products", label: "Products", icon: Package },
      { to: "/categories", label: "Categories", icon: FolderTree },
      { to: "/stock", label: "Stock", icon: PackageSearch },
      { to: "/stock/adjustments", label: "Adjustments", icon: ClipboardList },
      { to: "/stock/transfers", label: "Transfers", icon: ArrowLeftRight },
      { to: "/stock/counts", label: "Counts", icon: ClipboardCheck },
      { to: "/stock/lots", label: "Lots and serials", icon: Waypoints },
      { to: "/stock/reorder", label: "Reordering", icon: ListRestart, badge: "reorder" },
      { to: "/locations", label: "Locations", icon: MapPin },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    items: [{ to: "/reports", label: "Reports", icon: ChartColumn }],
  },
  {
    key: "settings",
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

/** A per browser preference. Storage can be missing (private windows), so every read and write is guarded. */
function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = React.useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw == null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  React.useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Not saved; the preference lasts for this visit only.
    }
  }, [key, value])
  return [value, setValue] as const
}

/** Live counts beside nav links, read once per visit. */
function useNavBadges() {
  const scope = useLocationScope()
  const reorder = useResource(async () => (await reorderSuggestions.list({ filter: locationFilter(scope, "locationId"), pageSize: 1 })).totalCount, [scope.key])
  return { reorder: reorder.data ?? 0 }
}

function NavLink({ item, active, rail, count, onNavigate }: { item: NavItem; active: boolean; rail: boolean; count?: number; onNavigate?: () => void }) {
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={rail ? `${item.label}${count ? `, ${count} need attention` : ""}` : undefined}
      title={rail ? item.label : undefined}
      className={cn(
        "group relative flex h-10 cursor-pointer items-center gap-3 rounded-md text-sm font-semibold text-sidebar-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
        rail ? "justify-center px-0" : "px-3",
        active && "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary"
      )}
    >
      <item.icon className={cn("size-5 shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground group-hover:text-sidebar-accent-foreground")} />
      {rail ? null : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {count ? (
        rail ? (
          <span className="absolute top-1.5 right-2 size-2 rounded-full bg-warning ring-2 ring-sidebar" aria-hidden />
        ) : (
          <span className="rounded-full bg-warning/15 px-1.5 text-[11px] leading-5 font-bold text-warning num">{count > 99 ? "99+" : count}</span>
        )
      ) : null}
    </Link>
  )
}

function NavLinks({ rail = false, onNavigate }: { rail?: boolean; onNavigate?: () => void }) {
  const { path } = useNavigation()
  const { isAdmin } = useCurrentUser()
  const badges = useNavBadges()
  const [closed, setClosed] = useStoredState<string[]>("inventory:nav-closed", [])

  return (
    <nav aria-label="Main" className={cn("flex flex-col", rail ? "gap-1" : "gap-4")}>
      <NavLink item={HOME} active={isActive(path, HOME.to)} rail={rail} onNavigate={onNavigate} />
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((item) => !item.adminOnly || isAdmin)
        const holdsActive = items.some((item) => isActive(path, item.to))
        // The section holding the current page always shows its links.
        const open = holdsActive || !closed.includes(section.key)
        const links = items.map((item) => (
          <NavLink key={item.to} item={item} active={isActive(path, item.to)} rail={rail} count={item.badge ? badges[item.badge] : undefined} onNavigate={onNavigate} />
        ))
        if (rail) {
          return (
            <div key={section.key} className="flex flex-col gap-1 border-t border-sidebar-border pt-1">
              {links}
            </div>
          )
        }
        return (
          <div key={section.key} className="flex flex-col gap-0.5">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`nav-${section.key}`}
              disabled={holdsActive}
              onClick={() => setClosed((current) => (open ? [...current, section.key] : current.filter((key) => key !== section.key)))}
              className="flex h-7 cursor-pointer items-center gap-2 rounded-sm px-3 text-left transition-colors hover:text-sidebar-accent-foreground disabled:cursor-default"
            >
              <span className="flex-1 label-overline">{section.label}</span>
              <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform duration-200", !open && "-rotate-90", holdsActive && "opacity-0")} aria-hidden />
            </button>
            {open ? (
              <div id={`nav-${section.key}`} className="flex flex-col gap-0.5">
                {links}
              </div>
            ) : null}
          </div>
        )
      })}
    </nav>
  )
}

function useCompanyName() {
  const company = useResource(async () => (await companies.list({ pageSize: 1 })).items[0]?.name ?? "", [])
  return company.data ?? ""
}

function Brand({ rail = false }: { rail?: boolean }) {
  const company = useCompanyName()
  return (
    <Link to="/" title={rail ? "Inventory" : undefined} className={cn("flex min-w-0 cursor-pointer items-center gap-3 rounded-md transition-colors hover:bg-sidebar-accent", rail ? "justify-center p-1" : "px-2 py-1.5")}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Boxes className="size-5" aria-hidden />
      </span>
      {rail ? (
        <span className="sr-only">Inventory</span>
      ) : (
        <span className="min-w-0">
          <span className="block text-sm leading-tight font-bold text-sidebar-accent-foreground">Inventory</span>
          <span className="block truncate text-xs text-sidebar-foreground">{company || "Your company"}</span>
        </span>
      )}
    </Link>
  )
}

function initialsOf(name: string) {
  const parts = name.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase()
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-foreground", className)}>
      {initialsOf(name)}
    </span>
  )
}

function AccountMenuItems() {
  const { logout } = useAuth()
  const { user, roles } = useCurrentUser()
  const name = userDisplayName(user)
  return (
    <>
      <DropdownMenuLabel>
        <span className="block truncate text-sm">{name || "Signed in"}</span>
        {user?.email && user.email !== name ? <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span> : null}
        {roles.length ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{roles.map(roleName).join(", ")}</span> : null}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link to="/settings/security">
          <ShieldCheck className="size-4" /> Security
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/settings/appearance">
          <Palette className="size-4" /> Appearance
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => void logout()}>
        <LogOut className="size-4" /> Sign out
      </DropdownMenuItem>
    </>
  )
}

/** Signed in person in the top bar (DESIGN.md §6.6). */
function TopBarUser() {
  const { user, roles } = useCurrentUser()
  const name = userDisplayName(user)
  const role = roles.length ? roles.map(roleName).join(", ") : "No role"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="group flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-left transition-colors duration-200 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:h-12 sm:w-auto sm:min-w-64 sm:justify-between sm:gap-3 sm:pl-1.5 sm:pr-4"
        >
          <Avatar name={name} />
          <span className="hidden min-w-0 flex-1 sm:block">
            <span className="block truncate text-sm font-semibold leading-snug">{name || "Signed in"}</span>
            <span className="block truncate text-xs leading-snug text-muted-foreground">{role}</span>
          </span>
          <ChevronDown className="hidden size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 sm:block" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <AccountMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Sidebar({ folded, onFold }: { folded: boolean; onFold: () => void }) {
  const rail = folded
  const width = rail ? "md:w-16" : "md:w-60"
  return (
    <aside aria-label="Sidebar" className={cn("sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex", width)}>
      <div className={cn("shrink-0 pt-4 pb-3", rail ? "px-2" : "px-3")}>
        <Brand rail={rail} />
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto pb-4", rail ? "px-2" : "px-3")} data-scroll="quiet">
        <NavLinks rail={rail} />
      </div>
      <div className={cn("shrink-0 border-t border-sidebar-border py-1.5", rail ? "px-2" : "px-3")}>
        <button
          type="button"
          onClick={onFold}
          aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          title={rail ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex h-9 w-full cursor-pointer items-center gap-3 rounded-md text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
            rail ? "justify-center" : "px-3"
          )}
        >
          {rail ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
          {rail ? null : "Collapse"}
        </button>
      </div>
    </aside>
  )
}

function AppFooter() {
  const company = useCompanyName()
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-border/60 px-4 py-4 md:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0 truncate">© {year} {company || "Your company"}</p>
        <p className="shrink-0 font-mono text-[11px] text-muted-foreground/80" aria-label={`Application version ${__APP_VERSION__}`}>
          v{__APP_VERSION__}
        </p>
      </div>
    </footer>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [folded, setFolded] = useStoredState("inventory:sidebar-folded", false)
  useDailyReorderCheck()
  const { loaded } = useCurrentUser()

  return (
    <div className="flex min-h-svh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <Sidebar folded={folded} onFold={() => setFolded((value) => !value)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:px-6 lg:h-16 lg:px-8">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col gap-0 bg-sidebar p-0">
              <SheetHeader className="shrink-0 p-3 pt-4">
                <SheetTitle asChild>
                  <div>
                    <Brand />
                  </div>
                </SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" data-scroll="quiet">
                <NavLinks onNavigate={() => setMenuOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <div className="md:hidden">
            <Brand rail />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeMenu />
            <TopBarUser />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px]">{loaded ? children : <LoadingRows rows={6} />}</div>
        </main>
        <AppFooter />
      </div>
    </div>
  )
}
