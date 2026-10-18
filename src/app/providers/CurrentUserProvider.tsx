import * as React from "react"
import type { BlocksUser } from "@seliseblocks/client"

import { useAuth } from "@/app/providers/AuthProvider"
import { blocksClient } from "@/lib/blocks/client"
import { ADMIN_ROLE } from "@/features/team/roles"

type CurrentUserValue = {
  user: BlocksUser | undefined
  roles: string[]
  isAdmin: boolean
  hasRole: (...slugs: string[]) => boolean
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

  const reload = React.useCallback(async () => {
    try {
      const response = await blocksClient.iam.me()
      setUser(response.data)
    } catch {
      setUser(undefined)
    }
  }, [])

  React.useEffect(() => {
    if (status === "authenticated") void reload()
    if (status === "unauthenticated") setUser(undefined)
  }, [status, reload])

  const value = React.useMemo(() => {
    const roles = user?.roles ?? []
    const hasRole = (...slugs: string[]) =>
      slugs.some((slug) => roles.includes(slug))
    return { user, roles, isAdmin: hasRole(ADMIN_ROLE), hasRole, reload }
  }, [user, reload])

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
