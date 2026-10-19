import { PageHeader, SectionCard } from "@/components/app/page"
import { RecordList, type FieldDef } from "@/components/app/record-list"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useResource } from "@/hooks/use-resource"
import { formatNumber } from "@/lib/format"
import type { Collection } from "@/lib/blocks/data"
import {
  adjustmentReasons,
  carriers,
  paymentMethods,
  paymentTerms,
  taxCodes,
  taxingSchemes,
  type PaymentTerm,
  type SimpleLookup,
  type TaxCode,
  type TaxingScheme,
} from "./api"
import { useCanEditSettings } from "./useCanEdit"

const percent = (value?: number | null) =>
  value === null || value === undefined ? "" : `${formatNumber(value, 4)}%`

function SimpleList({
  source,
  noun,
  emptyMessage,
}: {
  source: Collection<SimpleLookup>
  noun: string
  emptyMessage: string
}) {
  const canEdit = useCanEditSettings()
  return (
    <RecordList<SimpleLookup>
      collection={source}
      noun={noun}
      canEdit={canEdit}
      emptyMessage={emptyMessage}
      sort={{ name: 1 }}
      activeField="isActive"
      defaults={{ isActive: true }}
      // System entries stay; they can be renamed but never deactivated (AC-7).
      isLocked={(record) => record.isSystem === true}
      fields={[{ name: "name", label: "Name", type: "text", required: true, span: "full" }]}
      columns={[
        {
          label: "Name",
          render: (record) => (
            <span className="flex items-center gap-2">
              {record.name}
              {record.isSystem ? <Badge variant="neutral">System</Badge> : null}
            </span>
          ),
        },
      ]}
    />
  )
}

const taxFields: FieldDef[] = [
  { name: "name", label: "Name", type: "text", required: true, span: "full" },
  { name: "tax1Name", label: "Tax 1 name", type: "text", required: true },
  { name: "tax1Rate", label: "Tax 1 rate (%)", type: "number", required: true, min: 0 },
  { name: "tax1OnShipping", label: "Tax 1 applies to shipping", type: "checkbox" },
  { name: "tax2Name", label: "Tax 2 name", type: "text", helper: "Leave empty for a single tax." },
  { name: "tax2Rate", label: "Tax 2 rate (%)", type: "number", min: 0 },
  {
    name: "tax2CompoundsOnTax1",
    label: "Tax 2 is charged on top of tax 1 (compound)",
    type: "checkbox",
    visible: (values) => Boolean(String(values.tax2Name ?? "").trim()),
  },
  {
    name: "tax2OnShipping",
    label: "Tax 2 applies to shipping",
    type: "checkbox",
    visible: (values) => Boolean(String(values.tax2Name ?? "").trim()),
  },
  { name: "isTaxInclusive", label: "Prices include tax", type: "checkbox" },
  { name: "isDefault", label: "Default taxing scheme", type: "checkbox" },
]

function TaxCodes() {
  const canEdit = useCanEditSettings()
  const { data } = useResource(() => taxingSchemes.list({ sort: { name: 1 } }), [])
  const schemes = data?.items ?? []
  const schemeName = (id: string) => schemes.find((scheme) => scheme.ItemId === id)?.name ?? ""

  return (
    <RecordList<TaxCode>
      collection={taxCodes}
      noun="Tax code"
      canEdit={canEdit}
      emptyMessage="No tax codes yet. Tax codes give products their own rates, like reduced or exempt."
      sort={{ name: 1 }}
      activeField="isActive"
      defaults={{ isActive: true }}
      fields={[
        { name: "name", label: "Name", type: "text", required: true, span: "full" },
        {
          name: "taxingSchemeId",
          label: "Taxing scheme",
          type: "select",
          required: true,
          options: schemes.map((scheme) => ({ value: scheme.ItemId, label: scheme.name })),
          span: "full",
        },
        { name: "tax1Rate", label: "Tax 1 rate (%)", type: "number", min: 0 },
        { name: "tax2Rate", label: "Tax 2 rate (%)", type: "number", min: 0 },
      ]}
      columns={[
        { label: "Name", render: (code) => code.name },
        { label: "Scheme", render: (code) => schemeName(code.taxingSchemeId) },
        { label: "Tax 1", numeric: true, render: (code) => percent(code.tax1Rate) },
        { label: "Tax 2", numeric: true, render: (code) => percent(code.tax2Rate) },
      ]}
    />
  )
}

// Payment terms, taxes and the small editable lists (spec 0004 AC-4 to AC-7).
export function ListsPage() {
  const canEdit = useCanEditSettings()

  return (
    <>
      <PageHeader title="Lists and taxes" description="The choices that appear on orders, payments and stock documents." />
      <Tabs defaultValue="terms">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList aria-label="Lookup lists">
            <TabsTrigger value="terms">Payment terms</TabsTrigger>
            <TabsTrigger value="taxes">Taxing schemes</TabsTrigger>
            <TabsTrigger value="tax-codes">Tax codes</TabsTrigger>
            <TabsTrigger value="reasons">Adjustment reasons</TabsTrigger>
            <TabsTrigger value="carriers">Carriers</TabsTrigger>
            <TabsTrigger value="methods">Payment methods</TabsTrigger>
          </TabsList>
        </div>
        <SectionCard className="mt-4">
          <TabsContent value="terms">
            <RecordList<PaymentTerm>
              collection={paymentTerms}
              noun="Payment term"
              canEdit={canEdit}
              emptyMessage="No payment terms yet. Add one like Net 30."
              sort={{ daysDue: 1 }}
              activeField="isActive"
              defaults={{ isActive: true, daysDue: "30" }}
              fields={[
                { name: "name", label: "Name", type: "text", required: true },
                { name: "daysDue", label: "Days until due", type: "integer", required: true, min: 0 },
              ]}
              columns={[
                { label: "Name", render: (term) => term.name },
                { label: "Days due", numeric: true, render: (term) => term.daysDue },
              ]}
            />
          </TabsContent>
          <TabsContent value="taxes">
            <RecordList<TaxingScheme>
              collection={taxingSchemes}
              noun="Taxing scheme"
              canEdit={canEdit}
              emptyMessage="No taxing schemes yet."
              sort={{ name: 1 }}
              activeField="isActive"
              defaultField="isDefault"
              defaults={{ isActive: true }}
              fields={taxFields}
              isLocked={(scheme) => scheme.isDefault === true}
              validate={(values, items, editing) => {
                const hasTax2 = Boolean(String(values.tax2Name ?? "").trim())
                if (hasTax2 && String(values.tax2Rate ?? "") === "") return "Tax 2 needs a rate."
                const others = items.filter((item) => item.ItemId !== editing?.ItemId && item.isDefault)
                if (!values.isDefault && others.length === 0) {
                  return "One taxing scheme must be the default. Tick “Default taxing scheme”."
                }
                return undefined
              }}
              columns={[
                {
                  label: "Name",
                  render: (scheme) => (
                    <span className="flex items-center gap-2">
                      {scheme.name}
                      {scheme.isDefault ? <Badge variant="success">Default</Badge> : null}
                    </span>
                  ),
                },
                {
                  label: "Taxes",
                  render: (scheme) =>
                    [
                      `${scheme.tax1Name ?? ""} ${percent(scheme.tax1Rate)}`,
                      scheme.tax2Name
                        ? `${scheme.tax2Name} ${percent(scheme.tax2Rate)}${scheme.tax2CompoundsOnTax1 ? " (compound)" : ""}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" + "),
                },
                { label: "Prices", render: (scheme) => (scheme.isTaxInclusive ? "Include tax" : "Exclude tax") },
              ]}
            />
          </TabsContent>
          <TabsContent value="tax-codes">
            <TaxCodes />
          </TabsContent>
          <TabsContent value="reasons">
            <SimpleList source={adjustmentReasons} noun="Adjustment reason" emptyMessage="No adjustment reasons yet." />
          </TabsContent>
          <TabsContent value="carriers">
            <SimpleList source={carriers} noun="Carrier" emptyMessage="No carriers yet." />
          </TabsContent>
          <TabsContent value="methods">
            <SimpleList source={paymentMethods} noun="Payment method" emptyMessage="No payment methods yet." />
          </TabsContent>
        </SectionCard>
      </Tabs>
    </>
  )
}
