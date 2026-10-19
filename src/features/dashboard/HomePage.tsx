import { Building2, ChevronRight, Package, Users } from "lucide-react"

import { useCurrentUser, userDisplayName } from "@/app/providers/CurrentUserProvider"
import { Link } from "@/app/router/navigation"
import { PageHeader } from "@/components/app/page"
import { LowStockAlerts } from "@/features/reorder/LowStockAlerts"
import { StarterDataCard } from "@/features/settings/StarterDataCard"

const SHORTCUTS = [
  { to: "/products", label: "Products", description: "Add and find products, scan barcodes", icon: Package },
  { to: "/settings/company", label: "Company settings", description: "Profile, currencies, numbering, taxes", icon: Building2 },
  { to: "/settings/team", label: "Team", description: "Invite people and set their roles", icon: Users, adminOnly: true },
]

export function HomePage() {
  const { user, isAdmin } = useCurrentUser()
  const name = userDisplayName(user)

  return (
    <>
      <PageHeader
        title={name ? `Welcome, ${name.split(" ")[0]}` : "Welcome"}
        description="Start with your company settings, then add your products."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SHORTCUTS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent md:p-6 dark:border-transparent"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
              <item.icon className="size-5 text-primary" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.description}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>
      <LowStockAlerts />
      {isAdmin ? <StarterDataCard /> : null}
    </>
  )
}
