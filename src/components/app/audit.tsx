import * as React from "react"

import { blocksClient } from "@/lib/blocks/client"

// Shows who last changed a record and when, from the Blocks system fields
// LastUpdatedBy and LastUpdatedDate (spec 0003 AC-7).
const nameCache = new Map<string, Promise<string>>()

function loadUserName(userId: string): Promise<string> {
  let pending = nameCache.get(userId)
  if (!pending) {
    pending = blocksClient.iam.users
      .get(userId)
      .then((response) => {
        const user = response.data
        const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ")
        return name || user?.email || "Unknown user"
      })
      .catch(() => "Unknown user")
    nameCache.set(userId, pending)
  }
  return pending
}

export function useUserName(userId: string | undefined) {
  const [name, setName] = React.useState<string>()
  React.useEffect(() => {
    if (!userId) return
    let active = true
    void loadUserName(userId).then((value) => {
      if (active) setName(value)
    })
    return () => {
      active = false
    }
  }, [userId])
  return name
}

export function formatDateTime(value: string | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function AuditLine({
  record,
}: {
  record: { LastUpdatedBy?: string; LastUpdatedDate?: string }
}) {
  const name = useUserName(record.LastUpdatedBy)
  if (!record.LastUpdatedDate) return null
  return (
    <p className="text-xs text-muted-foreground">
      Last changed {name ? `by ${name} ` : ""}on {formatDateTime(record.LastUpdatedDate)}
    </p>
  )
}
