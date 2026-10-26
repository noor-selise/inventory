import * as React from "react"

import { useAuth } from "@/app/providers/AuthProvider"
import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { useNavigation } from "@/app/router/navigation"
import { LoadingRows } from "@/components/app/page"
import { LoadingScreen } from "@/features/auth/LoadingScreen"
import { NoAccessPage } from "@/features/auth/NoAccessPage"
import { canOpen } from "@/features/team/screen-access"

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, signedOut } = useAuth()
  const { path, search, navigate } = useNavigation()

  React.useEffect(() => {
    if (status === "unauthenticated") {
      // An expired session comes back to the same page; a deliberate sign out does not,
      // so the next person to sign in on this browser never lands on someone else's page.
      navigate(signedOut ? "/login" : `/login?returnTo=${encodeURIComponent(path + search)}`)
    }
  }, [status, signedOut, path, search, navigate])

  if (status !== "authenticated") return <LoadingScreen />
  return <>{children}</>
}

export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const { navigate } = useNavigation()

  React.useEffect(() => {
    if (status === "authenticated") navigate("/")
  }, [status, navigate])

  if (status !== "unauthenticated") return <LoadingScreen />
  return <>{children}</>
}

/** Shows the page only to roles that may open it (src/features/team/screen-access.ts); others get a no access page. */
export function RequireScreen({ path, children }: { path: string; children: React.ReactNode }) {
  const { roles, isAdmin, loaded } = useCurrentUser()
  if (!loaded) return <LoadingRows rows={6} />
  if (!canOpen(path, roles, isAdmin)) return <NoAccessPage />
  return <>{children}</>
}
