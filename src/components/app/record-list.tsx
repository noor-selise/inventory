import * as React from "react"
import { Ban, CircleCheck, Inbox, Plus } from "lucide-react"
import { toast } from "sonner"

import { AuditLine } from "@/components/app/audit"
import {
  CheckboxField,
  SelectField,
  TextField,
  type Option,
} from "@/components/app/form"
import { EmptyState, ErrorBanner, LoadingRows } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { errorMessage, useResource } from "@/hooks/use-resource"
import type { Collection, Entity } from "@/lib/blocks/data"
import { cn } from "@/lib/utils"

// One list screen for simple lookup records: a table, an add/edit dialog,
// deactivate instead of delete, and an optional single default per list.

export type FieldDef = {
  name: string
  label: string
  type: "text" | "number" | "integer" | "checkbox" | "select" | "date"
  required?: boolean
  helper?: string
  options?: Option[]
  allowNone?: boolean
  mono?: boolean
  min?: number
  /** Field shows only when this returns true for the current form values. */
  visible?: (values: FormValues) => boolean
  span?: "full"
}

export type ColumnDef<T> = {
  label: string
  render: (record: T) => React.ReactNode
  numeric?: boolean
  className?: string
}

export type FormValues = Record<string, string | boolean>

type Props<T extends Entity> = {
  collection: Collection<T>
  noun: string
  fields: FieldDef[]
  columns: ColumnDef<T>[]
  canEdit: boolean
  emptyMessage: string
  defaults?: FormValues
  sort?: Record<string, 1 | -1>
  /** Name of a Boolean field that must be true on exactly one record. */
  defaultField?: string
  /** Name of a Boolean active flag. Rows can be deactivated and reactivated. */
  activeField?: string
  /** Rows where this returns true can be edited but never deactivated. */
  isLocked?: (record: T) => boolean
  validate?: (values: FormValues, items: T[], editing?: T) => string | undefined
  /** Called after any successful change, so sibling views can refresh. */
  onChanged?: () => void
}

function toFormValues(fields: FieldDef[], record: Record<string, unknown>): FormValues {
  const values: FormValues = {}
  for (const field of fields) {
    const raw = record[field.name]
    if (field.type === "checkbox") values[field.name] = raw === true
    else if (field.type === "date") values[field.name] = typeof raw === "string" ? raw.slice(0, 10) : ""
    else values[field.name] = raw === null || raw === undefined ? "" : String(raw)
  }
  return values
}

function toPayload(fields: FieldDef[], values: FormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of fields) {
    if (field.visible && !field.visible(values)) continue
    const raw = values[field.name]
    if (field.type === "checkbox") payload[field.name] = raw === true
    else if (field.type === "number" || field.type === "integer") {
      payload[field.name] = raw === "" ? null : Number(raw)
    } else if (field.type === "date") {
      payload[field.name] = raw ? new Date(`${String(raw)}T00:00:00Z`).toISOString() : null
    } else payload[field.name] = String(raw ?? "").trim() || null
  }
  return payload
}

function fieldError(field: FieldDef, values: FormValues): string | undefined {
  if (field.visible && !field.visible(values)) return undefined
  const raw = values[field.name]
  if (field.type === "checkbox") return undefined
  const text = String(raw ?? "").trim()
  if (field.required && !text) return `${field.label} is required.`
  if ((field.type === "number" || field.type === "integer") && text) {
    const number = Number(text)
    if (!Number.isFinite(number)) return `${field.label} must be a number.`
    if (field.type === "integer" && !Number.isInteger(number)) {
      return `${field.label} must be a whole number.`
    }
    if (field.min !== undefined && number < field.min) {
      return `${field.label} must be at least ${field.min}.`
    }
  }
  return undefined
}

export function RecordList<T extends Entity>({
  collection,
  noun,
  fields,
  columns,
  canEdit,
  emptyMessage,
  defaults = {},
  sort,
  defaultField,
  activeField,
  isLocked,
  validate,
  onChanged,
}: Props<T>) {
  const { data, error, loading, reload } = useResource(
    () => collection.list({ sort }),
    [collection]
  )
  const items = data?.items ?? []
  const [editing, setEditing] = React.useState<T | "new">()
  const [values, setValues] = React.useState<FormValues>({})
  const [touched, setTouched] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string>()

  function open(record: T | "new") {
    setEditing(record)
    setTouched(false)
    setSaveError(undefined)
    setValues(
      record === "new"
        ? { ...toFormValues(fields, {}), ...defaults }
        : toFormValues(fields, record as Record<string, unknown>)
    )
  }

  const errors = Object.fromEntries(
    fields.map((field) => [field.name, fieldError(field, values)])
  )
  const hasErrors = Object.values(errors).some(Boolean)

  async function save() {
    setTouched(true)
    if (hasErrors || !editing) return
    const current = editing === "new" ? undefined : editing
    const ruleError = validate?.(values, items, current)
    if (ruleError) {
      setSaveError(ruleError)
      return
    }
    setSaving(true)
    setSaveError(undefined)
    try {
      const payload = toPayload(fields, values)
      if (defaultField && payload[defaultField] === true) {
        // Not atomic on Blocks (spec 0004, §5.6): clear the old default first.
        for (const item of items) {
          const record = item as Record<string, unknown>
          if (record[defaultField] === true && item.ItemId !== current?.ItemId) {
            await collection.update(item.ItemId, { [defaultField]: false } as never)
          }
        }
      }
      if (current) await collection.update(current.ItemId, payload as never)
      else await collection.create(payload as never)
      toast.success(`${noun} saved`)
      setEditing(undefined)
      await reload()
      onChanged?.()
    } catch (caught) {
      const message = errorMessage(caught)
      setSaveError(
        /duplicate|E11000|unique/i.test(message)
          ? `A ${noun.toLowerCase()} with these details already exists.`
          : message
      )
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(record: T) {
    if (!activeField) return
    const active = (record as Record<string, unknown>)[activeField] !== false
    try {
      await collection.update(record.ItemId, { [activeField]: !active } as never)
      toast.success(active ? `${noun} deactivated` : `${noun} reactivated`)
      await reload()
      onChanged?.()
    } catch (caught) {
      toast.error(errorMessage(caught))
    }
  }

  const visibleFields = fields.filter((field) => !field.visible || field.visible(values))
  const current = editing && editing !== "new" ? editing : undefined

  return (
    <div>
      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}
      {canEdit ? (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => open("new")}>
            <Plus aria-hidden /> Add {noun.toLowerCase()}
          </Button>
        </div>
      ) : null}

      {loading && !data ? (
        <LoadingRows />
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} message={emptyMessage} />
      ) : (
        <div className="overflow-x-auto rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                {columns.map((column) => (
                  <TableHead
                    key={column.label}
                    className={cn(
                      "h-9 text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase",
                      column.numeric && "text-right"
                    )}
                  >
                    {column.label}
                  </TableHead>
                ))}
                {activeField ? (
                  <TableHead className="h-9 text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                    Status
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const record = item as Record<string, unknown>
                const active = !activeField || record[activeField] !== false
                return (
                  <TableRow
                    key={item.ItemId}
                    className={cn("h-11", canEdit && "cursor-pointer")}
                    onClick={canEdit ? () => open(item) : undefined}
                  >
                    {columns.map((column) => (
                      <TableCell
                        key={column.label}
                        className={cn(column.numeric && "text-right num", column.className)}
                      >
                        {column.render(item)}
                      </TableCell>
                    ))}
                    {activeField ? (
                      <TableCell>
                        {active ? (
                          <Badge variant="success">
                            <CircleCheck aria-hidden /> Active
                          </Badge>
                        ) : (
                          <Badge variant="muted">
                            <Ban aria-hidden /> Deactivated
                          </Badge>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing !== undefined} onOpenChange={(next) => !next && setEditing(undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{current ? `Edit ${noun.toLowerCase()}` : `Add ${noun.toLowerCase()}`}</DialogTitle>
            <DialogDescription>Fields marked * are required.</DialogDescription>
          </DialogHeader>
          <form
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            {saveError ? (
              <div className="sm:col-span-2">
                <ErrorBanner message={saveError} />
              </div>
            ) : null}
            {visibleFields.map((field) => {
              const id = `field-${field.name}`
              const error = touched ? errors[field.name] : undefined
              const span = field.span === "full" || field.type === "checkbox" ? "sm:col-span-2" : undefined
              if (field.type === "checkbox") {
                return (
                  <CheckboxField
                    key={field.name}
                    id={id}
                    label={field.label}
                    helper={field.helper}
                    checked={values[field.name] === true}
                    onChange={(checked) => setValues({ ...values, [field.name]: checked })}
                    className={span}
                  />
                )
              }
              if (field.type === "select") {
                return (
                  <SelectField
                    key={field.name}
                    id={id}
                    label={field.label}
                    required={field.required}
                    helper={field.helper}
                    error={error}
                    options={field.options ?? []}
                    allowNone={field.allowNone}
                    value={String(values[field.name] ?? "")}
                    onChange={(value) => setValues({ ...values, [field.name]: value })}
                    className={span}
                  />
                )
              }
              return (
                <TextField
                  key={field.name}
                  id={id}
                  label={field.label}
                  required={field.required}
                  helper={field.helper}
                  error={error}
                  mono={field.mono}
                  type={field.type === "text" ? "text" : field.type === "date" ? "date" : "number"}
                  inputMode={field.type === "integer" ? "numeric" : field.type === "number" ? "decimal" : undefined}
                  step={field.type === "number" ? "any" : undefined}
                  value={String(values[field.name] ?? "")}
                  onChange={(value) => setValues({ ...values, [field.name]: value })}
                  className={span}
                />
              )
            })}
            {current ? (
              <div className="sm:col-span-2">
                <AuditLine record={current} />
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:col-span-2">
              {current && activeField && !isLocked?.(current) ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="sm:mr-auto"
                  onClick={() => {
                    setEditing(undefined)
                    void toggleActive(current)
                  }}
                >
                  {(current as Record<string, unknown>)[activeField] === false ? "Reactivate" : "Deactivate"}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => setEditing(undefined)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="min-w-24">
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
