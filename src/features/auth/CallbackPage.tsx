import * as React from "react"

import { useAuth } from "@/app/providers/AuthProvider"
import { useNavigation } from "@/app/router/navigation"
import { ErrorBanner } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { canOpen } from "@/features/team/screen-access"
import { ADMIN_ROLE, roleSlugs } from "@/features/team/roles"
import { completeLogin } from "@/lib/blocks/auth"
import { blocksClient } from "@/lib/blocks/client"
import { AuthScreen } from "./LoginPage"
import { LoadingScreen } from "./LoadingScreen"

/**
 * The page to open after sign in: the saved return page when the person who
 * just signed in may open it, else the dashboard. The saved page can belong to
 * someone else (a session that expired, then another person signed in) or come
 * from a link meant for another role.
 */
async function landingFor(returnTo: string) {
  const path = returnTo.split(/[?#]/)[0] || "/"
  if (path === "/") return "/"
  try {
    const roles = roleSlugs((await blocksClient.iam.me()).data?.roles)
    return canOpen(path, roles, roles.includes(ADMIN_ROLE)) ? returnTo : "/"
  } catch {
    return "/"
  }
}

// Handles /login/callback. Never wrap it in a guard: the user is not signed in yet.
export function CallbackPage() {
  const { refresh } = useAuth()
  const { navigate } = useNavigation()
  const [error, setError] = React.useState<string>()
  const ran = React.useRef(false)

  React.useEffect(() => {
    // Strict Mode runs effects twice in dev; the code can only be exchanged once.
    if (ran.current) return
    ran.current = true

    completeLogin(window.location.href)
      .then(async (result) => {
        if (!result.ok) {
          setError(result.message)
          return
        }
        await refresh()
        navigate(await landingFor(result.returnTo))
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : String(caught))
      )
  }, [navigate, refresh])

  if (!error) return <LoadingScreen />

  return (
    <AuthScreen>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Sign in failed</h1>
      <ErrorBanner message={error} />
      <Button className="w-full" onClick={() => navigate("/login")}>
        Back to sign in
      </Button>
    </AuthScreen>
  )
}
