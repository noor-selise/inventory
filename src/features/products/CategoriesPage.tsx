import * as React from "react"
import { ChevronDown, ChevronRight, FolderPlus, FolderTree, MoreHorizontal, Package, PackageOpen, Pencil, Plus, Search, Star } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { AuditLine } from "@/components/app/audit"
import { FilterChips, KpiCard, KpiRow } from "@/components/app/data"
import { CheckboxField, SelectField, TextField } from "@/components/app/form"
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { PRODUCT_EDITORS } from "@/features/team/roles"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatNumber } from "@/lib/format"
import { categories, categoryPaths, createsCycle, products, type Category } from "./api"

// The category tree (spec 0005 AC-7): exactly one company default, names
// unique within a parent, no loops. Shown as an expandable tree with product
// counts, a search and filters (docs/DESIGN.md §6.3, §6.5).

type Filter = "all" | "top" | "used" | "empty"

type Node = { category: Category; depth: number; children: Node[]; own: number; total: number }

function buildTree(items: Category[], counts: Map<string, number>): Node[] {
  const byParent = new Map<string, Category[]>()
  const ids = new Set(items.map((item) => item.ItemId))
  for (const item of items) {
    // A parent that no longer exists puts the category at the top, never out of sight.
    const parent = item.parentId && ids.has(item.parentId) ? item.parentId : ""
    byParent.set(parent, [...(byParent.get(parent) ?? []), item])
  }
  const make = (parent: string, depth: number, seen: Set<string>): Node[] =>
    (byParent.get(parent) ?? [])
      .filter((item) => !seen.has(item.ItemId))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((category) => {
        const children = make(category.ItemId, depth + 1, new Set([...seen, category.ItemId]))
        const own = counts.get(category.ItemId) ?? 0
        return { category, depth, children, own, total: own + children.reduce((sum, child) => sum + child.total, 0) }
      })
  return make("", 0, new Set())
}

export function CategoriesPage() {
  const canEdit = useCurrentUser().hasRole(...PRODUCT_EDITORS)
  const loaded = useResource(async () => {
    const [categoryRows, productRows] = await Promise.all([categories.list({ pageSize: 500 }), products.list({ pageSize: 5000 })])
    const counts = new Map<string, number>()
    let uncategorized = 0
    for (const product of productRows.items) {
      if (product.isActive === false) continue
      if (product.categoryId) counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1)
      else uncategorized += 1
    }
    return { items: categoryRows.items, counts, uncategorized }
  }, [])
  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState<Filter>("all")
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())
  const [editing, setEditing] = React.useState<{ category?: Category; parentId?: string }>()

  const items = loaded.data?.items ?? []
  const counts = loaded.data?.counts ?? new Map<string, number>()
  const tree = React.useMemo(() => buildTree(items, counts), [items, counts])
  const paths = React.useMemo(() => categoryPaths(items), [items])
  const pathOf = (id?: string | null) => paths.find((path) => path.value === id)?.label ?? ""
  const defaultCategory = items.find((item) => item.isDefault)

  // Flatten for display. A search or filter shows matches with their path and skips collapsing.
  const term = search.trim().toLowerCase()
  const narrowed = Boolean(term) || filter !== "all"
  const rows: Node[] = []
  const walk = (nodes: Node[]) => {
    for (const node of nodes) {
      const matchesTerm = !term || pathOf(node.category.ItemId).toLowerCase().includes(term)
      const matchesFilter = filter === "all" || (filter === "top" ? node.depth === 0 : filter === "used" ? node.own > 0 : node.total === 0)
      if (!narrowed || (matchesTerm && matchesFilter)) rows.push(node)
      if (narrowed || !collapsed.has(node.category.ItemId)) walk(node.children)
    }
  }
  walk(tree)
  const all: Node[] = []
  const collect = (nodes: Node[]) => nodes.forEach((node) => (all.push(node), collect(node.children)))
  collect(tree)

  async function makeDefault(category: Category) {
    try {
      // Not atomic on Blocks (spec 0004): set the new default, then clear the old one.
      await categories.update(category.ItemId, { isDefault: true })
      for (const item of items) if (item.isDefault && item.ItemId !== category.ItemId) await categories.update(item.ItemId, { isDefault: false })
      toast.success(`${category.name} is now the default`)
      void loaded.reload()
    } catch (caught) {
      toast.error(errorMessage(caught))
    }
  }

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      <PageHeader
        title="Categories"
        description="Group products into a tree, like Hardware / Fasteners. New products start in the default category."
        actions={
          canEdit ? (
            <Button onClick={() => setEditing({})} disabled={!loaded.data}>
              <Plus aria-hidden /> New category
            </Button>
          ) : null
        }
      />
      {loaded.error ? <ErrorBanner message={loaded.error} onRetry={loaded.reload} /> : null}
      <KpiRow>
        <KpiCard label="Categories" value={formatNumber(items.length)} icon={FolderTree} hint={`${formatNumber(tree.length)} at the top level`} active={filter === "all"} onClick={() => setFilter("all")} />
        <KpiCard label="In use" value={formatNumber(all.filter((node) => node.own > 0).length)} icon={Package} hint="Hold products directly" active={filter === "used"} onClick={() => setFilter(filter === "used" ? "all" : "used")} />
        <KpiCard label="Empty" value={formatNumber(all.filter((node) => node.total === 0).length)} icon={PackageOpen} hint="No products, even below" active={filter === "empty"} onClick={() => setFilter(filter === "empty" ? "all" : "empty")} />
        <KpiCard label="Default" value={<span className="text-lg">{defaultCategory?.name ?? "None set"}</span>} icon={Star} tone={defaultCategory ? "default" : "warning"} hint={`${formatNumber(loaded.data?.uncategorized ?? 0)} products without a category`} />
      </KpiRow>

      <SectionCard className="p-0 md:p-0">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative md:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Search categories" placeholder="Search categories" value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 rounded-full pl-9" />
          </div>
          <FilterChips<Filter>
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: all.length },
              { value: "top", label: "Top level", count: tree.length },
              { value: "used", label: "With products", count: all.filter((node) => node.own > 0).length },
              { value: "empty", label: "Empty", count: all.filter((node) => node.total === 0).length },
            ]}
          />
        </div>

        {loaded.loading && !loaded.data ? (
          <div className="p-4">
            <LoadingRows />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            message={items.length ? "No categories match." : "No categories yet. Add one and make it the default."}
            action={
              canEdit && !items.length ? (
                <Button onClick={() => setEditing({})}>
                  <Plus aria-hidden /> New category
                </Button>
              ) : narrowed ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch("")
                    setFilter("all")
                  }}
                >
                  Clear filters
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="hidden h-9 items-center gap-3 bg-muted px-4 text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase md:flex">
              <span className="flex-1">Category</span>
              <span className="w-24 text-right">Products</span>
              <span className="w-28 text-right">Including below</span>
              <span className="w-10" />
            </div>
            <ul role="tree" aria-label="Categories">
              {rows.map((node) => {
                const { category } = node
                const hasChildren = node.children.length > 0
                const open = !collapsed.has(category.ItemId)
                return (
                  <li
                    key={category.ItemId}
                    role="treeitem"
                    aria-level={node.depth + 1}
                    aria-expanded={hasChildren && !narrowed ? open : undefined}
                    className="flex min-h-12 items-center gap-3 border-b px-4 py-2 transition-colors last:border-b-0 hover:bg-accent"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5" style={narrowed ? undefined : { paddingLeft: `${node.depth * 20}px` }}>
                      {hasChildren && !narrowed ? (
                        <button type="button" aria-label={open ? `Collapse ${category.name}` : `Expand ${category.name}`} onClick={() => toggle(category.ItemId)} className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground">
                          {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                        </button>
                      ) : (
                        <span className="size-6 shrink-0" aria-hidden />
                      )}
                      <FolderTree className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0">
                        <button type="button" disabled={!canEdit} onClick={() => setEditing({ category })} className="block max-w-full cursor-pointer truncate text-left font-medium hover:underline disabled:cursor-default disabled:no-underline">
                          {category.name}
                        </button>
                        {narrowed && category.parentId ? <span className="block truncate text-xs text-muted-foreground">{pathOf(category.parentId)}</span> : null}
                      </span>
                      {category.isDefault ? (
                        <Badge variant="success" className="ml-1 shrink-0">
                          <Star aria-hidden /> Default
                        </Badge>
                      ) : null}
                    </span>
                    <span className="w-24 shrink-0 text-right text-sm num">{formatNumber(node.own)}</span>
                    <span className="hidden w-28 shrink-0 text-right text-sm text-muted-foreground num md:block">{formatNumber(node.total)}</span>
                    <span className="w-10 shrink-0 text-right">
                      {canEdit ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${category.name}`}>
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing({ category })}>
                              <Pencil aria-hidden /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setEditing({ parentId: category.ItemId })}>
                              <FolderPlus aria-hidden /> Add subcategory
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={Boolean(category.isDefault)} onSelect={() => void makeDefault(category)}>
                              <Star aria-hidden /> Make default
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </SectionCard>

      {editing ? (
        <CategoryDialog
          category={editing.category}
          parentId={editing.parentId}
          items={items}
          paths={paths}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined)
            void loaded.reload()
          }}
        />
      ) : null}
    </>
  )
}

/** Add or edit one category: name, where it sits (with a live path preview), and whether it is the default. */
function CategoryDialog({
  category,
  parentId: startParent,
  items,
  paths,
  onClose,
  onSaved,
}: {
  category?: Category
  parentId?: string
  items: Category[]
  paths: { value: string; label: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const noDefaultYet = !items.some((item) => item.isDefault)
  const [name, setName] = React.useState(category?.name ?? "")
  const [parentId, setParentId] = React.useState(category?.parentId ?? startParent ?? "")
  const [isDefault, setIsDefault] = React.useState(Boolean(category?.isDefault) || (!category && noDefaultYet))
  const [touched, setTouched] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string>()

  // A category cannot move under itself or anything below it.
  const parentOptions = paths.filter((path) => !category || (path.value !== category.ItemId && !createsCycle(items, category.ItemId, path.value)))
  const parentPath = paths.find((path) => path.value === parentId)?.label
  const preview = [parentPath, name.trim() || "New category"].filter(Boolean).join(" / ")
  const clash = items.some((item) => item.ItemId !== category?.ItemId && item.name.trim().toLowerCase() === name.trim().toLowerCase() && (item.parentId ?? "") === parentId)
  const nameError = !name.trim() ? "Enter a name." : clash ? "A category with this name already exists here." : undefined
  const wasOnlyDefault = Boolean(category?.isDefault)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (nameError) return
    if (!isDefault && !items.some((item) => item.isDefault && item.ItemId !== category?.ItemId)) {
      setSaveError("One category must be the default. Turn on “Default for new products”, or make another category the default first.")
      return
    }
    setSaving(true)
    setSaveError(undefined)
    try {
      let id = category?.ItemId
      if (category) {
        // Blocks ignores null in an update, so an empty parent is sent as "" to move it to the top.
        await categories.update(category.ItemId, { name: name.trim(), parentId: parentId || "", isDefault })
      } else {
        id = await categories.create({ name: name.trim(), parentId: parentId || null, isDefault })
      }
      if (isDefault) for (const item of items) if (item.isDefault && item.ItemId !== id) await categories.update(item.ItemId, { isDefault: false })
      toast.success(category ? "Category saved" : `Added ${preview}`)
      onSaved()
    } catch (caught) {
      setSaveError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>Products are filed under categories; a category can sit inside another.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-5" noValidate>
          {saveError ? <ErrorBanner message={saveError} /> : null}
          <TextField id="category-name" label="Name" required autoFocus value={name} onChange={setName} error={touched ? nameError : undefined} placeholder="For example: Fasteners" />
          <SelectField
            id="category-parent"
            label="Inside"
            options={parentOptions}
            value={parentId}
            onChange={setParentId}
            allowNone
            placeholder="Top level"
            helper="Leave on None to keep it at the top level."
          />
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2.5 text-sm" aria-live="polite">
            <FolderTree className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">Will appear as </span>
              <span className="font-medium">{preview}</span>
            </span>
          </div>
          <div className="rounded-md border p-3">
            <CheckboxField
              id="category-default"
              label="Default for new products"
              checked={isDefault}
              disabled={wasOnlyDefault}
              onChange={setIsDefault}
              helper={wasOnlyDefault ? "This is the default. To change it, make another category the default." : "New products start in this category. Only one category can be the default."}
            />
          </div>
          {category ? <AuditLine record={category} /> : null}
          <DialogFooter className="gap-2 border-t pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="min-w-28">
              {saving ? "Saving…" : category ? "Save" : "Add category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
