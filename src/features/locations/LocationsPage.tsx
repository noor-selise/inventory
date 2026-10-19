import * as React from "react"
import { MapPin } from "lucide-react"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { EmptyState, PageHeader, SectionCard } from "@/components/app/page"
import { RecordList } from "@/components/app/record-list"
import { Badge } from "@/components/ui/badge"
import { SETTINGS_EDITORS } from "@/features/team/roles"
import { useResource } from "@/hooks/use-resource"
import { cn } from "@/lib/utils"
import { LOCATION_KINDS, locations, normalizeBinCode, sublocations, type Location, type Sublocation } from "./api"

const kindLabel = (kind?: string | null) => LOCATION_KINDS.find((item) => item.value === kind)?.label ?? ""

// Locations with exactly one default, and bins inside each (spec 0006 AC-1, AC-2, AC-4).
// The plan limit on locations (AC-5) waits for plans (spec 0023).
export function LocationsPage() {
  const canEdit = useCurrentUser().hasRole(...SETTINGS_EDITORS)
  const { data, reload } = useResource(() => locations.list({ sort: { name: 1 }, pageSize: 500 }), [])
  const items = data?.items ?? []
  const [selectedId, setSelectedId] = React.useState<string>()
  const selected = items.find((item) => item.ItemId === selectedId) ?? items.find((item) => item.isDefault) ?? items[0]

  return (
    <>
      <PageHeader
        title="Locations"
        description="Warehouses, stores and trucks, and the bins inside them. Locations and bins are deactivated, never deleted."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <SectionCard title="Locations">
          <RecordList<Location>
            collection={locations}
            noun="Location"
            canEdit={canEdit}
            emptyMessage="No locations yet. Add your main warehouse and make it the default."
            sort={{ name: 1 }}
            activeField="isActive"
            defaultField="isDefault"
            defaults={{ isActive: true, kind: "warehouse" }}
            isLocked={(location) => location.isDefault === true}
            onChanged={() => void reload()}
            fields={[
              { name: "name", label: "Name", type: "text", required: true },
              { name: "kind", label: "Kind", type: "select", options: [...LOCATION_KINDS] },
              { name: "address", label: "Address", type: "text", span: "full" },
              { name: "isDefault", label: "Default location for new documents", type: "checkbox" },
            ]}
            validate={(values, all, editing) => {
              const name = String(values.name ?? "").trim().toLowerCase()
              if (all.some((item) => item.ItemId !== editing?.ItemId && item.name.trim().toLowerCase() === name)) {
                return "A location with this name already exists."
              }
              if (!values.isDefault && !all.some((item) => item.isDefault && item.ItemId !== editing?.ItemId)) {
                return "One location must be the default. Tick “Default location”."
              }
              return undefined
            }}
            columns={[
              {
                label: "Name",
                render: (location) => (
                  <button
                    type="button"
                    className={cn(
                      "flex cursor-pointer items-center gap-2 text-left font-medium hover:underline",
                      selected?.ItemId === location.ItemId && "text-primary"
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedId(location.ItemId)
                    }}
                  >
                    {location.name}
                    {location.isDefault ? <Badge variant="success">Default</Badge> : null}
                  </button>
                ),
              },
              { label: "Kind", render: (location) => kindLabel(location.kind) },
              { label: "Address", className: "hidden lg:table-cell text-muted-foreground", render: (location) => location.address },
            ]}
          />
        </SectionCard>
        <SectionCard
          title={selected ? `Bins in ${selected.name}` : "Bins"}
          description="Bin codes are unique inside a location. New codes typed on stock forms create bins automatically."
        >
          {selected ? (
            <RecordList<Sublocation>
              key={selected.ItemId}
              collection={sublocations}
              noun="Bin"
              canEdit={canEdit}
              emptyMessage="No bins yet."
              sort={{ code: 1 }}
              filter={{ locationId: selected.ItemId }}
              fixedValues={{ locationId: selected.ItemId }}
              transform={(payload) => ({ ...payload, code: normalizeBinCode(String(payload.code ?? "")) })}
              activeField="isActive"
              defaults={{ isActive: true }}
              fields={[{ name: "code", label: "Code", type: "text", required: true, mono: true, span: "full", helper: "For example A-01. Saved in capitals." }]}
              validate={(values, all, editing) => {
                const code = normalizeBinCode(String(values.code ?? ""))
                return all.some((item) => item.ItemId !== editing?.ItemId && item.code === code)
                  ? `Bin ${code} already exists in this location.`
                  : undefined
              }}
              columns={[{ label: "Code", render: (bin) => <span className="font-mono">{bin.code}</span> }]}
            />
          ) : (
            <EmptyState icon={MapPin} message="Add a location first." />
          )}
        </SectionCard>
      </div>
    </>
  )
}
