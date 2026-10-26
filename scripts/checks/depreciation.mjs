// Checks the depreciation rules against spec 0028's scenarios.
//   node scripts/checks/depreciation.mjs
import assert from "node:assert/strict"
import {
  addMonths,
  chargeFor,
  dayInZone,
  disposalGain,
  incomeYearLabel,
  incomeYearStart,
  nextOpenMonth,
  roundMinor,
  scheduleRow,
} from "../../src/features/depreciation/calc.ts"

const setup = { startPeriod: "2026-07", incomeYearStartMonth: 7 }
const check = (name, fn) => {
  fn()
  console.log(`ok  ${name}`)
}

/** Closes months from..to in order like closeMonth does; `rateAt(period)` is the class rate at close time. */
function run(asset, from, to, rateAt, entries = []) {
  for (let period = from; period <= to; period = addMonths(period, 1)) {
    const charge = chargeFor(asset, entries, period, rateAt(period), setup)
    if (charge) entries.push({ assetId: asset.ItemId, ...charge })
  }
  return entries
}
const total = (entries, from, to) => Math.round(entries.filter((e) => e.period >= from && e.period <= to).reduce((sum, e) => sum + e.amount * 100, 0)) / 100

const laptop = { ItemId: "a1", classId: "COMPUTER", inServiceDate: "2026-09-15T00:00:00Z", cost: 120000 }

check("happy path: 2,500.00 a month, then cumulative rounding to 23,750.00", () => {
  const entries = run(laptop, "2026-07", "2028-06", () => 25)
  const first = entries.filter((e) => e.incomeYear === "2026-27")
  assert.equal(first.length, 10)
  assert.ok(first.every((e) => e.amount === 2500))
  assert.equal(first.at(-1).closingWdv, 95000)
  const second = entries.filter((e) => e.incomeYear === "2027-28")
  assert.deepEqual(second.slice(0, 3).map((e) => e.amount), [1979.17, 1979.16, 1979.17])
  assert.equal(total(entries, "2027-07", "2028-06"), 23750)
  assert.equal(second[0].base, 95000)
  assert.equal(second.at(-1).closingWdv, 71250)
})

check("a rate edit mid year waits for the next income year", () => {
  const entries = run(laptop, "2026-07", "2027-06", (period) => (period >= "2026-11" ? 20 : 25))
  assert.ok(entries.every((e) => e.ratePercent === 25))
  assert.equal(total(entries, "2026-07", "2027-06"), 25000)
  const next = chargeFor(laptop, entries, "2027-07", 20, setup)
  assert.equal(next.ratePercent, 20)
  assert.equal(next.amount, 1583.33)
})

check("WDV never goes below 0, and stops charging at 0", () => {
  const tiny = { ItemId: "t", classId: "c", inServiceDate: "2026-07-01T00:00:00Z", cost: 0, openingWdv: null }
  const entries = [{ assetId: "t", period: "2026-07", classId: "c", ratePercent: 30, base: 100, amount: 99, closingWdv: 1 }]
  // Base 100 at 30% gives 2.50 for month 2, capped at the 1.00 left.
  const charge = chargeFor({ ...tiny, cost: 100 }, entries, "2026-08", 30, setup)
  assert.equal(charge.amount, 1)
  assert.equal(charge.closingWdv, 0)
  entries.push({ assetId: "t", ...charge })
  assert.equal(chargeFor({ ...tiny, cost: 100 }, entries, "2026-09", 30, setup), null)
})

check("the disposal month and later months are not charged", () => {
  const truck = { ItemId: "v", classId: "VEH", inServiceDate: "2026-07-10T00:00:00Z", cost: 1200000, disposalDate: "2027-03-05T00:00:00Z", disposalAmount: 500000, status: "disposed" }
  const entries = run(truck, "2026-07", "2027-06", () => 10)
  assert.equal(entries.at(-1).period, "2027-02")
  assert.equal(entries.length, 8)
  assert.equal(disposalGain(truck, entries), 500000 - 1120000)
})

check("an undone disposal (status active, old date kept) charges again", () => {
  const back = { ItemId: "u", classId: "c", inServiceDate: "2026-07-01T00:00:00Z", cost: 1200, disposalDate: "2026-08-03T00:00:00Z", status: "active" }
  assert.equal(run(back, "2026-07", "2026-12", () => 10).length, 6)
})

check("in service and disposed in the same month: no charge", () => {
  const quick = { ItemId: "q", classId: "c", inServiceDate: "2026-08-02T00:00:00Z", cost: 1000, disposalDate: "2026-08-20T00:00:00Z", status: "disposed" }
  assert.equal(run(quick, "2026-07", "2026-12", () => 25).length, 0)
})

check("an asset in service before the start uses its opening WDV as base", () => {
  const old = { ItemId: "o", classId: "PLANT", inServiceDate: "2024-03-01T00:00:00Z", cost: 80000, openingWdv: 50000 }
  const entries = run(old, "2026-07", "2026-07", () => 10)
  assert.equal(entries[0].base, 50000)
  assert.equal(entries[0].amount, 416.67)
})

check("report rows satisfy opening + additions − depreciation − disposal = closing", () => {
  const assets = [
    laptop,
    { ItemId: "o", classId: "PLANT", inServiceDate: "2024-03-01T00:00:00Z", cost: 80000, openingWdv: 50000 },
    { ItemId: "v", classId: "VEH", inServiceDate: "2026-07-10T00:00:00Z", cost: 1200000, disposalDate: "2027-03-05T00:00:00Z", disposalAmount: 500000, status: "disposed" },
  ]
  const entries = assets.flatMap((asset) => run(asset, "2026-07", "2028-06", () => 25))
  for (const year of ["2026-07", "2027-07"]) {
    for (const asset of assets) {
      const row = scheduleRow(asset, entries, year, setup)
      if (!row) continue
      const left = Math.round((row.opening + row.additions - row.depreciation - row.disposalWdv) * 100)
      assert.equal(left, Math.round(row.closing * 100), `${asset.ItemId} ${year}`)
    }
  }
  const newRow = scheduleRow(laptop, entries, "2026-12", setup)
  assert.equal(newRow.opening, 0)
  assert.equal(newRow.additions, 120000)
  assert.equal(newRow.closing, 95000)
  const openingRow = scheduleRow(assets[1], entries, "2026-12", setup)
  assert.equal(openingRow.opening, 50000)
  assert.equal(openingRow.additions, 0)
  const disposed = scheduleRow(assets[2], entries, "2026-12", setup)
  assert.equal(disposed.closing, 0)
  assert.equal(scheduleRow(assets[2], entries, "2027-12", setup), null)
})

check("income year labels and boundaries", () => {
  assert.equal(incomeYearLabel("2026-09", 7), "2026-27")
  assert.equal(incomeYearLabel("2027-02", 7), "2026-27")
  assert.equal(incomeYearLabel("2026-02", 1), "2026")
  assert.equal(incomeYearStart("2027-06", 7), "2026-07")
  assert.equal(addMonths("2026-12", 1), "2027-01")
  assert.equal(addMonths("2026-01", -1), "2025-12")
  assert.equal(nextOpenMonth(setup, ""), "2026-07")
  assert.equal(nextOpenMonth(setup, "2026-12"), "2027-01")
})

check("a timestamp becomes a day in the company time zone", () => {
  assert.equal(dayInZone("2026-10-31T23:30:00Z", "Asia/Dhaka"), "2026-11-01")
  assert.equal(dayInZone("2026-10-31T23:30:00Z", "UTC"), "2026-10-31")
})

check("rounding is half away from zero", () => {
  assert.equal(roundMinor(2.5), 3)
  assert.equal(roundMinor(-2.5), -3)
  assert.equal(roundMinor(2.4999), 2)
})
