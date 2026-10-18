import * as React from "react"

import {
  fetchSessionClaims,
  logout as endSession,
  onSessionExpired,
  startLogin,
} from "@/lib/blocks/auth"

type AuthStatus = "authenticated" | "loading" | "unauthenticated"

type AuthContextValue = {
  claims: Record<string, unknown> | undefined
  login: (returnTo?: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  status: AuthStatus
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

// A slow backup poll. Regaining focus is the prompt signal for a session that
// ended in another tab or expired in the background.
const STATUS_POLL_MS = 5 * 60_000

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>("loading")
  const [claims, setClaims] = React.useState<Record<string, unknown>>()

  const refresh = React.useCallback(async () => {
    const sessionClaims = await fetchSessionClaims()
    setClaims(sessionClaims)
    setStatus(sessionClaims ? "authenticated" : "unauthenticated")
  }, [])

  React.useEffect(() => {
    void refresh()
    const id = window.setInterval(refresh, STATUS_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  React.useEffect(() => onSessionExpired(() => void refresh()), [refresh])

  const login = React.useCallback(async (returnTo?: string) => {
    await startLogin(returnTo)
  }, [])

  const logout = React.useCallback(async () => {
    await endSession()
    await refresh()
  }, [refresh])

  const value = React.useMemo(
    () => ({ claims, login, logout, refresh, status }),
    [claims, login, logout, refresh, status]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = React.useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
