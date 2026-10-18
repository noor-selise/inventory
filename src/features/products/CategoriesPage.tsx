import { PageHeader, SectionCard } from "@/components/app/page"
import { RecordList } from "@/components/app/record-list"
import { useCurrentUser } from "@/app/providers/CurrentUserProvider"
import { Badge } from "@/components/ui/badge"
import { PRODUCT_EDITORS } from "@/features/team/roles"
import { useResource } from "@/hooks/use-resource"
import { categories, categoryPaths, createsCycle, type Category } from "./api"

// A category tree with exactly one company default (spec 0005 AC-7).
export function CategoriesPage() {
  const canEdit = useCurrentUser().hasRole(...PRODUCT_EDITORS)
  const { data, reload } = useResource(() => categories.list({ pageSize: 500 }), [])
  const items = data?.items ?? []
  const paths = categoryPaths(items)
  const pathOf = (id: string) => paths.find((path) => path.value === id)?.label ?? ""

  return (
    <>
      <PageHeader title="Categories" description="Group products into a tree, like Hardware / Fasteners." />
      <SectionCard>
        <RecordList<Category>
          collection={categories}
          noun="Category"
          canEdit={canEdit}
          emptyMessage="No categories yet. Add one and make it the default."
          sort={{ name: 1 }}
          defaultField="isDefault"
          onChanged={() => void reload()}
          fields={[
            { name: "name", label: "Name", type: "text", required: true },
            { name: "parentId", label: "Parent", type: "select", allowNone: true, options: paths },
            { name: "isDefault", label: "Default category for new products", type: "checkbox" },
          ]}
          validate={(values, all, editing) => {
            const parentId = String(values.parentId ?? "")
            if (parentId && createsCycle(all, editing?.ItemId, parentId)) {
              return "A category cannot sit inside itself."
            }
            const name = String(values.name ?? "").trim().toLowerCase()
            const clash = all.some(
              (item) =>
                item.ItemId !== editing?.ItemId &&
                item.name.trim().toLowerCase() === name &&
                (item.parentId ?? "") === parentId
            )
            if (clash) return "A category with this name already exists here."
            if (!values.isDefault && !all.some((item) => item.isDefault && item.ItemId !== editing?.ItemId)) {
              return "One category must be the default. Tick “Default category”."
            }
            return undefined
          }}
          columns={[
            {
              label: "Category",
              render: (category) => (
                <span className="flex items-center gap-2">
                  {pathOf(category.ItemId) || category.name}
                  {category.isDefault ? <Badge variant="success">Default</Badge> : null}
                </span>
              ),
            },
          ]}
        />
      </SectionCard>
    </>
  )
}
