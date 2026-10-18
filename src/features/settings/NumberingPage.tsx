import { PageHeader, SectionCard } from "@/components/app/page"
import { RecordList } from "@/components/app/record-list"
import { numberingRules, type NumberingRule } from "./api"
import { DEFAULT_PADDING, DOCUMENT_TYPES, formatDocumentNumber } from "./numbering"
import { useCanEditSettings } from "./useCanEdit"

const typeLabel = (value: string) =>
  DOCUMENT_TYPES.find((type) => type.value === value)?.label ?? value

// Prefix plus padded running number per document type (spec 0004 AC-3).
export function NumberingPage() {
  const canEdit = useCanEditSettings()

  return (
    <>
      <PageHeader
        title="Numbering"
        description="How new documents are numbered. A rule is created with a sensible default the first time a document type is used."
      />
      <SectionCard>
        <RecordList<NumberingRule>
          collection={numberingRules}
          noun="Numbering rule"
          canEdit={canEdit}
          emptyMessage="No numbering rules yet. They appear when you create your first document, or add one now."
          sort={{ documentType: 1 }}
          defaults={{ padding: String(DEFAULT_PADDING), nextNumber: "1" }}
          fields={[
            {
              name: "documentType",
              label: "Document type",
              type: "select",
              required: true,
              options: DOCUMENT_TYPES.map(({ value, label }) => ({ value, label })),
            },
            { name: "prefix", label: "Prefix", type: "text", mono: true, helper: "For example SO-" },
            { name: "padding", label: "Digits", type: "integer", min: 1, required: true },
            {
              name: "nextNumber",
              label: "Next number",
              type: "integer",
              min: 1,
              required: true,
              helper: "Lowering it can cause a clash; the save then retries with the next free number.",
            },
          ]}
          validate={(values, items, editing) =>
            items.some((item) => item.documentType === values.documentType && item.ItemId !== editing?.ItemId)
              ? "This document type already has a rule."
              : undefined
          }
          columns={[
            { label: "Document type", render: (rule) => typeLabel(rule.documentType) },
            { label: "Prefix", render: (rule) => <span className="font-mono">{rule.prefix}</span> },
            {
              label: "Next number",
              render: (rule) => (
                <span className="font-mono">{formatDocumentNumber(rule, rule.nextNumber)}</span>
              ),
            },
          ]}
        />
      </SectionCard>
    </>
  )
}
