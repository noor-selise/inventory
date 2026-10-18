import * as React from "react"

import { useAuth } from "@/app/providers/AuthProvider"
import { useNavigation } from "@/app/router/navigation"
import { ErrorBanner } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { completeLogin } from "@/lib/blocks/auth"
import { AuthScreen } from "./LoginPage"
import { LoadingScreen } from "./LoadingScreen"

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
        navigate(result.returnTo)
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
