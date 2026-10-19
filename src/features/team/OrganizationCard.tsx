import * as React from "react"
import { Building } from "lucide-react"
import { toast } from "sonner"

import { SelectField } from "@/components/app/form"
import { SectionCard } from "@/components/app/page"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { switchOrganization } from "@/lib/blocks/auth"
import { blocksClient } from "@/lib/blocks/client"

// The person's organization (spec 0003 AC-2). Every record Blocks stores
// carries the session's OrganizationId, so one company never sees another's
// data. Your first company lives in Blocks' built in "default" organization
// (spec 0003, decided 2026-10-20); companies that sign up later get their own.

type Org = { itemId?: string; id?: string; name?: string; organizationId?: string }

export function OrganizationCard({ current }: { current?: string }) {
  const orgs = useResource(async () => {
    const reply = (await blocksClient.iam.organizations.my()) as unknown
    const rows = (Array.isArray(reply) ? reply : ((reply as { data?: unknown })?.data ?? [])) as Org[]
    return rows.map((row) => ({ value: String(row.itemId ?? row.id ?? row.organizationId ?? ""), label: String(row.name ?? row.itemId ?? "") })).filter((row) => row.value)
  }, [])
  const [busy, setBusy] = React.useState(false)
  const list = orgs.data ?? []

  async function choose(organizationId: string) {
    if (!organizationId || organizationId === current) return
    setBusy(true)
    try {
      await switchOrganization(organizationId)
      // Everything on screen belongs to the old organization, so start fresh.
      window.location.assign("/")
    } catch (caught) {
      toast.error(errorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <SectionCard title="Organization" description="Your company's space in Blocks. Records never cross between organizations.">
      <div className="flex items-center gap-3 text-sm">
        <Building className="size-4 text-muted-foreground" aria-hidden />
        {list.length > 1 ? (
          <SelectField id="org-switch" label="Working in" options={list} value={current ?? ""} onChange={(value) => void choose(value)} disabled={busy} className="max-w-xs" />
        ) : (
          <span>{list[0]?.label ?? (current && current !== "default" ? current : "Default organization")}</span>
        )}
      </div>
    </SectionCard>
  )
}
