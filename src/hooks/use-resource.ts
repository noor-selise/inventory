import * as React from "react"

// Loads async data and exposes loading, error and a reload. Stale responses
// from an earlier call are dropped so fast typing never shows old results.
export function useResource<T>(load: () => Promise<T>, deps: React.DependencyList) {
  const [state, setState] = React.useState<{
    data: T | undefined
    error: string | undefined
    loading: boolean
  }>({ data: undefined, error: undefined, loading: true })
  const callId = React.useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = React.useCallback(load, deps)

  const reload = React.useCallback(async () => {
    const id = ++callId.current
    setState((current) => ({ ...current, loading: true, error: undefined }))
    try {
      const data = await run()
      if (id === callId.current) setState({ data, error: undefined, loading: false })
    } catch (error) {
      if (id === callId.current) {
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : String(error),
          loading: false,
        }))
      }
    }
  }, [run])

  React.useEffect(() => {
    void reload()
  }, [reload])

  return { ...state, reload }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
