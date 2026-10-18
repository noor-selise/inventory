import { Link } from "@/app/router/navigation"
import { buttonVariants } from "@/components/ui/button"

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground">This page does not exist or was moved.</p>
      <Link to="/" className={buttonVariants()}>
        Go to dashboard
      </Link>
    </div>
  )
}
