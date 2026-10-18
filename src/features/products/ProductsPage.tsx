import * as React from "react"
import { Ban, ChevronLeft, ChevronRight, CircleCheck, Package, Plus, ScanBarcode, Search } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PRODUCT_EDITORS } from "@/features/team/roles"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { cn } from "@/lib/utils"
import {
  ITEM_TYPES,
  categories,
  categoryPaths,
  productBarcodes,
  products,
  type Product,
} from "./api"
import { normalizeBarcode } from "./barcode"
import { ProductDialog } from "./ProductDialog"

const PAGE_SIZE = 25
const headClass = "h-9 text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase"

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Prefix search on name or SKU, newest first when there is no search term.
async function searchProducts(term: string, page: number, showInactive: boolean) {
  const filters: Record<string, unknown>[] = []
  if (term) {
    const pattern = { $regex: `^${escapeRegex(term)}`, $options: "i" }
    filters.push({ $or: [{ name: pattern }, { sku: pattern }] })
  }
  if (!showInactive) filters.push({ isActive: { $ne: false } })
  const filter = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : { $and: filters }
  const sort: Record<string, 1 | -1> = term ? { name: 1 } : { CreatedDate: -1 }
  if (!filter) return products.list({ sort, pageNo: page, pageSize: PAGE_SIZE })
  try {
    return await products.list({ filter, sort, pageNo: page, pageSize: PAGE_SIZE })
  } catch {
    // The Blocks filter grammar is not documented (spec 0002 L10). If the gateway
    // rejects operator filters, search the first 500 products in the browser.
    const { items } = await products.list({ sort, pageSize: 500 })
    const needle = term.toLowerCase()
    const matches = items.filter(
      (item) =>
        (showInactive || item.isActive !== false) &&
        (!needle ||
          item.name.toLowerCase().startsWith(needle) ||
          item.sku.toLowerCase().startsWith(needle))
    )
    const start = (page - 1) * PAGE_SIZE
    return { items: matches.slice(start, start + PAGE_SIZE), totalCount: matches.length }
  }
}

function useDebounced<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

export function ProductsPage() {
  const canEdit = useCurrentUser().hasRole(...PRODUCT_EDITORS)
  const [query, setQuery] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [showInactive, setShowInactive] = React.useState(false)
  const term = useDebounced(query.trim(), 250)
  const [selected, setSelected] = React.useState<Product>()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [scan, setScan] = React.useState("")
  const [scanning, setScanning] = React.useState(false)

  React.useEffect(() => setPage(1), [term, showInactive])

  const list = useResource(() => searchProducts(term, page, showInactive), [term, page, showInactive])
  const categoryList = useResource(() => categories.list({ pageSize: 500 }), [])
  const categoryOptions = categoryPaths(categoryList.data?.items ?? [])
  const defaultCategoryId = categoryList.data?.items.find((item) => item.isDefault)?.ItemId ?? ""
  const categoryLabel = (id?: string | null) =>
    categoryOptions.find((option) => option.value === id)?.label ?? ""

  const items = list.data?.items ?? []
  const total = list.data?.totalCount ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function openProduct(product?: Product) {
    setSelected(product)
    setDialogOpen(true)
  }

  // Scan to find (spec 0005 AC-3): an exact, indexed lookup on ProductBarcode.
  async function findByBarcode(event: React.FormEvent) {
    event.preventDefault()
    const code = normalizeBarcode(scan)
    if (!code) return
    setScanning(true)
    try {
      const { items: matches } = await productBarcodes.list({ filter: { barcode: code }, pageSize: 1 })
      const match = matches[0]
      if (!match) {
        toast.error(`No product has barcode ${code}`)
        return
      }
      const { items: found } = await products.list({ filter: { ItemId: match.productId }, pageSize: 1 })
      if (!found[0]) {
        toast.error("The barcode points to a product that no longer exists.")
        return
      }
      setScan("")
      openProduct(found[0])
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setScanning(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything you buy, sell, stock or provide as a service."
        actions={
          canEdit ? (
            <Button onClick={() => openProduct(undefined)}>
              <Plus aria-hidden /> New product
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            inputMode="search"
            aria-label="Search products by name or SKU"
            placeholder="Search by name or SKU"
            className="h-10 rounded-full pl-10"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <form onSubmit={findByBarcode} className="relative md:w-72">
          <ScanBarcode className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Find a product by barcode"
            placeholder={scanning ? "Looking up…" : "Scan a barcode, press Enter"}
            className="h-10 rounded-full pl-10 font-mono"
            inputMode="numeric"
            value={scan}
            onChange={(event) => setScan(event.target.value)}
            disabled={scanning}
          />
        </form>
        <Button
          variant={showInactive ? "default" : "secondary"}
          aria-pressed={showInactive}
          onClick={() => setShowInactive(!showInactive)}
        >
          {showInactive ? "Showing deactivated" : "Show deactivated"}
        </Button>
      </div>

      {list.error ? <ErrorBanner message={list.error} onRetry={list.reload} /> : null}

      <SectionCard className="p-0 md:p-0">
        {list.loading && !list.data ? (
          <div className="p-4">
            <LoadingRows rows={6} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Package}
            message={term ? `No products match “${term}”.` : "No products yet."}
            action={
              canEdit && !term ? (
                <Button onClick={() => openProduct(undefined)}>
                  <Plus aria-hidden /> Create product
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            {/* Card list on phones, table from md up (docs/DESIGN.md §7.4). */}
            <ul className="divide-y md:hidden">
              {items.map((product) => (
                <li key={product.ItemId}>
                  <button
                    type="button"
                    onClick={() => openProduct(product)}
                    className="flex w-full cursor-pointer flex-col gap-1 px-4 py-3 text-left hover:bg-accent"
                  >
                    <span className="font-semibold">{product.name}</span>
                    <span className="font-mono text-[13px] text-muted-foreground">{product.sku}</span>
                    <span className="text-xs text-muted-foreground">
                      {ITEM_TYPES.find((type) => type.value === product.itemType)?.label}
                      {categoryLabel(product.categoryId) ? ` · ${categoryLabel(product.categoryId)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className={headClass}>Name</TableHead>
                    <TableHead className={headClass}>SKU</TableHead>
                    <TableHead className={headClass}>Type</TableHead>
                    <TableHead className={cn(headClass, "hidden lg:table-cell")}>Category</TableHead>
                    <TableHead className={cn(headClass, "hidden lg:table-cell")}>Unit</TableHead>
                    <TableHead className={headClass}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((product) => (
                    <TableRow key={product.ItemId} className="h-11 cursor-pointer" onClick={() => openProduct(product)}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="font-mono text-[13px]">{product.sku}</TableCell>
                      <TableCell>{ITEM_TYPES.find((type) => type.value === product.itemType)?.label}</TableCell>
                      <TableCell className="hidden lg:table-cell">{categoryLabel(product.categoryId)}</TableCell>
                      <TableCell className="hidden lg:table-cell">{product.standardUom}</TableCell>
                      <TableCell>
                        {product.isActive === false ? (
                          <Badge variant="muted">
                            <Ban aria-hidden /> Deactivated
                          </Badge>
                        ) : (
                          <Badge variant="success">
                            <CircleCheck aria-hidden /> Active
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground num">
                {total} product{total === 1 ? "" : "s"} · page {page} of {pages}
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

      <ProductDialog
        product={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => void list.reload()}
        categoryOptions={categoryOptions}
        defaultCategoryId={defaultCategoryId}
        canEdit={canEdit}
      />
    </>
  )
}
