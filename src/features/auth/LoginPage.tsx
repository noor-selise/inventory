import * as React from "react"
import { Boxes, LogIn } from "lucide-react"

import { useAuth } from "@/app/providers/AuthProvider"
import { ErrorBanner } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import { isLoginConfigured } from "@/lib/blocks/config"

export function AuthScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-lg bg-card p-6 md:p-8 border dark:border-transparent">
        <div className="mb-6 flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Boxes className="size-4" aria-hidden />
          </span>
          Inventory
        </div>
        {children}
      </div>
    </main>
  )
}

export function LoginPage({ returnTo }: { returnTo?: string }) {
  const { login } = useAuth()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const configured = isLoginConfigured()

  async function handleLogin() {
    setError(undefined)
    setPending(true)
    try {
      await login(returnTo)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPending(false)
    }
  }

  return (
    <AuthScreen>
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Use your company account to continue.
      </p>
      {!configured ? (
        <ErrorBanner
          message={`Login is not set up yet. Register ${window.location.origin}/login/callback on the OIDC client and set VITE_BLOCKS_OIDC_CLIENT_ID.`}
        />
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      <Button
        size="lg"
        className="w-full"
        disabled={!configured || pending}
        onClick={handleLogin}
      >
        <LogIn aria-hidden /> {pending ? "Redirecting…" : "Continue"}
      </Button>
    </AuthScreen>
  )
}
