import { Link } from "@/app/router/navigation"
import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { PageHeader, SectionCard } from "@/components/app/page"
import { RecordList } from "@/components/app/record-list"
import { Badge } from "@/components/ui/badge"
import { DEPRECIATION_ADMINS } from "@/features/team/roles"
import { depreciationClasses, type DepreciationClass } from "./api"

const normalizeCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, "_")

// Depreciation classes and rates for this organization (spec 0028 AC-4).
// Inactive classes keep depreciating the assets already on them.
export function ClassesPage() {
  const canEdit = useCurrentUser().hasRole(...DEPRECIATION_ADMINS)

  return (
    <>
      <PageHeader
        title="Depreciation classes"
        description="Written down value rates per class, for this organization only. A rate change applies to each asset from its next income year, so a closed or half charged year never changes."
      />
      <SectionCard>
        <RecordList<DepreciationClass>
          collection={depreciationClasses}
          noun="Class"
          canEdit={canEdit}
          emptyMessage="No classes yet. Set the country in Company settings to add the standard ones."
          sort={{ code: 1 }}
          activeField="isActive"
          defaults={{ isActive: true }}
          fixedValues={{ method: "wdv", presetId: "" }}
          transform={(payload) => ({ ...payload, code: normalizeCode(String(payload.code ?? "")) })}
          fields={[
            { name: "code", label: "Code", type: "text", required: true, mono: true, helper: "Short and unique, for example VEH. Saved in capitals." },
            { name: "name", label: "Name", type: "text", required: true },
            { name: "ratePercent", label: "Yearly rate (%)", type: "number", required: true, min: 0, helper: "Of the value left at the start of each income year." },
          ]}
          validate={(values, all, editing) => {
            const code = normalizeCode(String(values.code ?? ""))
            if (all.some((item) => item.ItemId !== editing?.ItemId && item.code === code)) return `Class ${code} already exists.`
            const rate = Number(values.ratePercent)
            if (!(rate >= 0 && rate <= 100)) return "The rate must be between 0 and 100."
            return undefined
          }}
          columns={[
            {
              label: "Code",
              className: "w-[1%] whitespace-nowrap font-mono text-[13px]",
              render: (item) => item.code,
            },
            {
              label: "Name",
              render: (item) => (
                <span className="flex flex-wrap items-center gap-2">
                  {item.name}
                  {item.presetId ? <Badge variant="neutral">Standard</Badge> : <Badge variant="info">Custom</Badge>}
                </span>
              ),
            },
            {
              label: "Rate",
              numeric: true,
              className: "w-[1%] whitespace-nowrap",
              render: (item) => <span className="num">{item.ratePercent}%</span>,
            },
          ]}
        />
        {!canEdit ? <p className="mt-3 text-xs text-muted-foreground">Only admins can change classes.</p> : null}
        <p className="mt-3 text-xs text-muted-foreground">
          The country and its standard classes are set in <Link to="/settings/company" className="underline">Company settings</Link>.
        </p>
      </SectionCard>
    </>
  )
}
