// Depreciation rules (spec 0028, Calculation rules). Pure functions with no
// app imports, so `node scripts/checks/depreciation.mjs` can run them. Money
// is worked in integer minor units (paisa) inside this file only; callers pass
// and get back ordinary 2 decimal amounts.

/** A month, as "YYYY-MM". Months compare correctly as strings. */
export type Period = string

export type CalcSetup = {
  /** First month this organization charges; always the first month of an income year. */
  startPeriod: Period
  /** 1 to 12; 7 for Bangladesh (July to June). */
  incomeYearStartMonth: number
}

export type CalcAsset = {
  ItemId: string
  classId: string
  /** Calendar day stored as UTC midnight ("YYYY-MM-DDT00:00:00Z"). */
  inServiceDate: string
  cost: number
  /** Only for assets in service before the start period: WDV as at the start period. */
  openingWdv?: number | null
  status?: string | null
  disposalDate?: string | null
  disposalAmount?: number | null
}

export type CalcEntry = {
  assetId: string
  period: Period
  classId: string
  ratePercent: number
  base: number
  amount: number
  closingWdv: number
}

export type Charge = Omit<CalcEntry, "assetId"> & { incomeYear: string }

/** Rounds half away from zero to a whole minor unit. Not the same as round2 in order-math. */
export function roundMinor(value: number) {
  const magnitude = Math.floor(Math.abs(value) + 0.5 + 1e-9)
  return value < 0 ? -magnitude : magnitude
}

export const toMinor = (amount: number) => roundMinor(amount * 100)
export const fromMinor = (minor: number) => minor / 100

const pad = (value: number) => String(value).padStart(2, "0")

/** The month of a stored calendar day, from its date part only. */
export const periodOfDate = (day: string) => day.slice(0, 7)

/** "YYYY-MM-DD" for an instant in a time zone (a receipt's time, today). */
export function dayInZone(instant: string | Date, timeZone: string) {
  const date = typeof instant === "string" ? new Date(instant) : instant
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

/** A calendar day as the stored DateTime value. */
export const storedDay = (day: string) => `${day.slice(0, 10)}T00:00:00Z`

export function addMonths(period: Period, months: number): Period {
  const [year, month] = period.split("-").map(Number)
  const index = year * 12 + (month - 1) + months
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

export const firstDayOf = (period: Period) => `${period}-01`

export function incomeYearStart(period: Period, startMonth: number): Period {
  const [year, month] = period.split("-").map(Number)
  return `${month >= startMonth ? year : year - 1}-${pad(startMonth)}`
}

export const incomeYearEnd = (period: Period, startMonth: number) => addMonths(incomeYearStart(period, startMonth), 11)

/** "2026-27" for a July start, "2026" when the year starts in January. */
export function incomeYearLabel(period: Period, startMonth: number) {
  const year = Number(incomeYearStart(period, startMonth).slice(0, 4))
  return startMonth === 1 ? String(year) : `${year}-${pad((year + 1) % 100)}`
}

/** The start period when nothing is closed yet, else the month after the latest closed one. */
export const nextOpenMonth = (setup: CalcSetup, latestClosed: Period | "" | null | undefined) =>
  latestClosed ? addMonths(latestClosed, 1) : setup.startPeriod

export const initialValue = (asset: CalcAsset) => (asset.openingWdv ?? null) !== null ? Number(asset.openingWdv) : Number(asset.cost)

export function firstChargeMonth(asset: CalcAsset, setup: CalcSetup): Period {
  const inService = periodOfDate(asset.inServiceDate)
  return inService > setup.startPeriod ? inService : setup.startPeriod
}

/**
 * The disposal day when the asset is disposed. An undone disposal keeps its old
 * date on the record (Blocks ignores null in an update), so status decides.
 */
export const disposedOn = (asset: CalcAsset) => (asset.status === "disposed" && asset.disposalDate ? asset.disposalDate : null)

/** In use for a month: on or after the first charge month, and not disposed in or before it. */
export function isInUse(asset: CalcAsset, period: Period, setup: CalcSetup) {
  if (period < firstChargeMonth(asset, setup)) return false
  const disposal = disposedOn(asset)
  if (disposal && period >= periodOfDate(disposal)) return false
  return true
}

const byPeriod = (a: { period: Period }, b: { period: Period }) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0)

/** WDV before `period`: the latest entry before it, else the initial value. */
export function wdvBefore(asset: CalcAsset, entries: CalcEntry[], period: Period) {
  const prior = entries.filter((entry) => entry.assetId === asset.ItemId && entry.period < period).sort(byPeriod)
  return prior.length ? prior[prior.length - 1].closingWdv : initialValue(asset)
}

/**
 * The entry for `period`, or null when the asset is not in use or has no value
 * left. `entries` are the asset's counted entries; they must include its latest
 * entry before the income year starts (for the year base). The year keeps the
 * rate of its first entry, so a mid year rate or class edit takes effect next
 * year. Cumulative rounding makes each year total round(base × rate × months).
 */
export function chargeFor(asset: CalcAsset, entries: CalcEntry[], period: Period, classRate: number, setup: CalcSetup): Charge | null {
  if (!isInUse(asset, period, setup)) return null
  const own = entries.filter((entry) => entry.assetId === asset.ItemId && entry.period < period).sort(byPeriod)
  const before = own.length ? own[own.length - 1].closingWdv : initialValue(asset)
  const beforeMinor = toMinor(before)
  if (beforeMinor <= 0) return null
  const yearStart = incomeYearStart(period, setup.incomeYearStartMonth)
  const priorYears = own.filter((entry) => entry.period < yearStart)
  const thisYear = own.filter((entry) => entry.period >= yearStart)
  const base = priorYears.length ? priorYears[priorYears.length - 1].closingWdv : initialValue(asset)
  const baseMinor = toMinor(base)
  const ratePercent = thisYear.length ? thisYear[0].ratePercent : classRate
  const classId = thisYear.length ? thisYear[0].classId : asset.classId
  const k = thisYear.length + 1
  const raw = roundMinor((baseMinor * ratePercent * k) / 1200) - roundMinor((baseMinor * ratePercent * (k - 1)) / 1200)
  const amountMinor = Math.max(0, Math.min(raw, beforeMinor))
  if (amountMinor <= 0) return null
  return {
    period,
    incomeYear: incomeYearLabel(period, setup.incomeYearStartMonth),
    classId,
    ratePercent,
    base: fromMinor(baseMinor),
    amount: fromMinor(amountMinor),
    closingWdv: fromMinor(beforeMinor - amountMinor),
  }
}

export type ScheduleRow = {
  opening: number
  additions: number
  depreciation: number
  disposalWdv: number
  disposalAmount: number
  closing: number
}

/**
 * One asset's line in an income year (spec 0028 AC-13), from counted entries.
 * opening + additions − depreciation − disposalWdv = closing, always. Null
 * when the asset has nothing to show in that year.
 */
export function scheduleRow(asset: CalcAsset, entries: CalcEntry[], anyPeriodInYear: Period, setup: CalcSetup): ScheduleRow | null {
  const yearStart = incomeYearStart(anyPeriodInYear, setup.incomeYearStartMonth)
  const yearEnd = addMonths(yearStart, 11)
  if (yearEnd < setup.startPeriod) return null
  const inService = periodOfDate(asset.inServiceDate)
  if (inService > yearEnd) return null
  const disposalDay = disposedOn(asset)
  const disposal = disposalDay ? periodOfDate(disposalDay) : null
  if (disposal && disposal < yearStart) return null
  const own = entries.filter((entry) => entry.assetId === asset.ItemId)
  const isNew = (asset.openingWdv ?? null) === null && inService >= yearStart
  const opening = isNew ? 0 : toMinor(wdvBefore(asset, own, yearStart))
  const additions = isNew ? toMinor(asset.cost) : 0
  const depreciation = own.filter((entry) => entry.period >= yearStart && entry.period <= yearEnd).reduce((sum, entry) => sum + toMinor(entry.amount), 0)
  const disposedNow = disposal !== null && disposal <= yearEnd
  const disposalWdv = disposedNow ? opening + additions - depreciation : 0
  return {
    opening: fromMinor(opening),
    additions: fromMinor(additions),
    depreciation: fromMinor(depreciation),
    disposalWdv: fromMinor(disposalWdv),
    disposalAmount: disposedNow ? Number(asset.disposalAmount ?? 0) : 0,
    closing: fromMinor(opening + additions - depreciation - disposalWdv),
  }
}

/** Gain (positive) or loss on disposal: amount received minus WDV before the disposal month. */
export function disposalGain(asset: CalcAsset, entries: CalcEntry[]) {
  const disposal = disposedOn(asset)
  if (!disposal) return null
  const wdv = wdvBefore(asset, entries, periodOfDate(disposal))
  return fromMinor(toMinor(Number(asset.disposalAmount ?? 0)) - toMinor(wdv))
}
