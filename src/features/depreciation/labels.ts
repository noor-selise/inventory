/** "July 2026" for a "YYYY-MM" month; "None" when empty. */
export const monthLabel = (period?: string | null) =>
  period ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T00:00:00Z`)) : "None"

/** A stored calendar day ("YYYY-MM-DDT00:00:00Z") shown without shifting across time zones. */
export const dayLabel = (stored?: string | null) => (stored ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(stored)) : "")
