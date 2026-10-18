import { blocksClient } from "./client"

// Thin wrappers over blocksClient.data.collection(). A GraphQL response that
// carries an `errors` array is a failure even with HTTP 200, so every call
// goes through unwrap() and throws a readable error instead.

export type Entity = {
  ItemId: string
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

export class BlocksDataError extends Error {
  readonly isDuplicate: boolean

  constructor(message: string) {
    super(message)
    this.name = "BlocksDataError"
    this.isDuplicate = /duplicate|E11000|unique/i.test(message)
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

export function collection<T extends Entity>(
  schemaName: string,
  fields: readonly (keyof T & string)[]
) {
  const helper = blocksClient.data.collection<T>(schemaName, {
    fields: [...new Set([...fields, ...AUDIT_FIELDS])],
  })
  // Query names are `get` + schema name + "s", even for names like Company.
  const listField = `get${schemaName}s`

  return {
    async list(options: ListOptions = {}): Promise<ListResult<T>> {
      const result = unwrap(
        await helper.list({ pageNo: 1, pageSize: 100, ...options }),
        listField
      )
      const items = (result.items as T[] | undefined) ?? []
      return { items, totalCount: Number(result.totalCount ?? items.length) }
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
    async remove(itemId: string): Promise<void> {
      mutationResult(await helper.delete(itemId), `delete${schemaName}`)
    },
  }
}

export type Collection<T extends Entity> = ReturnType<typeof collection<T>>
