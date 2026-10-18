// Money and dates follow each currency's own rules through the browser's Intl
// (spec 0004 AC-8). Decimals come from the Currency record when known.

export function formatMoney(
  amount: number,
  currencyCode: string,
  decimals?: number | null
): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      currencySign: "accounting",
      ...(decimals === null || decimals === undefined
        ? {}
        : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    }).format(amount)
  } catch {
    return `${amount.toFixed(decimals ?? 2)} ${currencyCode}`
  }
}

export function formatDate(value: string | undefined | null, timeZone?: string): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone }).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
  }
}

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 4): string {
  if (value === null || value === undefined) return ""
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value)
}

export const TIME_ZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf("timeZone")
  } catch {
    return ["UTC"]
  }
})()

export const CURRENCY_CODES: string[] = (() => {
  try {
    return Intl.supportedValuesOf("currency")
  } catch {
    return ["USD", "EUR", "GBP", "BDT"]
  }
})()
