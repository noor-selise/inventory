import * as React from "react"

import { useAuth } from "@/app/providers/AuthProvider"
import { useNavigation } from "@/app/router/navigation"
import { LoadingScreen } from "@/features/auth/LoadingScreen"

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const { path, search, navigate } = useNavigation()

  React.useEffect(() => {
    if (status === "unauthenticated") {
      navigate(`/login?returnTo=${encodeURIComponent(path + search)}`)
    }
  }, [status, path, search, navigate])

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
