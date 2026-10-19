import * as React from "react"
import { Settings2 } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { Link } from "@/app/router/navigation"
import { CheckboxField } from "@/components/app/form"
import { Button } from "@/components/ui/button"
import { companies } from "@/features/settings/api"
import { reorderSuggestions } from "@/features/reorder/api"
import { OPEN_ORDER_FILTER, salesOrders } from "@/features/sales/api"
import { toHome } from "@/features/sales/order-math"
import { DASHBOARD_WIDGETS, saveProfile, type DashboardWidget } from "@/features/team/profile"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { dateFilter } from "@/lib/blocks/data"
import { formatMoney, formatNumber } from "@/lib/format"

// Home dashboard widgets (spec 0015 AC-6): each person picks which to show,
// saved on their TeamMemberProfile (spec 0027). Numbers are read live.

const DEFAULT_WIDGETS: DashboardWidget[] = ["sales_today", "low_stock", "open_orders"]

export function DashboardWidgets() {
  const { user, profile, reload } = useCurrentUser()
  const saved = (profile?.dashboardWidgets ?? []).filter((key): key is DashboardWidget => DASHBOARD_WIDGETS.some((widget) => widget.value === key))
  const chosen = profile?.dashboardWidgets ? saved : DEFAULT_WIDGETS
  const [customizing, setCustomizing] = React.useState(false)
  const [draft, setDraft] = React.useState<DashboardWidget[]>(chosen)

  const numbers = useResource(async () => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const [today, open, low, company] = await Promise.all([
      salesOrders.list({ filter: { isQuote: false, isCancelled: { $ne: true }, orderDate: { $gte: dateFilter(start.toISOString()) } }, pageSize: 2000 }),
      salesOrders.list({ filter: OPEN_ORDER_FILTER, pageSize: 1 }),
      reorderSuggestions.list({ pageSize: 1 }),
      companies.list({ pageSize: 1 }),
    ])
    return {
      salesToday: today.items.reduce((sum, order) => sum + toHome(Number(order.total ?? 0), order.exchangeRate), 0),
      ordersToday: today.items.length,
      openOrders: open.totalCount,
      lowStock: low.totalCount,
      currency: company.items[0]?.homeCurrency ?? "USD",
    }
  }, [])

  async function save() {
    if (!user?.itemId) return
    try {
      await saveProfile(String(user.itemId), { dashboardWidgets: draft })
      await reload()
      setCustomizing(false)
      toast.success("Dashboard saved")
    } catch (caught) {
      toast.error(errorMessage(caught))
    }
  }

  const value = (key: DashboardWidget) => {
    const data = numbers.data
    if (!data) return { big: "…", small: "" }
    if (key === "sales_today") return { big: formatMoney(data.salesToday, data.currency), small: `${formatNumber(data.ordersToday)} orders today`, to: "/sales/orders" }
    if (key === "low_stock") return { big: formatNumber(data.lowStock), small: "below their reorder point", to: "/stock/reorder" }
    return { big: formatNumber(data.openOrders), small: "sales orders not yet fulfilled", to: "/sales/orders" }
  }

  return (
    <section aria-label="Dashboard" className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Today</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(chosen)
            setCustomizing((current) => !current)
          }}
        >
          <Settings2 aria-hidden /> Customize
        </Button>
      </div>
      {customizing ? (
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border p-3">
          {DASHBOARD_WIDGETS.map((widget) => (
            <CheckboxField
              key={widget.value}
              id={`widget-${widget.value}`}
              label={widget.label}
              checked={draft.includes(widget.value)}
              onChange={(on) => setDraft((current) => (on ? DASHBOARD_WIDGETS.map((item) => item.value).filter((item) => item === widget.value || current.includes(item)) : current.filter((item) => item !== widget.value)))}
            />
          ))}
          <Button size="sm" onClick={() => void save()}>
            Save
          </Button>
        </div>
      ) : null}
      {numbers.error ? <p className="text-sm text-destructive">{numbers.error}</p> : null}
      {chosen.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {chosen.map((key) => {
            const { big, small, to } = value(key)
            return (
              <Link key={key} to={to ?? "/"} className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent md:p-6 dark:border-transparent">
                <span className="block label-overline">{DASHBOARD_WIDGETS.find((widget) => widget.value === key)?.label}</span>
                <span className="mt-1 block text-2xl font-semibold num">{big}</span>
                <span className="block text-xs text-muted-foreground">{small}</span>
              </Link>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No widgets chosen. Use Customize to add some.</p>
      )}
    </section>
  )
}
