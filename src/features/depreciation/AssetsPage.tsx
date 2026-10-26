import * as React from "react"
import { CalendarCheck, ChevronLeft, ChevronRight, Landmark, Plus } from "lucide-react"

import { Link } from "@/app/router/navigation"
import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { FilterChips } from "@/components/app/data"
import { SelectField } from "@/components/app/form"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { locations as locationStore } from "@/features/locations/api"
import { listFixedAssetProducts } from "@/features/products/api"
import { ASSET_EDITORS, COST_VIEWERS } from "@/features/team/roles"
import { locationFilter, useLocationScope } from "@/features/team/location-scope"
import { useResource } from "@/hooks/use-resource"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { countedOnly, loadState } from "./actions"
import { fixedAssets, listClasses, listEntries, type FixedAsset } from "./api"
import { AssetDetail } from "./AssetDetail"
import { AssetDialog } from "./AssetDialog"
import { dayLabel, monthLabel } from "./labels"

const PAGE_SIZE = 50
const headClass = "h-9 label-overline"

type StatusFilter = "active" | "disposed" | "all"

// Fixed assets register (spec 0028 AC-7, AC-12): one row per owned unit, with
// its current WDV from counted entries. Values are hidden without cost access.
export function AssetsPage() {
  const { hasRole } = useCurrentUser()
  const canEdit = hasRole(...ASSET_EDITORS)
  const seeCost = hasRole(...COST_VIEWERS)
  const scope = useLocationScope()
  const lookups = useResource(async () => {
    const [state, classes, productRows, locationRows] = await Promise.all([
      loadState(),
      listClasses(),
      listFixedAssetProducts(),
      locationStore.list({ sort: { name: 1 }, pageSize: 500 }),
    ])
    return { state, classes, products: productRows, locations: locationRows.items }
  }, [])
  const [status, setStatus] = React.useState<StatusFilter>("active")
  const [classId, setClassId] = React.useState("")
  const [locationId, setLocationId] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [selectedId, setSelectedId] = React.useState<string>()
  const [dialog, setDialog] = React.useState<{ asset?: FixedAsset; locked: boolean }>()

  const state = lookups.data?.state
  const list = useResource(async () => {
    const filter: Record<string, unknown> = {
      ...(status === "all" ? {} : { status }),
      ...(classId ? { classId } : {}),
      ...locationFilter(scope, "locationId", locationId || null),
    }
    const result = await fixedAssets.list({ filter, sort: { assetNumber: -1 }, pageNo: page, pageSize: PAGE_SIZE })
    // Current WDV: the latest counted entry per asset on this page, else the starting value.
    const latestClosed = (await loadState())?.latestClosed ?? ""
    const entries = result.items.length && latestClosed ? await listEntries({ to: latestClosed, assetIds: result.items.map((asset) => asset.ItemId) }) : []
    const wdv = new Map<string, number>()
    for (const entry of countedOnly(entries, latestClosed)) wdv.set(entry.assetId, entry.closingWdv)
    return { ...result, wdv }
  }, [status, classId, locationId, page, scope.key])

  React.useEffect(() => setPage(1), [status, classId, locationId])

  React.useEffect(() => {
    if (!dialog) return
    void lookups.reload()
    // Refresh fixed-asset products when the dialog opens (e.g. after creating one on Products).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload once per open, not on every lookups identity change
  }, [dialog])

  const data = lookups.data
  const items = list.data?.items ?? []
  const total = list.data?.totalCount ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currency = state?.company.homeCurrency ?? "USD"
  const money = (value: number) => (seeCost ? formatMoney(value, currency) : "Hidden")
  const productName = (id?: string) => data?.products.find((item) => item.ItemId === id)?.name ?? ""
  const className = (id?: string) => data?.classes.find((item) => item.ItemId === id)?.name ?? ""
  const locationName = (id?: string | null) => data?.locations.find((item) => item.ItemId === id)?.name ?? ""
  const wdvOf = (asset: FixedAsset) => list.data?.wdv.get(asset.ItemId) ?? asset.openingWdv ?? asset.cost
  const selected = items.find((item) => item.ItemId === selectedId)

  function refresh() {
    void list.reload()
    void lookups.reload()
  }

  if (lookups.loading && !data) {
    return (
      <>
        <PageHeader title="Fixed assets" />
        <LoadingRows rows={6} />
      </>
    )
  }

  if (data && !state) {
    return (
      <>
        <PageHeader title="Fixed assets" description="Things your company owns and uses, each depreciating month by month." />
        <SectionCard>
          <EmptyState
            icon={Landmark}
            message="Pick your company's country for depreciation first. It sets the classes, rates and income year."
            action={
              <Button asChild variant="secondary">
                <Link to="/settings/company">Open Company settings</Link>
              </Button>
            }
          />
        </SectionCard>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Fixed assets"
        description="Each unit your company owns and uses, with its value left after depreciation. Received fixed asset lines appear here on their own."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to="/assets/close">
                <CalendarCheck aria-hidden /> Close month
              </Link>
            </Button>
            {canEdit && state ? (
              <Button onClick={() => setDialog({ locked: false })} disabled={state.status !== "open"}>
                <Plus aria-hidden /> Add asset
              </Button>
            ) : null}
          </>
        }
      />
      {lookups.error ? <ErrorBanner message={lookups.error} onRetry={() => void lookups.reload()} /> : null}
      {list.error ? <ErrorBanner message={list.error} onRetry={() => void list.reload()} /> : null}
      {state && state.status !== "open" ? (
        <p role="status" className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          A month {state.status === "closing" ? "close" : "reopen"} is running. Asset changes wait until it finishes.
        </p>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <FilterChips<StatusFilter>
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "In use" },
            { value: "disposed", label: "Disposed" },
            { value: "all", label: "All" },
          ]}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[480px]">
          <SelectField id="assets-class" label="Class" allowNone placeholder="All classes" options={(data?.classes ?? []).map((item) => ({ value: item.ItemId, label: item.name }))} value={classId} onChange={setClassId} />
          <SelectField
            id="assets-location"
            label="Location"
            allowNone
            placeholder="All locations"
            options={(data?.locations ?? []).filter((item) => !scope.limited || scope.ids.includes(item.ItemId)).map((item) => ({ value: item.ItemId, label: item.name }))}
            value={locationId}
            onChange={setLocationId}
          />
        </div>
      </div>

      <SectionCard className="p-0 md:p-0">
        {list.loading && !list.data ? (
          <div className="p-4">
            <LoadingRows rows={6} />
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={Landmark}
            message={status === "disposed" ? "No disposed assets." : "No assets yet. Receive a fixed asset product on a purchase order, or add one you already own."}
            action={
              canEdit && state && status !== "disposed" ? (
                <Button variant="secondary" onClick={() => setDialog({ locked: false })}>
                  <Plus aria-hidden /> Add asset
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <ul className="divide-y md:hidden">
              {items.map((asset) => (
                <li key={asset.ItemId}>
                  <button type="button" onClick={() => setSelectedId(asset.ItemId)} className="flex w-full cursor-pointer flex-col gap-1 px-4 py-3 text-left hover:bg-accent">
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold">{productName(asset.productId)}</span>
                      <span className="shrink-0 font-semibold num">{money(wdvOf(asset))}</span>
                    </span>
                    <span className="font-mono text-[13px] text-muted-foreground">{asset.assetNumber}</span>
                    <span className="text-xs text-muted-foreground">
                      {className(asset.classId)} · {locationName(asset.locationId)} · {asset.status === "disposed" ? "Disposed" : "In use"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className={headClass}>Asset</TableHead>
                    <TableHead className={headClass}>Product</TableHead>
                    <TableHead className={cn(headClass, "hidden lg:table-cell")}>Class</TableHead>
                    <TableHead className={cn(headClass, "hidden lg:table-cell")}>Location</TableHead>
                    <TableHead className={headClass}>In service</TableHead>
                    <TableHead className={cn(headClass, "text-right")}>Cost</TableHead>
                    <TableHead className={cn(headClass, "text-right")}>WDV</TableHead>
                    <TableHead className={headClass}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((asset) => (
                    <TableRow key={asset.ItemId} className="h-11 cursor-pointer" onClick={() => setSelectedId(asset.ItemId)}>
                      <TableCell className="font-mono text-[13px]">{asset.assetNumber}</TableCell>
                      <TableCell className="font-medium">
                        {productName(asset.productId)}
                        {asset.serialNumber ? <span className="ml-2 font-mono text-xs text-muted-foreground">{asset.serialNumber}</span> : null}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{className(asset.classId)}</TableCell>
                      <TableCell className="hidden lg:table-cell">{locationName(asset.locationId)}</TableCell>
                      <TableCell>{dayLabel(asset.inServiceDate)}</TableCell>
                      <TableCell className="text-right num">{money(asset.cost)}</TableCell>
                      <TableCell className="text-right num">{money(wdvOf(asset))}</TableCell>
                      <TableCell>{asset.status === "disposed" ? <Badge variant="muted">{asset.disposalType === "sold" ? "Sold" : "Scrapped"}</Badge> : <Badge variant="success">In use</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground num">
                {total} asset{total === 1 ? "" : "s"} · page {page} of {pages}
                {state?.latestClosed ? ` · WDV after ${monthLabel(state.latestClosed)}` : ""}
              </span>
              <div className="flex gap-2">
                <Button size="icon-sm" variant="secondary" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft />
                </Button>
                <Button size="icon-sm" variant="secondary" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        )}
      </SectionCard>
      {!seeCost ? <p className="mt-3 text-xs text-muted-foreground">Cost and value columns are hidden for your role.</p> : null}

      {state && data ? (
        <>
          <AssetDetail
            asset={selected}
            onClose={() => setSelectedId(undefined)}
            state={state}
            classes={data.classes}
            productName={productName(selected?.productId)}
            locationName={locationName(selected?.locationId)}
            canEdit={canEdit && state.status === "open"}
            seeCost={seeCost}
            onEdit={(asset, hasEntries) => setDialog({ asset, locked: hasEntries })}
            onChanged={refresh}
          />
          <AssetDialog
            open={Boolean(dialog)}
            onOpenChange={(open) => (!open ? setDialog(undefined) : undefined)}
            asset={dialog?.asset}
            locked={dialog?.locked ?? false}
            state={state}
            products={data.products.filter((item) => item.isActive !== false || item.ItemId === dialog?.asset?.productId)}
            classes={data.classes}
            locations={data.locations.filter((item) => item.isActive !== false || item.ItemId === dialog?.asset?.locationId)}
            onSaved={refresh}
          />
        </>
      ) : null}
    </>
  )
}
