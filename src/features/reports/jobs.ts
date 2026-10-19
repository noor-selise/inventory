import { blocksClient } from "@/lib/blocks/client"
import { collection, type Entity } from "@/lib/blocks/data"
import type { OrderLookups } from "@/features/sales/lookups"
import type { ReportColumn, ReportDefinition, ReportFilters, ReportRow } from "./definitions"

// Background reports (spec 0015 AC-5, spec 0027): the job record carries the
// status (not started, in progress, success, error) and, when done, a CSV in
// Blocks storage. With no working workflow sign in yet, the browser that
// started the job runs it; a job left in progress past STALE_MINUTES (the tab
// closed) counts as an error.

export const JOB_STATUSES = {
  not_started: "Not started",
  in_progress: "In progress",
  success: "Success",
  error: "Error",
} as const

export type JobStatus = keyof typeof JOB_STATUSES

export type ReportJob = Entity & {
  reportKey: string
  title: string
  filters: string
  status: JobStatus
  fileId?: string | null
  fileName?: string | null
  rowCount?: number | null
  error?: string | null
  ownerId: string
  startedAt: string
  finishedAt?: string | null
}

export const reportJobs = collection<ReportJob>("ReportJob", ["reportKey", "title", "filters", "status", "fileId", "fileName", "rowCount", "error", "ownerId", "startedAt", "finishedAt"])

export const STALE_MINUTES = 30
const STORAGE = "Default"

export function isStale(job: Pick<ReportJob, "status" | "startedAt">, now = Date.now()) {
  return (job.status === "in_progress" || job.status === "not_started") && now - new Date(job.startedAt).getTime() > STALE_MINUTES * 60_000
}

/** CSV with the given columns only, so masked cost columns never reach the file (AC-4). */
export function toCsv(rows: ReportRow[], columns: Pick<ReportColumn, "key" | "label">[]) {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  return [columns.map((column) => escape(column.label)).join(","), ...rows.map((row) => columns.map((column) => escape(row[column.key] == null ? "" : String(row[column.key]))).join(","))].join("\n")
}

/**
 * Uploads through a pre signed URL (the Default storage needs no completion
 * step). The file is private to the person who ran the report: without
 * objectAccessLevel Blocks keeps its legacy allow all default.
 */
async function uploadCsv(name: string, csv: string) {
  const presign = (await blocksClient.data.files.presignedUploadUrl({
    name,
    configurationName: STORAGE,
    accessModifier: "Private",
    objectAccessLevel: "Creator",
    contentType: "text/csv",
    sizeInBytes: new Blob([csv]).size,
    tags: "report",
  })) as {
    uploadUrl?: string
    fileId?: string
    isSuccess?: boolean
    errors?: unknown
    requiredHeaders?: Record<string, string>
  }
  if (!presign?.isSuccess || !presign.uploadUrl || !presign.fileId) throw new Error(`Storage refused the file: ${JSON.stringify(presign?.errors ?? presign)}`)
  await blocksClient.data.files.uploadToUrl({ url: presign.uploadUrl, body: new Blob([csv], { type: "text/csv" }), contentType: "text/csv", headers: presign.requiredHeaders })
  return presign.fileId
}

/** A download link for a finished job's file. */
export async function jobDownloadUrl(fileId: string) {
  const file = (await blocksClient.data.files.get(fileId, { configurationName: STORAGE })) as Record<string, unknown> & { data?: Record<string, unknown> }
  const url = file?.url ?? file?.downloadUrl ?? file?.data?.url ?? file?.data?.downloadUrl
  if (typeof url !== "string") throw new Error("Storage returned no download link.")
  return url
}

/**
 * Creates the job and runs it without blocking the screen. Returns the job id
 * right away; the promise in `done` settles when the file is stored.
 */
export async function startBackgroundReport(input: { report: ReportDefinition; filters: ReportFilters; columns: ReportColumn[]; lookups: OrderLookups; ownerId: string }) {
  const startedAt = new Date().toISOString()
  const jobId = await reportJobs.create({ reportKey: input.report.key, title: input.report.title, filters: JSON.stringify(input.filters), status: "not_started", ownerId: input.ownerId, startedAt })
  const done = (async () => {
    try {
      await reportJobs.update(jobId, { status: "in_progress" })
      const rows = await input.report.load(input.filters, input.lookups)
      const fileName = `${input.report.key}-${startedAt.slice(0, 19).replace(/[:T]/g, "-")}.csv`
      const fileId = await uploadCsv(fileName, toCsv(rows, input.columns))
      await reportJobs.update(jobId, { status: "success", fileId, fileName, rowCount: rows.length, finishedAt: new Date().toISOString() })
    } catch (caught) {
      await reportJobs.update(jobId, { status: "error", error: caught instanceof Error ? caught.message : String(caught), finishedAt: new Date().toISOString() }).catch(() => undefined)
    }
  })()
  return { jobId, done }
}
