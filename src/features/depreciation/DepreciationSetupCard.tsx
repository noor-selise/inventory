import * as React from "react"
import { Lock, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { SelectField } from "@/components/app/form"
import { ErrorBanner, SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Company } from "@/features/settings/api"
import { errorMessage } from "@/hooks/use-resource"
import { incomeYearLabel } from "./calc"
import { isLocked, setupDepreciation, startPeriodOptions } from "./actions"
import { monthLabel as monthName } from "./labels"
import { PRESETS, presetFor } from "./presets"

// Country and start period for depreciation (spec 0028 AC-1 to AC-3). Setting
// it copies the country's classes into this organization only.
export function DepreciationSetupCard({ company, canEdit, onSaved }: { company?: Company; canEdit: boolean; onSaved: () => void }) {
  const [countryCode, setCountryCode] = React.useState(company?.countryCode ?? "BD")
  const preset = presetFor(countryCode) ?? PRESETS[0]
  const options = startPeriodOptions(company?.timeZone || "UTC", preset.incomeYearStartMonth)
  const [startPeriod, setStartPeriod] = React.useState(company?.depreciationStartPeriod ?? options[0])
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const locked = isLocked(company)
  const configured = Boolean(company?.countryCode && company.depreciationStartPeriod)

  React.useEffect(() => {
    setCountryCode(company?.countryCode ?? "BD")
    if (company?.depreciationStartPeriod) setStartPeriod(company.depreciationStartPeriod)
  }, [company?.countryCode, company?.depreciationStartPeriod])

  const periodOptions = [...new Set([...(company?.depreciationStartPeriod ? [company.depreciationStartPeriod] : []), ...options])].map((period) => ({
    value: period,
    label: `${incomeYearLabel(period, preset.incomeYearStartMonth)} (from ${monthName(period)})`,
  }))

  async function save() {
    setSaving(true)
    setError(undefined)
    try {
      await setupDepreciation(countryCode, startPeriod)
      toast.success(configured ? "Depreciation setup saved" : `${preset.countryName} classes added`)
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      title="Depreciation"
      description="Fixed assets lose value each month on the written down value method. The country sets the classes, rates and income year for this organization only."
      actions={configured ? <Badge variant={locked ? "secondary" : "success"}>{locked ? "In use" : "Set up"}</Badge> : <Badge variant="warning">Not set up</Badge>}
    >
      {!company ? (
        <p className="text-sm text-muted-foreground">Save the company profile above first.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {error ? (
            <div className="md:col-span-2">
              <ErrorBanner message={error} />
            </div>
          ) : null}
          <SelectField
            id="depreciation-country"
            label="Country"
            required
            options={PRESETS.map((item) => ({ value: item.countryCode, label: item.countryName }))}
            value={countryCode}
            onChange={setCountryCode}
            disabled={!canEdit || locked}
            helper={preset.label}
          />
          <SelectField
            id="depreciation-start"
            label="First income year to depreciate"
            required
            options={periodOptions}
            value={startPeriod}
            onChange={setStartPeriod}
            disabled={!canEdit || locked}
            helper="Assets in service before this need their value as at its first month."
          />
          <p className="flex items-start gap-2 text-xs text-muted-foreground md:col-span-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            {preset.basisNote} They come from the Income-tax Ordinance 1984, which the 2023 Act replaced, so check them with your accountant.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
            {locked ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="size-4" aria-hidden /> A month is closed, so the country, start period and time zone are locked.
              </p>
            ) : (
              <span className="text-xs text-muted-foreground">
                {configured && company.depreciationStartPeriod
                  ? `Saved: ${presetFor(company.countryCode)?.countryName ?? company.countryCode}, depreciating from ${monthName(company.depreciationStartPeriod)}. Edit rates in Settings, Depreciation.`
                  : "Edit rates afterwards in Settings, Depreciation."}
              </span>
            )}
            {canEdit && !locked ? (
              <Button type="button" onClick={() => void save()} disabled={saving} className="min-w-24">
                {saving ? "Saving…" : configured ? "Save changes" : "Set up depreciation"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </SectionCard>
  )
}
