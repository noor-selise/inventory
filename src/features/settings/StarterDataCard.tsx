import * as React from "react"
import { Database, Package } from "lucide-react"
import { toast } from "sonner"

import { ErrorBanner, SectionCard } from "@/components/app/page"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { errorMessage } from "@/hooks/use-resource"
import { seedSampleCatalog, seedStarterSettings, type SeedReport } from "./seed"

const ACTIONS = {
  settings: {
    title: "Add starter settings?",
    description:
      "Adds currencies, payment terms, a default “No tax” scheme, adjustment reasons, carriers, payment methods and numbering rules. Anything that already exists is left as it is.",
    run: seedStarterSettings,
  },
  catalog: {
    title: "Add sample products?",
    description:
      "Adds 6 categories and 10 sample products with barcodes. Their SKUs start with SAMPLE- so you can find and deactivate them later.",
    run: seedSampleCatalog,
  },
} as const

type ActionKey = keyof typeof ACTIONS

// Admin only. Safe to run more than once: each step adds only missing records.
export function StarterDataCard() {
  const [pending, setPending] = React.useState<ActionKey>()
  const [running, setRunning] = React.useState(false)
  const [report, setReport] = React.useState<SeedReport>()
  const [error, setError] = React.useState<string>()

  async function run() {
    if (!pending) return
    setRunning(true)
    setError(undefined)
    try {
      const result = await ACTIONS[pending].run()
      setReport(result)
      const added = result.reduce((total, row) => total + row.added, 0)
      toast.success(added ? `Added ${added} records` : "Everything was already there")
      setPending(undefined)
    } catch (caught) {
      setError(errorMessage(caught))
      setPending(undefined)
    } finally {
      setRunning(false)
    }
  }

  return (
    <SectionCard
      title="Starter data"
      description="Fill the lists a new company needs, or add sample products to try things out."
      className="mt-6"
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setPending("settings")}>
          <Database aria-hidden /> Add starter settings
        </Button>
        <Button variant="secondary" onClick={() => setPending("catalog")}>
          <Package aria-hidden /> Add sample products
        </Button>
      </div>
      {report ? (
        <ul className="mt-4 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2" aria-live="polite">
          {report.map((row) => (
            <li key={row.label} className="flex justify-between gap-4 rounded-sm bg-muted px-3 py-2">
              <span>{row.label}</span>
              <span className="text-muted-foreground num">
                {row.added} added, {row.existing} already there
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={pending !== undefined} onOpenChange={(open) => !open && !running && setPending(undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pending ? ACTIONS[pending].title : ""}</DialogTitle>
            <DialogDescription>{pending ? ACTIONS[pending].description : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" disabled={running} onClick={() => setPending(undefined)}>
              Cancel
            </Button>
            <Button disabled={running} onClick={() => void run()} className="min-w-24">
              {running ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}
