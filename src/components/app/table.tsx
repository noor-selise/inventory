import { cn } from "@/lib/utils"

/** Sticky table header row (DESIGN.md §6.3). */
export const tableHead = "h-9 label-overline"

/** Fixed layout keeps numeric and meta columns from stretching empty cells. */
export const tableFixed = "w-full table-fixed"

/** Shared column width + alignment tokens for data tables. */
export const tableCol = {
  /** Timestamp / date-time */
  when: "w-[11rem] max-w-[34%] whitespace-nowrap text-xs",
  /** Primary label + secondary mono line */
  primary: "min-w-0 w-auto max-w-[28%]",
  /** Location · bin · lot trail */
  trail: "min-w-0 hidden max-w-[16rem] lg:table-cell",
  /** Person / user — narrow, truncates */
  person: "hidden w-[6.5rem] max-w-[14%] truncate md:table-cell",
  /** Quantity delta with badge */
  delta: "w-[6.5rem] text-right",
  /** Running balance, amounts */
  num: "w-[5.5rem] text-right num tabular-nums",
  numWide: "w-[6.5rem] text-right num tabular-nums",
  /** Location name in quantity grids */
  location: "min-w-0 w-[28%]",
  /** Product name + SKU stack */
  product: "min-w-0 w-[26%]",
  bin: "w-[5.5rem] font-mono text-[13px]",
  mono: "hidden w-[6.5rem] font-mono text-[13px] md:table-cell",
  /** Partner / customer name in balance tables */
  name: "min-w-[9rem] w-[22%]",
  currency: "w-[3.5rem]",
  aging: "w-[4.5rem] text-right num tabular-nums",
  /** Document / payment number */
  docNumber: "w-[8rem] font-mono text-[13px] whitespace-nowrap",
  status: "w-[9rem]",
  role: "w-[11rem] min-w-[9rem]",
  limits: "hidden min-w-0 max-w-[14rem] lg:table-cell",
  actions: "w-[10.5rem] text-right whitespace-nowrap",
  reason: "hidden min-w-0 md:table-cell",
  lineCount: "hidden w-[4.5rem] text-right num lg:table-cell",
  select: "w-10",
  stockVs: "min-w-[10rem] w-[18%]",
  suggested: "w-[7rem] text-right",
  how: "hidden min-w-0 max-w-[12rem] lg:table-cell",
  paymentWho: "min-w-0 w-[24%]",
  paymentDate: "hidden w-[7.5rem] whitespace-nowrap md:table-cell",
  paymentType: "hidden w-[6.5rem] md:table-cell",
  paymentAmount: "w-[7rem] text-right num tabular-nums",
  paymentSplit: "hidden min-w-0 max-w-[14rem] lg:table-cell text-xs",
} as const

export function tableHeadClass(...extra: (string | false | undefined)[]) {
  return cn(tableHead, ...extra)
}

export function tableCellClass(...extra: (string | false | undefined)[]) {
  return cn("px-3 py-2 align-middle", ...extra)
}
