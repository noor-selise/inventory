import { blocksClient } from "./client"

// Thin wrappers over blocksClient.data.collection(). A GraphQL response that
// carries an `errors` array is a failure even with HTTP 200, so every call
// goes through unwrap() and throws a readable error instead.

export type Entity = {
  ItemId: string
  CreatedDate?: string
  LastUpdatedBy?: string
  LastUpdatedDate?: string
}

export type ListOptions = {
  filter?: Record<string, unknown>
  sort?: Record<string, 1 | -1>
  pageNo?: number
  pageSize?: number
}

export type ListResult<T> = { items: T[]; totalCount: number }

/** Blocks reports a unique index clash as "A record with the same value for 'x' already exists." */
export const DUPLICATE_PATTERN = /already exists|duplicate|E11000/i

export class BlocksDataError extends Error {
  readonly isDuplicate: boolean

  constructor(message: string) {
    super(message)
    this.name = "BlocksDataError"
    this.isDuplicate = DUPLICATE_PATTERN.test(message)
  }
}

type GatewayResponse = {
  data?: Record<string, unknown> | null
  errors?: { message?: string }[] | null
}

function unwrap(response: unknown, field: string): Record<string, unknown> {
  const { data, errors } = (response ?? {}) as GatewayResponse
  if (errors?.length) {
    throw new BlocksDataError(
      errors.map((error) => error.message ?? "Unknown error").join("; ")
    )
  }
  const value = data?.[field]
  if (!value || typeof value !== "object") {
    throw new BlocksDataError(`The server returned no ${field} result.`)
  }
  return value as Record<string, unknown>
}

function mutationResult(response: unknown, field: string): string {
  const result = unwrap(response, field)
  if (result.acknowledged === false) {
    throw new BlocksDataError(String(result.message || `${field} failed.`))
  }
  return String(result.itemId ?? "")
}

export const AUDIT_FIELDS = ["LastUpdatedBy", "LastUpdatedDate"] as const

/**
 * A DateTime value for a filter. Blocks matches dates only in this form; a
 * plain ISO string in a range filter silently matches nothing.
 */
export function dateFilter(iso: string) {
  return { $date: iso }
}

/** A selection entry: a field name, or a nested selection such as `lines { productId qty }`. */
export type FieldSelection<T> = (keyof T & string) | `${keyof T & string} { ${string} }`

export function collection<T extends Entity>(
  schemaName: string,
  fields: readonly FieldSelection<T>[]
) {
  const helper = blocksClient.data.collection<T>(schemaName, { fields: ["ItemId"] })
  // Query names are `get` + schema name + "s", even for names like Company.
  const listField = `get${schemaName}s`
  const selection = [...new Set(["ItemId", "CreatedDate", ...fields, ...AUDIT_FIELDS])].join("\n")

  return {
    async list(options: ListOptions = {}): Promise<ListResult<T>> {
      const response = await blocksClient.data.graphql({
        query: `query q($input: DynamicQueryInput) { ${listField}(input: $input) { items { ${selection} } totalCount } }`,
        variables: {
          input: {
            filter: options.filter ? JSON.stringify(options.filter) : undefined,
            sort: options.sort ? JSON.stringify(options.sort) : undefined,
            pageNo: options.pageNo ?? 1,
            pageSize: options.pageSize ?? 100,
          },
        },
      })
      const result = unwrap(response, listField)
      const items = (result.items as T[] | undefined) ?? []
      return { items, totalCount: Number(result.totalCount ?? items.length) }
    },
    async get(itemId: string): Promise<T | undefined> {
      return (await this.list({ filter: { ItemId: itemId }, pageSize: 1 })).items[0]
    },
    async create(payload: Omit<Partial<T>, keyof Entity>): Promise<string> {
      return mutationResult(
        await helper.create(payload as Partial<T>),
        `insert${schemaName}`
      )
    },
    async update(
      itemId: string,
      payload: Omit<Partial<T>, keyof Entity>
    ): Promise<void> {
      mutationResult(
        await helper.update(itemId, payload as Partial<T>),
        `update${schemaName}`
      )
    },
    /**
     * Filtered update: changes the records matching `filter` and returns how
     * many changed. Proven atomic per record (spec 0026), so a filter on a
     * version or old value works as compare and set.
     */
    async updateWhere(
      filter: Record<string, unknown>,
      payload: Omit<Partial<T>, keyof Entity>
    ): Promise<number> {
      const field = `update${schemaName}`
      const response = await blocksClient.data.graphql({
        query: `mutation m($filter: String, $input: ${schemaName}UpdateInput!) { ${field}(filter: $filter, input: $input) { acknowledged totalImpactedData message } }`,
        variables: { filter: JSON.stringify(filter), input: payload },
      })
      const result = unwrap(response, field)
      return Number(result.totalImpactedData ?? 0)
    },
    async remove(itemId: string): Promise<void> {
      mutationResult(await helper.delete(itemId), `delete${schemaName}`)
    },
  }
}

export type Collection<T extends Entity> = ReturnType<typeof collection<T>>
