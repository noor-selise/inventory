import { BlocksDataError } from "@/lib/blocks/data"
import { companies, type Company } from "@/features/settings/api"
import { withNextNumber } from "@/features/settings/numbering"
import type { Product } from "@/features/products/api"
import {
  addMonths,
  chargeFor,
  dayInZone,
  firstChargeMonth,
  incomeYearStart,
  isInUse,
  nextOpenMonth,
  periodOfDate,
  storedDay,
  toMinor,
  fromMinor,
  type CalcEntry,
  type CalcSetup,
  type Period,
} from "./calc"
import { presetFor } from "./presets"
import {
  allPages,
  depreciationClasses,
  depreciationEntries,
  depreciationRuns,
  fixedAssets,
  listClasses,
  listEntries,
  type DepreciationClass,
  type DepreciationEntry,
  type FixedAsset,
} from "./api"

// Depreciation actions (spec 0028). One control state per organization lives
// on the Company record and changes only by compare and set (spec 0026), so a
// close and a reopen can never run at once. Asset writes check that state
// before and after they write, and put the change back if a close started in
// between. Entries count only once their month is at or before the latest
// closed month.

export type DepreciationState = {
  company: Company
  setup: CalcSetup
  timeZone: string
  status: "open" | "closing" | "reopening"
  latestClosed: Period | ""
  activePeriod: Period | ""
  runId: string
  nextOpen: Period
  /** Today in the company time zone, "YYYY-MM-DD". */
  today: string
  /** The latest month that has fully ended in the company time zone. */
  lastEnded: Period
}

const CLOSE_STARTED = "A month close just started. Try again when it finishes."
const NOT_SET_UP = "Set the company's country for depreciation in Company settings first."

async function loadCompany() {
  const company = (await companies.list({ pageSize: 1 })).items[0]
  if (!company) throw new Error("Save your company profile in Company settings first.")
  return company
}

/** The organization's setup and control state, or null when no country is set yet (AC-2). */
export async function loadState(): Promise<DepreciationState | null> {
  const company = await loadCompany()
  if (!company.countryCode || !company.depreciationStartPeriod || !company.incomeYearStartMonth) return null
  const setup = { startPeriod: company.depreciationStartPeriod, incomeYearStartMonth: company.incomeYearStartMonth }
  const timeZone = company.timeZone || "UTC"
  const latestClosed = company.depreciationLatestClosed || ""
  const today = dayInZone(new Date(), timeZone)
  return {
    company,
    setup,
    timeZone,
    status: company.depreciationStatus || "open",
    latestClosed,
    activePeriod: company.depreciationActivePeriod || "",
    runId: company.depreciationRunId || "",
    nextOpen: nextOpenMonth(setup, latestClosed),
    today,
    lastEnded: addMonths(periodOfDate(today), -1),
  }
}

async function requireState() {
  const state = await loadState()
  if (!state) throw new Error(NOT_SET_UP)
  return state
}

function requireOpen(state: DepreciationState) {
  if (state.status !== "open") throw new Error(`${state.status === "closing" ? "A month close" : "A reopen"} is running. Try again when it finishes.`)
}

/** Writes, then checks the control state did not move; if it did, puts the change back. */
async function guarded<T>(state: DepreciationState, write: () => Promise<T>, revert: (result: T) => Promise<unknown>): Promise<T> {
  requireOpen(state)
  const result = await write()
  const after = await requireState()
  if (after.status !== "open" || after.latestClosed !== state.latestClosed) {
    await revert(result).catch(() => undefined)
    throw new Error(CLOSE_STARTED)
  }
  return result
}

/** Income years an organization may start in: the current one and the four before it. */
export function startPeriodOptions(timeZone: string, startMonth: number) {
  const current = incomeYearStart(periodOfDate(dayInZone(new Date(), timeZone)), startMonth)
  return [0, 1, 2, 3, 4].map((back) => addMonths(current, -12 * back))
}

// Setup (AC-1, AC-3) ------------------------------------------------------

export async function setupDepreciation(countryCode: string, startPeriod: Period) {
  const preset = presetFor(countryCode)
  if (!preset) throw new Error("Depreciation presets exist for Bangladesh only.")
  const company = await loadCompany()
  if (Number(startPeriod.slice(5, 7)) !== preset.incomeYearStartMonth) throw new Error("The start period must be the first month of an income year.")
  const closedAny = Boolean(company.depreciationLatestClosed) || (company.depreciationStatus && company.depreciationStatus !== "open")
  const changing = company.countryCode !== countryCode || company.depreciationStartPeriod !== startPeriod
  if (closedAny && changing) throw new Error("A month is already closed, so the country and start period are locked.")

  if (company.depreciationStartPeriod && company.depreciationStartPeriod !== startPeriod) {
    // Existing assets must still fit the opening WDV rule under the new start (AC-7).
    const assets = await allPages((pageNo, pageSize) => fixedAssets.list({ pageNo, pageSize }))
    const broken = assets.filter((asset) => {
      const before = periodOfDate(asset.inServiceDate) < startPeriod
      const hasOpening = (asset.openingWdv ?? null) !== null
      return before !== hasOpening
    })
    if (broken.length) {
      throw new Error(`These assets do not fit the new start period: ${broken.slice(0, 5).map((asset) => asset.assetNumber).join(", ")}${broken.length > 5 ? "…" : ""}. Fix or delete them first.`)
    }
  }

  // Classes first, Company last, so a half run setup never looks finished. Running it again only adds missing codes.
  const existing = new Set((await listClasses()).map((item) => item.code))
  for (const item of preset.classes) {
    if (existing.has(item.code)) continue
    try {
      await depreciationClasses.create({ code: item.code, name: item.name, method: "wdv", ratePercent: item.ratePercent, presetId: preset.id, isActive: true })
    } catch (error) {
      if (!(error instanceof BlocksDataError && error.isDuplicate)) throw error
    }
  }
  await companies.update(company.ItemId, {
    countryCode,
    depreciationPresetId: preset.id,
    incomeYearStartMonth: preset.incomeYearStartMonth,
    depreciationStartPeriod: startPeriod,
    ...(company.depreciationStatus ? {} : { depreciationStatus: "open", depreciationLatestClosed: "", depreciationActivePeriod: "", depreciationRunId: "" }),
  })
}

/** True once any month is closed or a close is running; the time zone locks then (AC-3). */
export const isLocked = (company?: Company) => Boolean(company?.depreciationLatestClosed) || Boolean(company?.depreciationStatus && company.depreciationStatus !== "open")

// Assets (AC-7, AC-11) ----------------------------------------------------

export type AssetDraft = {
  productId: string
  classId: string
  locationId: string
  cost: number
  /** "YYYY-MM-DD" */
  inServiceDay: string
  serialNumber?: string
  openingWdv?: number | null
}

function checkDraft(state: DepreciationState, draft: AssetDraft, product: Product | undefined, cls: DepreciationClass | undefined, editing?: FixedAsset) {
  if (!product || product.itemType !== "fixed_asset") throw new Error("Choose a fixed asset product.")
  if (!cls) throw new Error("Choose a depreciation class.")
  if (cls.isActive === false && cls.ItemId !== editing?.classId) throw new Error(`${cls.name} is inactive. Choose another class.`)
  if (!draft.locationId) throw new Error("Choose a location.")
  if (!(draft.cost >= 0) || !Number.isFinite(draft.cost)) throw new Error("Enter a cost of 0 or more.")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.inServiceDay)) throw new Error("Enter the in service date.")
  if (draft.inServiceDay > state.today) throw new Error("The in service date cannot be in the future.")
  const month = periodOfDate(draft.inServiceDay)
  const beforeStart = month < state.setup.startPeriod
  const hasOpening = draft.openingWdv !== null && draft.openingWdv !== undefined
  if (beforeStart) {
    if (state.latestClosed) throw new Error("Assets in service before the start period can be added only while no month is closed.")
    if (!hasOpening || !(Number(draft.openingWdv) >= 0) || Number(draft.openingWdv) > draft.cost) {
      throw new Error("Enter the opening WDV as at the start period, between 0 and the cost.")
    }
  } else {
    if (hasOpening) throw new Error("Only assets in service before the start period have an opening WDV.")
    if (month < state.nextOpen) throw new Error(`The in service date must be in ${state.nextOpen} or later; earlier months are closed.`)
  }
}

export async function createAsset(draft: AssetDraft, product: Product | undefined, cls: DepreciationClass | undefined) {
  const state = await requireState()
  checkDraft(state, draft, product, cls)
  return guarded(
    state,
    async () =>
      (
        await withNextNumber("fixed_asset", (assetNumber) =>
          fixedAssets.create({
            assetNumber,
            unitKey: `manual:${crypto.randomUUID()}`,
            productId: draft.productId,
            classId: draft.classId,
            locationId: draft.locationId,
            source: "manual",
            serialNumber: draft.serialNumber?.trim() || null,
            inServiceDate: storedDay(draft.inServiceDay),
            cost: fromMinor(toMinor(draft.cost)),
            ...(draft.openingWdv !== null && draft.openingWdv !== undefined ? { openingWdv: fromMinor(toMinor(draft.openingWdv)) } : {}),
            status: "active",
          })
        )
      ).result,
    (itemId) => fixedAssets.remove(itemId)
  )
}

/** Every entry for one asset, counted or not, oldest first. */
export const entriesFor = (assetId: string) =>
  allPages((pageNo, pageSize) => depreciationEntries.list({ filter: { assetId }, sort: { period: 1 }, pageNo, pageSize }))

/** Entries that count: their month is at or before the latest closed month. */
export const countedOnly = <T extends { period: string }>(entries: T[], latestClosed: string) => (latestClosed ? entries.filter((entry) => entry.period <= latestClosed) : [])

export async function updateAsset(asset: FixedAsset, draft: AssetDraft, product: Product | undefined, cls: DepreciationClass | undefined) {
  const state = await requireState()
  const moneyOrDate =
    toMinor(draft.cost) !== toMinor(asset.cost) ||
    storedDay(draft.inServiceDay) !== storedDay(asset.inServiceDate) ||
    (draft.openingWdv ?? null) !== (asset.openingWdv ?? null)
  if (moneyOrDate) {
    if ((await entriesFor(asset.ItemId)).length) throw new Error("This asset already has depreciation entries, so its cost and dates are fixed. Reopen the months first.")
    checkDraft(state, draft, product, cls, asset)
  } else if (!cls || (cls.isActive === false && cls.ItemId !== asset.classId)) {
    throw new Error("Choose an active depreciation class.")
  }
  const before = { classId: asset.classId, locationId: asset.locationId ?? "", serialNumber: asset.serialNumber ?? "", cost: asset.cost, inServiceDate: asset.inServiceDate, openingWdv: asset.openingWdv ?? undefined }
  const patch = {
    classId: draft.classId,
    locationId: draft.locationId,
    serialNumber: draft.serialNumber?.trim() ?? "",
    cost: fromMinor(toMinor(draft.cost)),
    inServiceDate: storedDay(draft.inServiceDay),
    ...(draft.openingWdv !== null && draft.openingWdv !== undefined ? { openingWdv: fromMinor(toMinor(draft.openingWdv)) } : {}),
  }
  await guarded(
    state,
    () => fixedAssets.update(asset.ItemId, patch),
    () => fixedAssets.update(asset.ItemId, before)
  )
}

/** Hand entered assets with no entries can be deleted; received ones are disposed of instead (AC-7). */
export async function deleteAsset(asset: FixedAsset) {
  const state = await requireState()
  if (asset.source !== "manual") throw new Error("Received assets cannot be deleted. Dispose of it instead.")
  if ((await entriesFor(asset.ItemId)).length) throw new Error("This asset has depreciation entries. Dispose of it instead.")
  requireOpen(state)
  await fixedAssets.remove(asset.ItemId)
  const after = await requireState()
  if (after.status !== "open" || after.latestClosed !== state.latestClosed) {
    throw new Error("The asset was deleted while a month close started. Reopen that month if its totals include this asset.")
  }
}

export type DisposalDraft = { type: "sold" | "scrapped"; day: string; amount: number }

export async function disposeAsset(asset: FixedAsset, draft: DisposalDraft) {
  const state = await requireState()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.day)) throw new Error("Enter the disposal date.")
  if (draft.day > state.today) throw new Error("The disposal date cannot be in the future.")
  if (draft.day < asset.inServiceDate.slice(0, 10)) throw new Error("The disposal date cannot be before the in service date.")
  if (periodOfDate(draft.day) < state.nextOpen) throw new Error(`The disposal date must be in ${state.nextOpen} or later; earlier months are closed.`)
  const amount = draft.type === "scrapped" ? 0 : draft.amount
  if (!(amount >= 0) || !Number.isFinite(amount)) throw new Error("Enter the amount received, 0 or more.")
  const before = { status: asset.status, disposalType: asset.disposalType ?? undefined, disposalDate: asset.disposalDate ?? undefined, disposalAmount: asset.disposalAmount ?? undefined }
  await guarded(
    state,
    () => fixedAssets.update(asset.ItemId, { status: "disposed", disposalType: draft.type, disposalDate: storedDay(draft.day), disposalAmount: fromMinor(toMinor(amount)) }),
    () => fixedAssets.update(asset.ItemId, before)
  )
}

export async function undoDisposal(asset: FixedAsset) {
  const state = await requireState()
  if (asset.status !== "disposed" || !asset.disposalDate) return
  if (periodOfDate(asset.disposalDate) < state.nextOpen) throw new Error("The disposal month is closed. Reopen it first.")
  await guarded(
    state,
    () => fixedAssets.update(asset.ItemId, { status: "active" }),
    () => fixedAssets.update(asset.ItemId, { status: "disposed" })
  )
}

// Close, reopen, preview (AC-9, AC-10) ------------------------------------

export type PreviewRow = { classId: string; code: string; name: string; count: number; total: number }

/** Every asset, and the counted entries `chargeFor` needs for `period`. */
async function inputsFor(state: DepreciationState, period: Period) {
  const [assets, classes] = await Promise.all([allPages((pageNo, pageSize) => fixedAssets.list({ pageNo, pageSize })), listClasses()])
  const yearStart = incomeYearStart(period, state.setup.incomeYearStartMonth)
  const before = addMonths(period, -1)
  // The window covers this year so far plus the last month of the previous year (the year base).
  const entries: CalcEntry[] = before >= state.setup.startPeriod ? await listEntries({ from: addMonths(yearStart, -1), to: before }) : []
  // An asset whose WDV reached 0 earlier has no entry in the window: fetch its latest one.
  const seen = new Set(entries.filter((entry) => entry.period < yearStart).map((entry) => entry.assetId))
  const thisYear = new Set(entries.map((entry) => entry.assetId))
  for (const asset of assets) {
    if (!isInUse(asset, period, state.setup)) continue
    if (firstChargeMonth(asset, state.setup) >= yearStart || seen.has(asset.ItemId) || thisYear.has(asset.ItemId)) continue
    const latest = (await depreciationEntries.list({ filter: { assetId: asset.ItemId, period: { $lt: yearStart } }, sort: { period: -1 }, pageSize: 1 })).items[0]
    if (latest) entries.push(latest)
  }
  return { assets, classes, entries }
}

function chargesFor(state: DepreciationState, period: Period, inputs: Awaited<ReturnType<typeof inputsFor>>) {
  const rate = new Map(inputs.classes.map((item) => [item.ItemId, item.ratePercent]))
  return inputs.assets.flatMap((asset) => {
    const charge = chargeFor(asset, inputs.entries, period, Number(rate.get(asset.classId) ?? 0), state.setup)
    return charge ? [{ asset, charge }] : []
  })
}

/** What closing the next month will write; null until depreciation is set up (AC-2). */
export async function previewMonth(): Promise<{ state: DepreciationState; period: Period; rows: PreviewRow[]; blocked?: string } | null> {
  const state = await loadState()
  if (!state) return null
  const period = state.status === "open" ? state.nextOpen : state.activePeriod || state.nextOpen
  const inputs = await inputsFor(state, period)
  const byClass = new Map<string, PreviewRow>()
  for (const { charge } of chargesFor(state, period, inputs)) {
    const cls = inputs.classes.find((item) => item.ItemId === charge.classId)
    const row = byClass.get(charge.classId) ?? { classId: charge.classId, code: cls?.code ?? "", name: cls?.name ?? "Unknown class", count: 0, total: 0 }
    row.count += 1
    row.total = fromMinor(toMinor(row.total) + toMinor(charge.amount))
    byClass.set(charge.classId, row)
  }
  const blocked = period > state.lastEnded ? `${period} has not ended yet in ${state.timeZone}.` : undefined
  return { state, period, rows: [...byClass.values()].sort((a, b) => a.code.localeCompare(b.code)), blocked }
}

async function stillMine(runId: string) {
  const company = await loadCompany()
  return company.depreciationRunId === runId
}

async function removeAll(entries: DepreciationEntry[], runId: string) {
  for (const [index, entry] of entries.entries()) {
    if (index % 50 === 0 && !(await stillMine(runId))) throw new Error("Another admin took over this run.")
    await depreciationEntries.remove(entry.ItemId)
  }
}

async function monthTotals(period: Period) {
  const rows = await listEntries({ from: period, to: period })
  return { count: rows.length, total: fromMinor(rows.reduce((sum, row) => sum + toMinor(row.amount), 0)), rows }
}

/** Swaps in a new run id, so an earlier browser still running this close or reopen stops at its next check. */
async function takeOver(state: DepreciationState) {
  const runId = crypto.randomUUID()
  const changed = await companies.updateWhere({ ItemId: state.company.ItemId, depreciationStatus: state.status, depreciationRunId: state.runId }, { depreciationRunId: runId })
  if (changed !== 1) throw new Error("Someone else just changed this run. Refresh and try again.")
  return runId
}

async function runClose(state: DepreciationState, period: Period, runId: string, by: string) {
  const write = async () => {
    const inputs = await inputsFor(state, period)
    const done = new Set((await listEntries({ from: period, to: period })).map((entry) => entry.assetId))
    let written = 0
    for (const { asset, charge } of chargesFor(state, period, inputs)) {
      if (done.has(asset.ItemId)) continue
      if (written % 50 === 0 && !(await stillMine(runId))) throw new Error("Another admin took over this close.")
      try {
        await depreciationEntries.create({ assetId: asset.ItemId, ...charge, runId })
      } catch (error) {
        if (!(error instanceof BlocksDataError && error.isDuplicate)) throw error
      }
      done.add(asset.ItemId)
      written++
    }
  }
  await write()
  // Sweep: an asset added just as the close started gets its entry too.
  await write()
  const totals = await monthTotals(period)
  await depreciationRuns.create({ action: "close", period, runId, by, at: new Date().toISOString(), assetCount: totals.count, total: totals.total })
  const finished = await companies.updateWhere(
    { ItemId: state.company.ItemId, depreciationStatus: "closing", depreciationRunId: runId },
    { depreciationStatus: "open", depreciationLatestClosed: period, depreciationActivePeriod: "" }
  )
  if (finished !== 1) throw new Error("Another admin took over this close.")
  return totals
}

/** Closes the next open month, or resumes a close that stopped halfway (AC-9). */
export async function closeMonth(by: string) {
  const state = await requireState()
  if (state.status === "closing") return runClose(state, state.activePeriod, await takeOver(state), by)
  requireOpen(state)
  const period = state.nextOpen
  if (period > state.lastEnded) throw new Error(`${period} has not ended yet in ${state.timeZone}.`)
  const runId = crypto.randomUUID()
  const claimed = await companies.updateWhere(
    // Before the first close the field is "" or, if Blocks dropped the empty string, missing.
    { ItemId: state.company.ItemId, depreciationStatus: "open", depreciationLatestClosed: state.latestClosed ? state.latestClosed : { $in: ["", null] } },
    { depreciationStatus: "closing", depreciationActivePeriod: period, depreciationRunId: runId }
  )
  if (claimed !== 1) throw new Error("Another admin just started a close or reopen. Refresh to see it.")
  // A fresh claim clears anything an older, abandoned run left in this month.
  await removeAll((await monthTotals(period)).rows, runId)
  return runClose({ ...state, status: "closing", activePeriod: period, runId }, period, runId, by)
}

async function runReopen(state: DepreciationState, period: Period, runId: string, by: string) {
  const totals = await monthTotals(period)
  await removeAll(totals.rows, runId)
  await depreciationRuns.create({ action: "reopen", period, runId, by, at: new Date().toISOString(), assetCount: totals.count, total: totals.total })
  const previous = period <= state.setup.startPeriod ? "" : addMonths(period, -1)
  const finished = await companies.updateWhere(
    { ItemId: state.company.ItemId, depreciationStatus: "reopening", depreciationRunId: runId },
    { depreciationStatus: "open", depreciationLatestClosed: previous, depreciationActivePeriod: "" }
  )
  if (finished !== 1) throw new Error("Another admin took over this reopen.")
}

/** Reopens the most recently closed month, or resumes a reopen that stopped halfway (AC-10). */
export async function reopenMonth(by: string) {
  const state = await requireState()
  if (state.status === "reopening") return runReopen(state, state.activePeriod, await takeOver(state), by)
  requireOpen(state)
  if (!state.latestClosed) throw new Error("No month is closed yet.")
  const period = state.latestClosed
  const runId = crypto.randomUUID()
  const claimed = await companies.updateWhere(
    { ItemId: state.company.ItemId, depreciationStatus: "open", depreciationLatestClosed: period },
    { depreciationStatus: "reopening", depreciationActivePeriod: period, depreciationRunId: runId }
  )
  if (claimed !== 1) throw new Error("Another admin just started a close or reopen. Refresh to see it.")
  await runReopen({ ...state, status: "reopening", activePeriod: period, runId }, period, runId, by)
}

export const listRuns = () => depreciationRuns.list({ sort: { at: -1 }, pageSize: 24 }).then((result) => result.items)
