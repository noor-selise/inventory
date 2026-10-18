export function LoadingScreen() {
  return (
    <main
      className="flex min-h-svh items-center justify-center bg-background"
      aria-busy="true"
    >
      <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <span className="sr-only">Loading</span>
    </main>
  )
}
