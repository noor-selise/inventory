import * as React from "react"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import type { TeamMemberProfile } from "./profile"

// Location limits (spec 0003 AC-8, "Location limits"): a non admin with a non
// empty allowedLocationIds sees only those locations. Admins, an empty list
// and no profile all mean every location. These filters shape queries and the
// UI only; the server does not enforce them yet (spec 0003 exit gate).

export type LocationScope = {
  /** True when the person is limited to `ids`. */
  limited: boolean
  ids: string[]
  /** Stable value for useResource deps, so lists reload when the limits change. */
  key: string
}

export function locationScope(profile: Pick<TeamMemberProfile, "allowedLocationIds"> | undefined, isAdmin: boolean): LocationScope {
  const ids = isAdmin ? [] : [...new Set((profile?.allowedLocationIds ?? []).filter(Boolean))].sort()
  return { limited: ids.length > 0, ids, key: ids.join(",") }
}

/** A record with no location is never limited. */
export function seesLocation(scope: LocationScope, locationId?: string | null) {
  return !scope.limited || !locationId || scope.ids.includes(locationId)
}

/** A transfer is visible when either end is allowed. */
export function seesAnyLocation(scope: LocationScope, ...locationIds: (string | null | undefined)[]) {
  return !scope.limited || locationIds.some((id) => id && scope.ids.includes(id))
}

/**
 * Query filter for a one location field. A chosen location (a filter the
 * person picked) still has to be an allowed one; a blocked choice matches
 * nothing rather than falling back to everything.
 */
// Matches no record: an empty $in is not proven to work on the gateway.
const NO_ACCESS = "__no_location_access__"

export function locationFilter(scope: LocationScope, field: string, chosen?: string | null): Record<string, unknown> {
  if (chosen) return { [field]: seesLocation(scope, chosen) ? chosen : NO_ACCESS }
  return scope.limited ? { [field]: { $in: scope.ids } } : {}
}

export function useLocationScope(): LocationScope {
  const { profile, isAdmin } = useCurrentUser()
  const ids = profile?.allowedLocationIds
  return React.useMemo(() => locationScope({ allowedLocationIds: ids }, isAdmin), [ids, isAdmin])
}
