// EAN-13 barcodes. Generated codes start with 2, the range set aside for
// in store use, so they never clash with a manufacturer's code (PRD-P2).

export function ean13CheckDigit(first12: string): number {
  const sum = [...first12].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0
  )
  return (10 - (sum % 10)) % 10
}

export function generateEan13(): string {
  const random = crypto.getRandomValues(new Uint32Array(2))
  const body = `2${String(random[0] % 100_000).padStart(5, "0")}${String(random[1] % 1_000_000).padStart(6, "0")}`
  return `${body}${ean13CheckDigit(body)}`
}

export function normalizeBarcode(value: string): string {
  return value.replace(/\s+/g, "")
}
