import * as React from "react"
import { CalendarDays, X } from "lucide-react"
import { endOfMonth, endOfQuarter, endOfYear, format, isValid, parse, startOfMonth, startOfQuarter, startOfYear, subDays, subMonths } from "date-fns"
import type { DateRange } from "react-day-picker"

import { FieldShell } from "@/components/app/form"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// Calendar pickers for every date the app asks for. Values stay the plain
// "yyyy-MM-dd" strings the forms already use, read and written in local time,
// so a picker drops in where a date input was.

const VALUE_FORMAT = "yyyy-MM-dd"

export function toDate(value?: string | null) {
  if (!value) return undefined
  const date = parse(value.slice(0, 10), VALUE_FORMAT, new Date())
  return isValid(date) ? date : undefined
}

export function toValue(date?: Date) {
  return date ? format(date, VALUE_FORMAT) : ""
}

const show = (date?: Date) => (date ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date) : "")

/** Formats a "yyyy-MM-dd" value as a local day, so it never shifts a day across time zones. */
export const formatDay = (value?: string | null) => show(toDate(value))

const triggerClass =
  "flex h-full min-h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-left text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30"

type PickerProps = {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** Shows a clear button; leave off for required dates. */
  clearable?: boolean
  min?: string
  max?: string
  className?: string
  "aria-label"?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

/** A date button that opens a calendar, with month and year jumps, Today and Clear. */
export function DatePicker({ id, value, onChange, placeholder = "Pick a date", disabled, clearable, min, max, className, ...aria }: PickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = toDate(value)
  const [month, setMonth] = React.useState<Date | undefined>(selected)
  const fromDate = toDate(min)
  const toDateLimit = toDate(max)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setMonth(selected ?? new Date())
      }}
    >
      <div className={cn("relative", className)}>
        <PopoverTrigger asChild>
          <button id={id} type="button" disabled={disabled} className={cn(triggerClass, clearable && value && "pr-8")} {...aria}>
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? show(selected) : placeholder}</span>
          </button>
        </PopoverTrigger>
        {clearable && value && !disabled ? (
          <button type="button" aria-label="Clear date" className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground" onClick={() => onChange("")}>
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selected}
          month={month}
          onMonthChange={setMonth}
          startMonth={new Date(2000, 0)}
          endMonth={new Date(new Date().getFullYear() + 10, 11)}
          disabled={[...(fromDate ? [{ before: fromDate }] : []), ...(toDateLimit ? [{ after: toDateLimit }] : [])]}
          onSelect={(date) => {
            onChange(toValue(date))
            setOpen(false)
          }}
          autoFocus
        />
        <div className="flex items-center justify-between gap-2 border-t p-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange(toValue(new Date()))
              setOpen(false)
            }}
          >
            Today
          </Button>
          {clearable ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange("")
                setOpen(false)
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** DatePicker with a visible label, helper and error, like TextField. */
export function DateField({
  id,
  label,
  value,
  onChange,
  required,
  helper,
  error,
  className,
  ...rest
}: Omit<PickerProps, "aria-label" | "aria-invalid" | "aria-describedby" | "className"> & { label: string; required?: boolean; helper?: string; error?: string; className?: string }) {
  return (
    <FieldShell id={id} label={label} required={required} helper={helper} error={error} className={className}>
      <DatePicker
        id={id}
        value={value}
        onChange={onChange}
        clearable={!required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : helper ? `${id}-helper` : undefined}
        {...rest}
      />
    </FieldShell>
  )
}

// Date range with quick presets, for reports and lists.

export type DateRangeValue = { from?: string; to?: string }

export const RANGE_PRESETS: { key: string; label: string; range: () => DateRangeValue }[] = [
  { key: "today", label: "Today", range: () => ({ from: toValue(new Date()), to: toValue(new Date()) }) },
  { key: "yesterday", label: "Yesterday", range: () => ({ from: toValue(subDays(new Date(), 1)), to: toValue(subDays(new Date(), 1)) }) },
  { key: "7d", label: "Last 7 days", range: () => ({ from: toValue(subDays(new Date(), 6)), to: toValue(new Date()) }) },
  { key: "30d", label: "Last 30 days", range: () => ({ from: toValue(subDays(new Date(), 29)), to: toValue(new Date()) }) },
  { key: "month", label: "This month", range: () => ({ from: toValue(startOfMonth(new Date())), to: toValue(endOfMonth(new Date())) }) },
  { key: "last-month", label: "Last month", range: () => ({ from: toValue(startOfMonth(subMonths(new Date(), 1))), to: toValue(endOfMonth(subMonths(new Date(), 1))) }) },
  { key: "quarter", label: "This quarter", range: () => ({ from: toValue(startOfQuarter(new Date())), to: toValue(endOfQuarter(new Date())) }) },
  { key: "year", label: "This year", range: () => ({ from: toValue(startOfYear(new Date())), to: toValue(endOfYear(new Date())) }) },
  { key: "all", label: "All time", range: () => ({}) },
]

function rangeLabel(value: DateRangeValue) {
  const from = toDate(value.from)
  const to = toDate(value.to)
  const preset = RANGE_PRESETS.find((item) => {
    const range = item.range()
    return range.from === (value.from || undefined) && range.to === (value.to || undefined)
  })
  if (preset) return preset.label
  if (from && to) return `${show(from)} to ${show(to)}`
  if (from) return `From ${show(from)}`
  if (to) return `Until ${show(to)}`
  return "All time"
}

/** A range button that opens presets beside a two month calendar. */
export function DateRangeField({ id, label, value, onChange, className }: { id: string; label: string; value: DateRangeValue; onChange: (value: DateRangeValue) => void; className?: string }) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<DateRange | undefined>()
  const [month, setMonth] = React.useState<Date>(new Date())

  function openWith(next: boolean) {
    setOpen(next)
    if (!next) return
    const from = toDate(value.from)
    setDraft(from || value.to ? { from, to: toDate(value.to) } : undefined)
    setMonth(subMonths(toDate(value.to) ?? from ?? new Date(), from && toDate(value.to) && from.getMonth() !== toDate(value.to)!.getMonth() ? 1 : 0))
  }

  function apply(range: DateRangeValue) {
    onChange(range)
    setOpen(false)
  }

  return (
    <FieldShell id={id} label={label} className={className}>
      <Popover open={open} onOpenChange={openWith}>
        <PopoverTrigger asChild>
          <button id={id} type="button" className={triggerClass}>
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{rangeLabel(value)}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="start">
          <div className="flex flex-col sm:flex-row">
            <ul className="flex gap-1 overflow-x-auto border-b p-2 sm:w-40 sm:flex-col sm:overflow-visible sm:border-r sm:border-b-0" aria-label="Quick ranges">
              {RANGE_PRESETS.map((preset) => (
                <li key={preset.key}>
                  <button
                    type="button"
                    className={cn("w-full rounded-sm px-2 py-1.5 text-left text-sm whitespace-nowrap hover:bg-accent", rangeLabel(value) === preset.label && "bg-accent font-semibold")}
                    onClick={() => apply(preset.range())}
                  >
                    {preset.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-col">
              <Calendar mode="range" numberOfMonths={2} month={month} onMonthChange={setMonth} selected={draft} onSelect={setDraft} className="hidden md:block" />
              <Calendar mode="range" numberOfMonths={1} month={month} onMonthChange={setMonth} selected={draft} onSelect={setDraft} className="md:hidden" />
              <div className="flex items-center justify-between gap-2 border-t p-2">
                <span className="text-xs text-muted-foreground">{draft?.from ? rangeLabel({ from: toValue(draft.from), to: toValue(draft.to ?? draft.from) }) : "Pick a start and end day"}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={!draft?.from} onClick={() => apply({ from: toValue(draft?.from), to: toValue(draft?.to ?? draft?.from) })}>
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </FieldShell>
  )
}
