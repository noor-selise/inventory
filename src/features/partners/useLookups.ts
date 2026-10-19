import { useResource } from "@/hooks/use-resource"
import { currencies, paymentTerms, taxingSchemes } from "@/features/settings/api"
import { pricingSchemes } from "@/features/pricing/api"
import { blocksClient } from "@/lib/blocks/client"

// The choice lists a customer or vendor form needs, loaded once per form.
export function usePartnerLookups() {
  return useResource(async () => {
    const [terms, taxes, schemes, money, users] = await Promise.all([
      paymentTerms.list({ sort: { daysDue: 1 } }),
      taxingSchemes.list({ sort: { name: 1 } }),
      pricingSchemes.list({ sort: { name: 1 } }),
      currencies.list({ sort: { code: 1 } }),
      // Sales reps come from the team; people without team access just see none.
      blocksClient.iam.users.list({ pageNo: 1, pageSize: 100 }).catch(() => ({ data: [] })),
    ])
    const active = <T extends { isActive?: boolean | null }>(rows: T[]) => rows.filter((row) => row.isActive !== false)
    return {
      terms: active(terms.items).map((term) => ({ value: term.ItemId, label: term.name })),
      taxes: active(taxes.items).map((scheme) => ({ value: scheme.ItemId, label: scheme.name })),
      schemes: active(schemes.items).map((scheme) => ({ value: scheme.ItemId, label: `${scheme.name} (${scheme.currencyCode})` })),
      defaultSchemeId: schemes.items.find((scheme) => scheme.isDefault)?.ItemId ?? "",
      defaultTaxId: taxes.items.find((scheme) => scheme.isDefault)?.ItemId ?? "",
      currencies: money.items.map((currency) => ({ value: currency.code, label: currency.code })),
      reps: (users.data ?? [])
        .filter((user) => user.active !== false && user.itemId)
        .map((user) => ({
          value: String(user.itemId),
          label: [user.firstName, user.lastName].filter(Boolean).join(" ") || String(user.email ?? ""),
        })),
    }
  }, [])
}
