import type * as React from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Shared pieces for list screens, per docs/DESIGN.md: KPI cards (§6.4), filter
// chips (§6.5), the bulk action bar and mobile record cards (§6.3, §7.4).

type Tone = "default" | "success" | "warning" | "destructive" | "info"

const TONE_TEXT: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive-text",
  info: "text-info",
}

/** Overline label, tabular value, short hint. Clickable when it filters the list below. */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  active,
  onClick,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  tone?: Tone
  active?: boolean
  onClick?: () => void
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate label-overline">{label}</span>
        {Icon ? <Icon className={cn("size-4 shrink-0", TONE_TEXT[tone])} aria-hidden /> : null}
      </span>
      <span className={cn("mt-1 block truncate text-2xl font-semibold num", TONE_TEXT[tone])}>{value}</span>
      {hint ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{hint}</span> : null}
    </>
  )
  const base = "block w-full rounded-lg border bg-card p-4 text-left dark:border-transparent"
  if (!onClick) return <div className={base}>{body}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(base, "cursor-pointer transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", active && "ring-2 ring-primary/60")}
    >
      {body}
    </button>
  )
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">{children}</div>
}

/** Pill filter chips; selected is foreground on background (Green Deck rule). Scrolls on small screens. */
export function FilterChips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 shrink-0 cursor-pointer snap-start items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              selected ? "bg-foreground text-background" : "bg-secondary text-foreground hover:bg-accent"
            )}
          >
            {option.label}
            {option.count != null ? <span className={cn("num text-xs", selected ? "text-background/70" : "text-muted-foreground")}>{option.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/** Bottom bar that slides up while rows are selected (§6.3). */
export function BulkActionBar({ count, noun, onClear, children }: { count: number; noun: string; onClear: () => void; children: React.ReactNode }) {
  if (!count) return null
  return (
    <div role="region" aria-label="Selected rows" className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 md:left-16 lg:left-60 motion-safe:animate-in motion-safe:slide-in-from-bottom-4">
      <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 rounded-lg border bg-popover px-4 shadow-xl">
        <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={onClear}>
          <X aria-hidden />
        </Button>
        <span className="flex-1 truncate text-sm font-semibold">
          {count} {noun}
          {count === 1 ? "" : "s"} selected
        </span>
        <div className="flex shrink-0 gap-2">{children}</div>
      </div>
    </div>
  )
}

/** A table row as a stacked card on phones (§7.4): title and key number, badges, meta. */
export function RecordCard({
  title,
  value,
  badges,
  meta,
  onClick,
  selected,
  leading,
}: {
  title: React.ReactNode
  value?: React.ReactNode
  badges?: React.ReactNode
  meta?: React.ReactNode
  onClick?: () => void
  selected?: boolean
  leading?: React.ReactNode
}) {
  const content = (
    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate font-semibold">{title}</span>
        {value != null ? <span className="shrink-0 font-semibold num">{value}</span> : null}
      </span>
      {badges ? <span className="flex flex-wrap gap-1.5">{badges}</span> : null}
      {meta ? <span className="truncate text-xs text-muted-foreground">{meta}</span> : null}
    </span>
  )
  return (
    <li className={cn("flex items-start gap-3 border-b px-4 py-3 last:border-b-0", selected && "border-l-2 border-l-primary bg-primary/10")}>
      {leading}
      {onClick ? (
        <button type="button" onClick={onClick} className="flex min-w-0 flex-1 cursor-pointer text-left">
          {content}
        </button>
      ) : (
        content
      )}
    </li>
  )
}

/** How full stock is against a target, with the numbers beside the bar so color is never the only signal. */
export function StockMeter({ value, target, unit }: { value: number; target: number; unit?: string | null }) {
  const ratio = target > 0 ? Math.max(0, Math.min(1, value / target)) : value > 0 ? 1 : 0
  const tone = value <= 0 ? "bg-destructive" : ratio < 1 ? "bg-warning" : "bg-success"
  return (
    <span className="flex min-w-32 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold num">
          {value.toLocaleString()} {unit ?? ""}
        </span>
        <span className="text-muted-foreground num">of {target.toLocaleString()}</span>
      </span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={target} aria-valuenow={value} aria-label="Stock against reorder point">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
    </span>
  )
}
