import * as React from "react"

import { cn } from "@/lib/utils"

// A minimal pushState router, the same approach `blocks new web` scaffolds.
// It keeps the app free of a routing library until the screens outgrow it.

type NavigationState = {
  path: string
  search: string
  navigate: (to: string) => void
}

const NavigationContext = React.createContext<NavigationState | undefined>(
  undefined
)

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = React.useState(() => ({
    path: window.location.pathname,
    search: window.location.search,
  }))

  React.useEffect(() => {
    const onPopState = () =>
      setLocation({
        path: window.location.pathname,
        search: window.location.search,
      })
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const navigate = React.useCallback((to: string) => {
    const [path = "/", query = ""] = to.split("?")
    window.history.pushState({}, "", to)
    setLocation({ path, search: query ? `?${query}` : "" })
    window.scrollTo(0, 0)
  }, [])

  const value = React.useMemo(
    () => ({ ...location, navigate }),
    [location, navigate]
  )

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const context = React.useContext(NavigationContext)
  if (!context) {
    throw new Error("useNavigation must be used within NavigationProvider")
  }
  return context
}

export function Link({
  to,
  className,
  onClick,
  ...props
}: React.ComponentProps<"a"> & { to: string }) {
  const { navigate } = useNavigation()

  return (
    <a
      href={to}
      className={cn("cursor-pointer", className)}
      onClick={(event) => {
        onClick?.(event)
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey
        ) {
          return
        }
        event.preventDefault()
        navigate(to)
      }}
      {...props}
    />
  )
}
