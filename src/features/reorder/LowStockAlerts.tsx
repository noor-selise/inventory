import { BellRing, ChevronRight } from "lucide-react"

import { Link } from "@/app/router/navigation"
import { SectionCard } from "@/components/app/page"
import { formatDateTime } from "@/components/app/audit"
import { locations } from "@/features/locations/api"
import { products } from "@/features/products/api"
import { useResource } from "@/hooks/use-resource"
import { locationFilter, useLocationScope } from "@/features/team/location-scope"
import { reorderSettings } from "./api"

// In app low stock alerts (spec 0014 AC-4): every reorder point that went
// below its level and has not been restocked yet. The flag is set once per
// breach by the reorder check, so an alert shows once until it clears.

export function LowStockAlerts() {
  const scope = useLocationScope()
  const alerts = useResource(async () => {
    const { items } = await reorderSettings.list({ filter: { isAlerting: true, ...locationFilter(scope, "locationId") }, sort: { lastAlertedAt: -1 }, pageSize: 50 })
    if (!items.length) return []
    const [productRows, locationRows] = await Promise.all([
      products.list({ filter: { ItemId: { $in: items.map((item) => item.productId) } }, pageSize: 50 }),
      locations.list({ pageSize: 500 }),
    ])
    return items.map((item) => ({
      ...item,
      product: productRows.items.find((row) => row.ItemId === item.productId)?.name ?? "",
      location: locationRows.items.find((row) => row.ItemId === item.locationId)?.name ?? "",
    }))
  }, [scope.key])
  if (!alerts.data?.length) return null
  return (
    <SectionCard title="Low stock" description="Below their reorder point. They clear once restocked." className="mt-6">
      <ul className="flex flex-col gap-2">
        {alerts.data.map((alert) => (
          <li key={alert.ItemId} className="flex items-center gap-3 text-sm">
            <BellRing className="size-4 text-warning" aria-hidden />
            <span className="flex-1">
              {alert.product} at {alert.location}
            </span>
            <span className="text-xs text-muted-foreground">{alert.lastAlertedAt ? formatDateTime(alert.lastAlertedAt) : ""}</span>
          </li>
        ))}
      </ul>
      <Link to="/stock/reorder" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        Open the reorder list <ChevronRight className="size-4" aria-hidden />
      </Link>
    </SectionCard>
  )
}
