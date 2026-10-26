import * as React from "react"
import { toast } from "sonner"

import { AuditLine } from "@/components/app/audit"
import { SelectField, TextAreaField, TextField } from "@/components/app/form"
import { ErrorBanner, LoadingRows, PageHeader, SectionCard } from "@/components/app/page"
import { useAuth } from "@/app/providers/AuthProvider"
import { OrganizationCard } from "@/features/team/OrganizationCard"
import { DepreciationSetupCard } from "@/features/depreciation/DepreciationSetupCard"
import { isLocked } from "@/features/depreciation/actions"
import { Button } from "@/components/ui/button"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { CURRENCY_CODES, TIME_ZONES, formatDate, formatMoney } from "@/lib/format"
import { companies, type Company } from "./api"
import { useCanEditSettings } from "./useCanEdit"

const DATE_FORMATS = [
  { value: "yyyy-MM-dd", label: "2026-10-18" },
  { value: "dd/MM/yyyy", label: "18/10/2026" },
  { value: "MM/dd/yyyy", label: "10/18/2026" },
  { value: "dd.MM.yyyy", label: "18.10.2026" },
]

type Form = { name: string; address: string; timeZone: string; homeCurrency: string; dateFormat: string }

function toForm(company?: Company): Form {
  return {
    name: company?.name ?? "",
    address: company?.address ?? "",
    timeZone: company?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    homeCurrency: company?.homeCurrency ?? "USD",
    dateFormat: company?.dateFormat ?? "yyyy-MM-dd",
  }
}

// One Company record per organization (spec 0004 AC-1).
export function CompanyPage() {
  const { claims } = useAuth()
  const canEdit = useCanEditSettings()
  const { data, error, loading, reload } = useResource(() => companies.list({ pageSize: 1 }), [])
  const company = data?.items[0]
  const [form, setForm] = React.useState<Form>(toForm())
  const [touched, setTouched] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string>()

  React.useEffect(() => {
    if (data) setForm(toForm(data.items[0]))
  }, [data])

  const nameError = !form.name.trim() ? "Company name is required." : undefined
  // Months follow the company time zone, so it locks once a depreciation month is closed (spec 0028 AC-3).
  const zoneLocked = isLocked(company)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (nameError) return
    if (zoneLocked && company && form.timeZone !== company.timeZone) {
      setSaveError("The time zone is locked because a depreciation month is closed.")
      return
    }
    setSaving(true)
    setSaveError(undefined)
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      timeZone: form.timeZone,
      homeCurrency: form.homeCurrency,
      dateFormat: form.dateFormat,
    }
    try {
      if (company) await companies.update(company.ItemId, payload)
      else await companies.create(payload)
      toast.success("Company profile saved")
      await reload()
    } catch (caught) {
      setSaveError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  // The session's organization, from the token claims IAM returns.
  const currentOrg = String(claims?.org_id ?? claims?.organizationId ?? claims?.organization_id ?? "") || undefined

  return (
    <>
      <PageHeader
        title="Company"
        description="Your company profile, home currency and time zone. Dates and money across the app use these."
      />
      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}
      {loading && !data ? (
        <LoadingRows rows={5} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <SectionCard
              title="Company profile"
              description="Name, address, currency and how dates appear on documents."
            >
              <form onSubmit={save} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {saveError ? (
                  <div className="md:col-span-2">
                    <ErrorBanner message={saveError} />
                  </div>
                ) : null}
                <fieldset disabled={!canEdit} className="contents">
                  <TextField
                    id="company-name"
                    label="Company name"
                    required
                    value={form.name}
                    onChange={(name) => setForm({ ...form, name })}
                    error={touched ? nameError : undefined}
                    autoComplete="organization"
                    className="md:col-span-2"
                  />
                  <TextAreaField
                    id="company-address"
                    label="Address"
                    value={form.address}
                    onChange={(address) => setForm({ ...form, address })}
                    className="md:col-span-2"
                  />
                  <SelectField
                    id="company-time-zone"
                    label="Time zone"
                    required
                    options={TIME_ZONES.map((zone) => ({ value: zone, label: zone }))}
                    value={form.timeZone}
                    onChange={(timeZone) => setForm({ ...form, timeZone })}
                    disabled={!canEdit || zoneLocked}
                    helper={zoneLocked ? "Locked: a depreciation month is closed." : undefined}
                  />
                  <SelectField
                    id="company-currency"
                    label="Home currency"
                    required
                    helper={`Example: ${formatMoney(-1234.5, form.homeCurrency)}`}
                    options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
                    value={form.homeCurrency}
                    onChange={(homeCurrency) => setForm({ ...form, homeCurrency })}
                    disabled={!canEdit}
                  />
                  <SelectField
                    id="company-date-format"
                    label="Date format on documents"
                    options={DATE_FORMATS}
                    value={form.dateFormat}
                    onChange={(dateFormat) => setForm({ ...form, dateFormat })}
                    helper={`Today in your time zone: ${formatDate(new Date().toISOString(), form.timeZone)}`}
                    disabled={!canEdit}
                  />
                </fieldset>
                <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
                  {company ? <AuditLine record={company} /> : <span />}
                  {canEdit ? (
                    <Button type="submit" disabled={saving} className="min-w-24">
                      {saving ? "Saving…" : "Save"}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Only admins can change company settings.</p>
                  )}
                </div>
              </form>
            </SectionCard>
            <DepreciationSetupCard company={company} canEdit={canEdit} onSaved={() => void reload()} />
          </div>
          <OrganizationCard current={currentOrg} />
        </div>
      )}
    </>
  )
}
