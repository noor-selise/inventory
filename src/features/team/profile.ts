import { collection, type Entity } from "@/lib/blocks/data"

// Per person settings Blocks users do not hold (spec 0003 data model, spec
// 0027): PO approval limit, location limits, the sales rep restriction and the
// dashboard widgets. One record per user, unique on userId. Checked in the app
// only; Blocks row policies cannot compare a record with the current user yet.

export const DASHBOARD_WIDGETS = [
  { value: "sales_today", label: "Sales today" },
  { value: "low_stock", label: "Low stock count" },
  { value: "open_orders", label: "Open orders" },
] as const

export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number]["value"]

export type TeamMemberProfile = Entity & {
  userId: string
  /**
   * Highest PO total, in home currency, this person may approve. NO_LIMIT
   * (or never set) means none: Blocks ignores null in an update, so a number
   * cannot be cleared and a negative value stands for "none".
   */
  poApprovalLimit?: number | null
  /** Empty means every location. */
  allowedLocationIds?: string[] | null
  isStockroomUser?: boolean | null
  /** A sales rep who sees only their own customers and orders (spec 0011 AC-8). */
  ownCustomersOnly?: boolean | null
  /** Widgets on this person's home page, in order (spec 0015 AC-6). Empty means the default set. */
  dashboardWidgets?: string[] | null
}

export const teamProfiles = collection<TeamMemberProfile>("TeamMemberProfile", [
  "userId",
  "poApprovalLimit",
  "allowedLocationIds",
  "isStockroomUser",
  "ownCustomersOnly",
  "dashboardWidgets",
])

export const NO_LIMIT = -1

export function approvalLimit(profile?: Pick<TeamMemberProfile, "poApprovalLimit">) {
  const limit = profile?.poApprovalLimit
  return limit == null || Number(limit) < 0 ? null : Number(limit)
}

export async function profileFor(userId: string) {
  return (await teamProfiles.list({ filter: { userId }, pageSize: 1 })).items[0]
}

/** Creates or updates one person's settings. A clash on the unique userId means someone else created it first, so update that one. */
export async function saveProfile(userId: string, patch: Omit<Partial<TeamMemberProfile>, keyof Entity | "userId">) {
  const existing = await profileFor(userId)
  if (existing) return teamProfiles.update(existing.ItemId, patch)
  try {
    await teamProfiles.create({ userId, ...patch })
  } catch (caught) {
    const raced = await profileFor(userId)
    if (!raced) throw caught
    await teamProfiles.update(raced.ItemId, patch)
  }
}

/**
 * Whether this person may approve a PO of this total in home currency (spec
 * 0012 AC-3). An admin with no limit set has no ceiling, so a company is never
 * left with no one able to approve (spec 0027).
 */
export function canApprove(profile: Pick<TeamMemberProfile, "poApprovalLimit"> | undefined, totalInHome: number, isAdmin = false) {
  const limit = approvalLimit(profile)
  if (limit == null) return isAdmin
  return limit >= totalInHome - 0.005
}
