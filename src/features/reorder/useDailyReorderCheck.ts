import * as React from "react"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { runDailyReorderCheck } from "./api"

let started = false

/**
 * Runs the day's reorder check once a signed in person is known (spec 0027).
 * The unique run key makes every other browser skip it; failures stay quiet
 * here and show in the WorkflowRun record.
 */
export function useDailyReorderCheck() {
  const { user } = useCurrentUser()
  React.useEffect(() => {
    if (!user || started) return
    started = true
    void runDailyReorderCheck().catch(() => undefined)
  }, [user])
}
