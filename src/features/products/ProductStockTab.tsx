import * as React from "react"
import { History, PackagePlus, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"

import { Link } from "@/app/router/navigation"
import { EmptyState, ErrorBanner, LoadingRows } from "@/components/app/page"
import { tableCellClass, tableCol, tableFixed, tableHeadClass } from "@/components/app/table"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatNumber } from "@/lib/format"
import { applyCostAgain, retryAdjustment } from "@/features/stock/actions"
import { posting, quantitiesFor } from "@/features/stock/api"
import { postingMessage } from "@/features/stock/AdjustmentsPage"
import type { StockLookups } from "@/features/stock/lookups"
import { seesLocation, useLocationScope } from "@/features/team/location-scope"
import type { Product } from "./api"
import { AdjustStockDialog } from "./AdjustStockDialog"
import { OpeningStockRows } from "./OpeningStockRows"
import { hasStockHistory, openingIssues, openingRowProblems, postOpening, type OpeningResult, type OpeningRow, type PlaceInput } from "./productStock"

// A product's stock in its dialog (spec 0029 G2, G3): on hand per location,
// where it sits (bin, lot, serial), opening stock while it has no history, and
// Adjust stock once it has. Every change posts as an ordinary adjustment.

/** Summarises opening stock results for a toast or banner. */
export function openingSummary(results: OpeningResult[], lookups: Pick<StockLookups, "locationName">) {
  const posted = results.filter((result) => result.status === "posted")
  const problems = results
    .filter((result) => result.status !== "posted" || result.costPending)
    .map((result) =>
      result.status === "posted"
        ? `${lookups.locationName(result.locationId)}: stock posted, but the cost wasn't updated. Use "Update cost" below.`
        : `${lookups.locationName(result.locationId)}: ${result.error ?? "not posted."}`
    )
  return { posted: posted.length, problems }
}

export function ProductStockTab({
  product,
  lookups,
  canPost,
  canOverride,
  initialRows,
  initialProblems,
  onChanged,
}: {
  product: Product
  lookups: StockLookups
  canPost: boolean
  canOverride: boolean
  /** Opening rows that did not post when the product was created. */
  initialRows?: OpeningRow[]
  initialProblems?: string[]
  onChanged: () => void
}) {
  const scope = useLocationScope()
  const [version, setVersion] = React.useState(0)
  const refresh = () => {
    setVersion((value) => value + 1)
    onChanged()
  }
  const history = useResource(() => hasStockHistory(product.ItemId), [product.ItemId, version])
  const quantities = useResource(
    async () => (await quantitiesFor(product.ItemId)).filter((row) => seesLocation(scope, row.locationId)),
    [product.ItemId, scope.key, version]
  )
  const places = useResource(
    async () =>
      (await posting.balances({ productId: product.ItemId, onHand: { $ne: 0 } }, { pageSize: 500 })).items.filter((balance) => seesLocation(scope, balance.locationId)),
    [product.ItemId, scope.key, version]
  )
  const issues = useResource(() => openingIssues(product.ItemId, lookups), [product.ItemId, version])
  const [adjusting, setAdjusting] = React.useState<PlaceInput | "new">()
  const [rows, setRows] = React.useState<OpeningRow[]>(() => initialRows ?? [])
  const [rowErrors, setRowErrors] = React.useState<Record<string, string | undefined>>({})
  const [problems, setProblems] = React.useState<string[]>(() => initialProblems ?? [])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()

  const detailed = product.trackLots || product.trackSerials || (places.data ?? []).some((balance) => balance.sublocationId)

  async function postRows() {
    const found = openingRowProblems(rows, product)
    setRowErrors(found)
    if (Object.keys(found).length || !rows.length) {
      setError(rows.length ? "Fix the highlighted rows." : "Add at least one row.")
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const results = await postOpening(product, rows, lookups)
      const summary = openingSummary(results, lookups)
      setRows(results.filter((result) => result.status !== "posted").flatMap((result) => result.rows))
      setProblems(summary.problems)
      if (summary.posted) toast.success(`Opening stock posted at ${summary.posted} location${summary.posted === 1 ? "" : "s"}`)
      refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      toast.success(success)
      setProblems([])
      refresh()
    } catch (caught) {
      setError(postingMessage(caught, lookups))
    } finally {
      setBusy(false)
    }
  }

  const loading = history.loading || quantities.loading
  const loadError = history.error ?? quantities.error ?? places.error
  const noHistory = history.data === false

  return (
    <div className="flex flex-col gap-4">
      {loadError ? <ErrorBanner message={loadError} /> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {problems.map((problem) => (
        <ErrorBanner key={problem} message={problem} />
      ))}
      {(issues.data ?? []).map((doc) => (
        <div key={doc.ItemId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3 text-sm">
          <span>
            {doc.status === "failed"
              ? `Opening stock for ${lookups.locationName(doc.locationId)} wasn't posted (${doc.number}).`
              : `Opening stock for ${lookups.locationName(doc.locationId)} is posted, but the product cost wasn't updated (${doc.number}).`}
          </span>
          {canPost ? (
            doc.status === "failed" ? (
              <Button size="sm" disabled={busy} onClick={() => void run(() => retryAdjustment(doc, lookups, false), `${doc.number} posted`)}>
                Try again
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => applyCostAgain(doc), "Product cost updated")}>
                Update cost
              </Button>
            )
          ) : null}
        </div>
      ))}

      {loading ? (
        <LoadingRows rows={3} />
      ) : (quantities.data ?? []).length === 0 ? (
        <EmptyState icon={PackagePlus} message={noHistory ? "No stock yet." : "No stock at the locations you can see."} />
      ) : (
        <div className="overflow-x-auto">
          <Table className={tableFixed}>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className={tableHeadClass(tableCol.location)}>Location</TableHead>
                <TableHead className={tableHeadClass(tableCol.numWide)}>On hand</TableHead>
                <TableHead className={tableHeadClass(tableCol.numWide)}>Available</TableHead>
                <TableHead className={tableHeadClass(tableCol.numWide)}>On order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(quantities.data ?? []).map((row) => (
                <TableRow key={row.locationId} className="h-11">
                  <TableCell className={tableCellClass(tableCol.location, "truncate")}>{lookups.locationName(row.locationId)}</TableCell>
                  <TableCell className={tableCellClass(tableCol.numWide)}>{formatNumber(row.onHand)}</TableCell>
                  <TableCell className={tableCellClass(tableCol.numWide)}>{formatNumber(row.available)}</TableCell>
                  <TableCell className={tableCellClass(tableCol.numWide)}>{formatNumber(row.onOrder)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-1 text-xs text-muted-foreground">In {product.standardUom}. Available is on hand less what open orders and transfers have reserved.</p>
        </div>
      )}

      {!loading && detailed && (places.data ?? []).length ? (
        <div className="overflow-x-auto">
          <h4 className="mb-2 text-sm font-semibold">Where it is</h4>
          <Table className={tableFixed}>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className={tableHeadClass(tableCol.location)}>Location</TableHead>
                <TableHead className={tableHeadClass(tableCol.bin)}>Bin</TableHead>
                <TableHead className={tableHeadClass("min-w-0 w-[6.5rem]")}>{product.trackSerials ? "Serial" : "Lot"}</TableHead>
                <TableHead className={tableHeadClass(tableCol.numWide)}>On hand</TableHead>
                {canPost ? <TableHead className={tableHeadClass("w-12")} /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(places.data ?? []).map((balance) => {
                const place: PlaceInput = {
                  locationId: balance.locationId,
                  binCode: lookups.binCode(balance.sublocationId),
                  lotNumber: lookups.lotNumber(balance.lotId),
                  serial: balance.serial ?? "",
                }
                return (
                  <TableRow key={balance.ItemId} className="h-11">
                    <TableCell className={tableCellClass(tableCol.location, "truncate")}>{lookups.locationName(balance.locationId)}</TableCell>
                    <TableCell className={tableCellClass(tableCol.bin, "truncate")}>{place.binCode}</TableCell>
                    <TableCell className={tableCellClass("min-w-0 font-mono text-[13px] truncate")}>{balance.serial ?? place.lotNumber}</TableCell>
                    <TableCell className={tableCellClass(tableCol.numWide)}>{formatNumber(balance.onHand)}</TableCell>
                    {canPost ? (
                      <TableCell className={tableCellClass("w-12 text-right")}>
                        <Button size="sm" variant="ghost" onClick={() => setAdjusting(place)}>
                          Adjust
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {canPost && noHistory ? (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Opening stock</h4>
          <p className="text-sm text-muted-foreground">What you have now, per location. It posts as an "Opening stock" adjustment and sets the product's average cost.</p>
          <OpeningStockRows product={product} rows={rows} onChange={setRows} lookups={lookups} errors={rowErrors} disabled={busy} />
          {rows.length ? (
            <div>
              <Button onClick={() => void postRows()} disabled={busy}>
                {busy ? "Posting…" : "Post opening stock"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {canPost && history.data === true ? (
          <Button variant="secondary" onClick={() => setAdjusting("new")}>
            <SlidersHorizontal aria-hidden /> Adjust stock
          </Button>
        ) : null}
        <Button variant="ghost" asChild>
          <Link to={`/stock?tab=product&product=${encodeURIComponent(product.ItemId)}`}>
            <History aria-hidden /> View history
          </Link>
        </Button>
      </div>

      {adjusting ? (
        <AdjustStockDialog
          product={product}
          lookups={lookups}
          place={adjusting === "new" ? undefined : adjusting}
          canOverride={canOverride}
          onClose={() => setAdjusting(undefined)}
          onDone={() => {
            setAdjusting(undefined)
            refresh()
          }}
        />
      ) : null}
    </div>
  )
}
