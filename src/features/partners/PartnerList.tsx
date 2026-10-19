import * as React from "react"
import { Ban, CircleCheck, Plus, Search, Users } from "lucide-react"

import { EmptyState, ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useResource } from "@/hooks/use-resource"
import type { Collection, Entity } from "@/lib/blocks/data"
import { cn } from "@/lib/utils"

// Searchable list for customers and vendors. Search is a server side prefix
// match on name (the gateway takes $regex filters, spec 0026 probe).

const headClass = "h-9 text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase"

type Named = Entity & { name: string; isActive?: boolean | null; email?: string | null; phone?: string | null }

export function PartnerList<T extends Named>({
  title,
  description,
  noun,
  source,
  canEdit,
  columns,
  renderDialog,
  scope,
}: {
  title: string
  description: string
  noun: string
  source: Collection<T>
  canEdit: boolean
  columns: { label: string; render: (row: T) => React.ReactNode; className?: string }[]
  renderDialog: (props: { record: T | undefined; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) => React.ReactNode
  /** Always applied, for example a sales rep's own customers. */
  scope?: Record<string, unknown>
}) {
  const [query, setQuery] = React.useState("")
  const [term, setTerm] = React.useState("")
  const [showInactive, setShowInactive] = React.useState(false)
  const [selected, setSelected] = React.useState<T>()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const id = window.setTimeout(() => setTerm(query.trim()), 250)
    return () => window.clearTimeout(id)
  }, [query])

  const { data, error, loading, reload } = useResource(() => {
    const filters: Record<string, unknown>[] = scope ? [scope] : []
    if (term) filters.push({ name: { $regex: `^${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, $options: "i" } })
    if (!showInactive) filters.push({ isActive: { $ne: false } })
    const filter = filters.length > 1 ? { $and: filters } : filters[0]
    return source.list({ filter, sort: { name: 1 }, pageSize: 200 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, term, showInactive, JSON.stringify(scope ?? null)])
  const rows = data?.items ?? []

  function openRecord(record?: T) {
    setSelected(record)
    setOpen(true)
  }

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          canEdit ? (
            <Button onClick={() => openRecord(undefined)}>
              <Plus aria-hidden /> New {noun.toLowerCase()}
            </Button>
          ) : null
        }
      />
      <div className="mb-4 flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label={`Search ${title.toLowerCase()} by name`}
            placeholder="Search by name"
            className="h-10 rounded-full pl-10"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button variant={showInactive ? "default" : "secondary"} aria-pressed={showInactive} onClick={() => setShowInactive(!showInactive)}>
          {showInactive ? "Showing deactivated" : "Show deactivated"}
        </Button>
      </div>
      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}
      <SectionCard className="p-0 md:p-0">
        {loading && !data ? (
          <div className="p-4">
            <LoadingRows />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} message={term ? `No ${title.toLowerCase()} match “${term}”.` : `No ${title.toLowerCase()} yet.`} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className={headClass}>Name</TableHead>
                  {columns.map((column) => (
                    <TableHead key={column.label} className={cn(headClass, column.className)}>
                      {column.label}
                    </TableHead>
                  ))}
                  <TableHead className={headClass}>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.ItemId} className="h-11 cursor-pointer" onClick={() => openRecord(row)}>
                    <TableCell>
                      <span className="block font-medium">{row.name}</span>
                      <span className="block text-xs text-muted-foreground">{[row.email, row.phone].filter(Boolean).join(" · ")}</span>
                    </TableCell>
                    {columns.map((column) => (
                      <TableCell key={column.label} className={column.className}>
                        {column.render(row)}
                      </TableCell>
                    ))}
                    <TableCell>
                      {row.isActive === false ? (
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
        )}
      </SectionCard>
      {renderDialog({ record: selected, open, onOpenChange: setOpen, onSaved: () => void reload() })}
    </>
  )
}
