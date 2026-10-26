import * as React from "react"
import type { BlocksUser } from "@seliseblocks/client"

import { useAuth } from "@/app/providers/AuthProvider"
import { blocksClient } from "@/lib/blocks/client"
import { profileFor, type TeamMemberProfile } from "@/features/team/profile"
import { ADMIN_ROLE, roleSlugs } from "@/features/team/roles"

type CurrentUserValue = {
  user: BlocksUser | undefined
  roles: string[]
  isAdmin: boolean
  hasRole: (...slugs: string[]) => boolean
  /** Per person settings (spec 0027); undefined until loaded or when none exist. */
  profile: TeamMemberProfile | undefined
  /** True once the user and profile load has finished (or failed). Location limits depend on it. */
  loaded: boolean
  reload: () => Promise<void>
}

const CurrentUserContext = React.createContext<CurrentUserValue | undefined>(
  undefined
)

// iam.me() returns the signed in user's profile with roles and permissions.
// Role checks here only shape the UI; the gateway enforces real access.
export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const [user, setUser] = React.useState<BlocksUser>()
  const [profile, setProfile] = React.useState<TeamMemberProfile>()
  const [loaded, setLoaded] = React.useState(false)

  const reload = React.useCallback(async () => {
    try {
      const response = await blocksClient.iam.me()
      const userId = response.data?.itemId
      // Load the profile before publishing the user, so screens never render
      // with the user known but their location limits missing (spec 0003).
      const nextProfile = userId ? await profileFor(String(userId)).catch(() => undefined) : undefined
      setUser(response.data)
      setProfile(nextProfile)
    } catch {
      setUser(undefined)
      setProfile(undefined)
    } finally {
      setLoaded(true)
    }
  }, [])

  React.useEffect(() => {
    if (status === "authenticated") void reload()
    if (status === "unauthenticated") {
      setUser(undefined)
      setProfile(undefined)
      setLoaded(false)
    }
  }, [status, reload])

  const value = React.useMemo(() => {
    const roles = roleSlugs(user?.roles)
    const hasRole = (...slugs: string[]) =>
      slugs.some((slug) => roles.includes(slug))
    return { user, roles, isAdmin: hasRole(ADMIN_ROLE), hasRole, profile, loaded, reload }
  }, [user, profile, loaded, reload])

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  )
}

export function useCurrentUser() {
  const context = React.useContext(CurrentUserContext)
  if (!context) {
    throw new Error("useCurrentUser must be used within CurrentUserProvider")
  }
  return context
}

export function userDisplayName(user?: BlocksUser): string {
  if (!user) return ""
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
  return name || user.email || ""
}
