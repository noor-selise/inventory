import { Download } from "lucide-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { formatDateTime } from "@/components/app/audit"
import { SectionCard } from "@/components/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { errorMessage, useResource } from "@/hooks/use-resource"
import { formatNumber } from "@/lib/format"
import { JOB_STATUSES, isStale, jobDownloadUrl, reportJobs, type ReportJob } from "./jobs"

// The person's background reports with status and a download link (spec 0015 AC-5).

const VARIANT = { not_started: "neutral", in_progress: "neutral", success: "success", error: "destructive" } as const

export function BackgroundJobs({ version }: { version: number }) {
  const { user } = useCurrentUser()
  const owner = String(user?.itemId ?? user?.email ?? "")
  const jobs = useResource(async () => {
    if (!owner) return []
    const { items } = await reportJobs.list({ filter: { ownerId: owner }, sort: { startedAt: -1 }, pageSize: 10 })
    // A job its tab never finished is marked as an error, so it does not spin forever.
    for (const job of items.filter((item) => isStale(item))) {
      await reportJobs.update(job.ItemId, { status: "error", error: "The tab running it closed before it finished.", finishedAt: new Date().toISOString() }).catch(() => undefined)
      job.status = "error"
    }
    return items
  }, [owner, version])

  async function download(job: ReportJob) {
    try {
      window.open(await jobDownloadUrl(String(job.fileId)), "_blank", "noopener")
    } catch (caught) {
      toast.error(errorMessage(caught))
    }
  }

  if (!jobs.data?.length) return null
  return (
    <SectionCard title="Background reports" description="Your latest runs. Files stay in your company storage.">
      <ul className="flex flex-col gap-2">
        {jobs.data.map((job) => (
          <li key={job.ItemId} className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={VARIANT[job.status] ?? "neutral"}>{JOB_STATUSES[job.status] ?? job.status}</Badge>
            <span className="min-w-0 flex-1">
              {job.title}
              <span className="text-xs text-muted-foreground">
                {" "}
                · {formatDateTime(job.startedAt)}
                {job.rowCount != null ? ` · ${formatNumber(job.rowCount)} rows` : ""}
                {job.error ? ` · ${job.error}` : ""}
              </span>
            </span>
            {job.status === "success" && job.fileId ? (
              <Button size="sm" variant="secondary" onClick={() => void download(job)}>
                <Download aria-hidden /> Download
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {jobs.data.some((job) => job.status === "in_progress" || job.status === "not_started") ? (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => void jobs.reload()}>
          Refresh
        </Button>
      ) : null}
    </SectionCard>
  )
}
