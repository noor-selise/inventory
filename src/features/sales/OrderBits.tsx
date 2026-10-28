import { Ban, CircleAlert, CircleCheck, CircleDashed, CircleDot, FileText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { formatMoney } from "@/lib/format"
import type { InventoryStatus, OrderEvent, PaymentStatus } from "./api"
import { formatDateTime } from "@/components/app/audit"

// Small pieces the sales, purchasing and payment screens share.

export { tableHead as headClass } from "@/components/app/table"

type Variant = "success" | "info" | "neutral" | "warning" | "destructive" | "muted"

const INVENTORY: Record<InventoryStatus, { label: string; variant: Variant; icon: typeof CircleCheck }> = {
  quote: { label: "Quote", variant: "muted", icon: FileText },
  unconfirmed: { label: "Unconfirmed", variant: "warning", icon: CircleAlert },
  unapproved: { label: "Unapproved", variant: "warning", icon: CircleAlert },
  unfulfilled: { label: "Unfulfilled", variant: "neutral", icon: CircleDashed },
  started: { label: "Started", variant: "info", icon: CircleDot },
  fulfilled: { label: "Fulfilled", variant: "success", icon: CircleCheck },
  cancelled: { label: "Cancelled", variant: "muted", icon: Ban },
}

const PAYMENT: Record<PaymentStatus, { label: string; variant: Variant; icon: typeof CircleCheck }> = {
  quote: { label: "Quote", variant: "muted", icon: FileText },
  unconfirmed: { label: "Unconfirmed", variant: "warning", icon: CircleAlert },
  unapproved: { label: "Unapproved", variant: "warning", icon: CircleAlert },
  uninvoiced: { label: "Uninvoiced", variant: "neutral", icon: CircleDashed },
  invoiced: { label: "Invoiced", variant: "info", icon: CircleDot },
  unpaid: { label: "Unpaid", variant: "neutral", icon: CircleDashed },
  partial: { label: "Partly paid", variant: "warning", icon: CircleDot },
  paid: { label: "Paid", variant: "success", icon: CircleCheck },
  owing: { label: "Owing", variant: "destructive", icon: CircleAlert },
  cancelled: { label: "Cancelled", variant: "muted", icon: Ban },
}

export function InventoryBadge({ status }: { status?: InventoryStatus | null }) {
  const entry = INVENTORY[status ?? "unfulfilled"] ?? INVENTORY.unfulfilled
  return (
    <Badge variant={entry.variant}>
      <entry.icon aria-hidden /> {entry.label}
    </Badge>
  )
}

export function PaymentBadge({ status }: { status?: PaymentStatus | null }) {
  const entry = PAYMENT[status ?? "uninvoiced"] ?? PAYMENT.uninvoiced
  return (
    <Badge variant={entry.variant}>
      <entry.icon aria-hidden /> {entry.label}
    </Badge>
  )
}

export function TotalsBlock({ rows, currency }: { rows: { label: string; value: number; strong?: boolean }[]; currency: string }) {
  return (
    <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className={row.strong ? "font-semibold" : "text-muted-foreground"}>{row.label}</dt>
          <dd className={`text-right num ${row.strong ? "font-semibold" : ""}`}>{formatMoney(row.value, currency)}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HistoryList({ events, userName }: { events?: OrderEvent[] | null; userName?: (id?: string | null) => string }) {
  const rows = [...(events ?? [])].reverse()
  if (!rows.length) return <p className="text-sm text-muted-foreground">No history yet.</p>
  return (
    <ol className="flex flex-col gap-2">
      {rows.map((event, index) => (
        <li key={`${event.at}-${index}`} className="flex flex-col gap-0.5 border-b pb-2 text-sm last:border-0">
          <span className="font-semibold first-letter:uppercase">{event.action}</span>
          {event.details ? <span className="text-muted-foreground">{event.details}</span> : null}
          <span className="text-xs text-muted-foreground">
            {formatDateTime(event.at)}
            {event.by ? ` · ${userName?.(event.by) || event.by}` : ""}
          </span>
        </li>
      ))}
    </ol>
  )
}
