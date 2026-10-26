import { Link } from "@/app/router/navigation"
import { buttonVariants } from "@/components/ui/button"

// A screen the signed in person's role does not open (src/features/team/screen-access.ts).
export function NoAccessPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">You don't have access to this page</h1>
      <p className="max-w-md text-sm text-muted-foreground">Your role does not include this screen. Ask an admin to change your role on the Team screen if you need it.</p>
      <Link to="/" className={buttonVariants()}>
        Go to dashboard
      </Link>
    </div>
  )
}
