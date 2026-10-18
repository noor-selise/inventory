import { PageHeader, SectionCard } from "@/components/app/page"
import { RecordList } from "@/components/app/record-list"
import { useResource } from "@/hooks/use-resource"
import { CURRENCY_CODES, formatDate, formatMoney, formatNumber } from "@/lib/format"
import { currencies, exchangeRates, type Currency, type ExchangeRate } from "./api"
import { useCanEditSettings } from "./useCanEdit"

const currencyOptions = CURRENCY_CODES.map((code) => ({ value: code, label: code }))

// Currencies and manual exchange rates with an effective date (spec 0004 AC-2, AC-8).
export function CurrenciesPage() {
  const canEdit = useCanEditSettings()
  const { data } = useResource(() => currencies.list({ sort: { code: 1 } }), [])
  const known = data?.items ?? []
  const rateCurrencyOptions = known.length
    ? known.map((currency) => ({ value: currency.code, label: currency.code }))
    : currencyOptions

  return (
    <>
      <PageHeader
        title="Currencies"
        description="Currencies you trade in and their exchange rates against your home currency."
      />
      <div className="flex flex-col gap-6">
        <SectionCard title="Currencies">
          <RecordList<Currency>
            collection={currencies}
            noun="Currency"
            canEdit={canEdit}
            emptyMessage="No currencies yet. Add the ones you buy or sell in."
            sort={{ code: 1 }}
            defaults={{ decimals: "2" }}
            fields={[
              { name: "code", label: "Code", type: "select", required: true, options: currencyOptions },
              { name: "symbol", label: "Symbol", type: "text" },
              { name: "decimals", label: "Decimals", type: "integer", min: 0, helper: "Digits after the decimal point, 0 to 4." },
            ]}
            validate={(values, items, editing) =>
              items.some((item) => item.code === values.code && item.ItemId !== editing?.ItemId)
                ? `${String(values.code)} is already in the list.`
                : undefined
            }
            columns={[
              { label: "Code", render: (currency) => <span className="font-mono">{currency.code}</span> },
              { label: "Symbol", render: (currency) => currency.symbol },
              {
                label: "Example",
                numeric: true,
                render: (currency) => formatMoney(-1234.5, currency.code, currency.decimals),
              },
            ]}
          />
        </SectionCard>
        <SectionCard
          title="Exchange rates"
          description="Orders in a foreign currency use the latest rate on or before the order date."
        >
          <RecordList<ExchangeRate>
            collection={exchangeRates}
            noun="Exchange rate"
            canEdit={canEdit}
            emptyMessage="No exchange rates yet."
            sort={{ effectiveOn: -1 }}
            defaults={{ effectiveOn: new Date().toISOString().slice(0, 10), source: "manual" }}
            fields={[
              { name: "currencyCode", label: "Currency", type: "select", required: true, options: rateCurrencyOptions },
              { name: "rate", label: "Rate", type: "number", required: true, helper: "Units of this currency per one unit of home currency." },
              { name: "effectiveOn", label: "Effective on", type: "date", required: true },
              { name: "source", label: "Source", type: "select", options: [{ value: "manual", label: "Manual" }] },
            ]}
            validate={(values) => (Number(values.rate) > 0 ? undefined : "Rate must be greater than 0.")}
            columns={[
              { label: "Currency", render: (rate) => <span className="font-mono">{rate.currencyCode}</span> },
              { label: "Rate", numeric: true, render: (rate) => formatNumber(rate.rate, 6) },
              { label: "Effective on", render: (rate) => formatDate(rate.effectiveOn, "UTC") },
            ]}
          />
        </SectionCard>
      </div>
    </>
  )
}
