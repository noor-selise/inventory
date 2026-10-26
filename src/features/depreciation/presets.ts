// Country presets for depreciation classes (spec 0028 AC-1). Setup copies a
// preset into the organization's own DepreciationClass records. A preset is
// never edited in place: a change in the law becomes a new id.

export type PresetClass = { code: string; name: string; method: "wdv"; ratePercent: number }

export type Preset = {
  id: string
  countryCode: string
  countryName: string
  label: string
  incomeYearStartMonth: number
  basisNote: string
  classes: PresetClass[]
}

export const PRESETS: Preset[] = [
  {
    id: "bd-standard-v1",
    countryCode: "BD",
    countryName: "Bangladesh",
    label: "Bangladesh standard WDV rates (Third Schedule basis)",
    incomeYearStartMonth: 7,
    basisNote: "Confirm these rates against the Income Tax Act 2023 before you file with them.",
    classes: [
      { code: "BLDG", name: "Buildings (general)", method: "wdv", ratePercent: 5 },
      { code: "BLDG_FACTORY", name: "Factory buildings", method: "wdv", ratePercent: 10 },
      { code: "PLANT", name: "Plant, machinery and equipment", method: "wdv", ratePercent: 10 },
      { code: "VEH", name: "Motor vehicles (owned)", method: "wdv", ratePercent: 10 },
      { code: "VEH_HIRE", name: "Motor vehicles (used on hire)", method: "wdv", ratePercent: 20 },
      { code: "COMPUTER", name: "Computer hardware", method: "wdv", ratePercent: 25 },
      { code: "MEDICAL", name: "Medical equipment", method: "wdv", ratePercent: 20 },
      { code: "AIRCRAFT", name: "Aircraft and aero engines", method: "wdv", ratePercent: 30 },
      { code: "ROAD", name: "Bridges, roads and flyovers", method: "wdv", ratePercent: 2 },
      { code: "OTHER", name: "Other tangible assets", method: "wdv", ratePercent: 10 },
    ],
  },
]

export const presetFor = (countryCode?: string | null) => PRESETS.find((preset) => preset.countryCode === countryCode)
