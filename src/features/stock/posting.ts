// The one place stock changes are written (spec 0007, decision in spec 0026).
//
// Blocks has no multi record transactions, but a filtered update is an atomic
// compare and set on one record. Each line:
//   1. insert an InventoryMovement as `pending` with a unique postingKey,
//   2. compare and set the InventoryBalance on its `version`,
//   3. mark the movement `posted`.
// A movement left `pending` is settled by repairPending() using the balance's
// appliedKeys. When a document fails partway, the lines already posted are
// undone and both sides are marked `reversed`, so they drop out of the ledger
// sums and a retry posts them again under a fresh key. No app imports, so Node
// scripts can run this module too.

type GraphqlClient = {
  data: { graphql(request: { query: string; variables?: Record<string, unknown> }): Promise<unknown> }
}

export type SourceType =
  | "adjustment"
  | "adjustment_reversal"
  | "transfer_send"
  | "transfer_receive"
  | "transfer_reversal"
  | "purchase_receive"
  | "po_unstock"
  | "purchase_reversal"
  | "sales_pick"
  | "sales_restock"
  | "sales_reversal"
  | "mo_pick"
  | "mo_put"
  | "rollback"

export type PostingLine = {
  lineId: string
  productId: string
  locationId: string
  sublocationId?: string | null
  lotId?: string | null
  serial?: string | null
  /** Signed quantity in the product's standard unit. */
  qtyDelta: number
  enteredQty?: number | null
  enteredUom?: string | null
  unitCost?: number | null
}

export type PostingSource = {
  sourceType: SourceType
  sourceId: string
  sourceNumber?: string | null
  effectiveAt?: string
  note?: string | null
}

export type PostingOptions = {
  /** Let on hand go below zero (Admin or Manager, confirmed by the user). */
  allowNegative?: boolean
}

export type Balance = {
  ItemId: string
  productId: string
  locationId: string
  sublocationId: string | null
  lotId: string | null
  serial: string | null
  onHand: number
  picked: number
  version: number
  appliedKeys: string[] | null
}

export type Movement = {
  ItemId: string
  productId: string
  locationId: string
  sublocationId: string | null
  lotId: string | null
  serial: string | null
  qtyDelta: number
  enteredQty: number | null
  enteredUom: string | null
  unitCost: number | null
  sourceType: string
  sourceId: string
  sourceNumber: string | null
  sourceLineId: string | null
  effectiveAt: string
  status: "pending" | "posted" | "failed" | "reversed"
  postingKey: string
  note: string | null
  CreatedDate?: string
  LastUpdatedBy?: string
}

export class PostingError extends Error {
  readonly code: "insufficient_stock" | "serial_out_of_range" | "conflict_retry_exhausted" | "server_error"
  readonly line?: PostingLine

  constructor(code: PostingError["code"], message: string, line?: PostingLine) {
    super(message)
    this.name = "PostingError"
    this.code = code
    this.line = line
  }
}

const MAX_ATTEMPTS = 10
const KEPT_KEYS = 50
const PENDING_GRACE_MS = 2 * 60_000

const BALANCE_FIELDS = "ItemId productId locationId sublocationId lotId serial onHand picked version appliedKeys"
const MOVEMENT_FIELDS =
  "ItemId productId locationId sublocationId lotId serial qtyDelta enteredQty enteredUom unitCost sourceType sourceId sourceNumber sourceLineId effectiveAt status postingKey note CreatedDate LastUpdatedBy"

type GatewayResponse = { data?: Record<string, unknown> | null; errors?: { message?: string }[] | null }

/** Random wait that grows with each retry, so racing writers spread out. */
function backoff(attempt: number) {
  const ms = Math.random() * Math.min(1000, 40 * 2 ** attempt)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Blocks reports a unique index clash as "A record with the same value for 'x' already exists."
function isDuplicate(message: string) {
  return /already exists|duplicate|E11000/i.test(message)
}

async function gql<T>(client: GraphqlClient, field: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = (await client.data.graphql({ query, variables })) as GatewayResponse
  if (response?.errors?.length) {
    throw new PostingError("server_error", response.errors.map((error) => error.message ?? "Unknown error").join("; "))
  }
  return response?.data?.[field] as T
}

type MutationResult = { acknowledged?: boolean; itemId?: string; message?: string; totalImpactedData?: number }

async function insert(client: GraphqlClient, schema: string, input: Record<string, unknown>): Promise<string> {
  const field = `insert${schema}`
  const result = await gql<MutationResult>(
    client,
    field,
    `mutation m($input: ${schema}InsertInput!) { ${field}(input: $input) { acknowledged itemId message } }`,
    { input }
  )
  if (!result || result.acknowledged === false) {
    throw new PostingError("server_error", result?.message ?? `${schema} insert was not acknowledged`)
  }
  return String(result.itemId)
}

/** Filtered update. Returns how many records changed (0 means the filter no longer matched). */
async function update(client: GraphqlClient, schema: string, filter: Record<string, unknown>, input: Record<string, unknown>) {
  const field = `update${schema}`
  const result = await gql<MutationResult>(
    client,
    field,
    `mutation m($filter: String, $input: ${schema}UpdateInput!) { ${field}(filter: $filter, input: $input) { acknowledged totalImpactedData message } }`,
    { filter: JSON.stringify(filter), input }
  )
  return Number(result?.totalImpactedData ?? 0)
}

async function list<T>(
  client: GraphqlClient,
  schema: string,
  fields: string,
  filter: Record<string, unknown>,
  options: { sort?: Record<string, 1 | -1>; pageNo?: number; pageSize?: number } = {}
): Promise<{ items: T[]; totalCount: number }> {
  const field = `get${schema}s`
  const result = await gql<{ items?: T[]; totalCount?: number }>(
    client,
    field,
    `query q($input: DynamicQueryInput) { ${field}(input: $input) { items { ${fields} } totalCount } }`,
    {
      input: {
        filter: JSON.stringify(filter),
        sort: options.sort ? JSON.stringify(options.sort) : undefined,
        pageNo: options.pageNo ?? 1,
        pageSize: options.pageSize ?? 200,
      },
    }
  )
  return { items: result?.items ?? [], totalCount: Number(result?.totalCount ?? 0) }
}

function balanceKey(line: Pick<PostingLine, "productId" | "locationId" | "sublocationId" | "lotId" | "serial">) {
  return {
    productId: line.productId,
    locationId: line.locationId,
    sublocationId: line.sublocationId || null,
    lotId: line.lotId || null,
    serial: line.serial?.trim() || null,
  }
}

export function postingKeyFor(source: Pick<PostingSource, "sourceType" | "sourceId">, lineId: string) {
  return `${source.sourceType}:${source.sourceId}:${lineId}`
}

export function createPosting(client: GraphqlClient) {
  async function readBalance(line: PostingLine): Promise<Balance | undefined> {
    const { items } = await list<Balance>(client, "InventoryBalance", BALANCE_FIELDS, balanceKey(line), { pageSize: 1 })
    return items[0]
  }

  async function ensureBalance(line: PostingLine): Promise<Balance> {
    const existing = await readBalance(line)
    if (existing) return existing
    const record = { ...balanceKey(line), onHand: 0, picked: 0, version: 0, appliedKeys: [] as string[] }
    try {
      const itemId = await insert(client, "InventoryBalance", record)
      return { ItemId: itemId, ...record }
    } catch (error) {
      // Created by someone else at the same moment: the unique index stopped ours.
      if (error instanceof Error && isDuplicate(error.message)) {
        const again = await readBalance(line)
        if (again) return again
      }
      throw error
    }
  }

  async function findMovement(postingKey: string): Promise<Movement | undefined> {
    const { items } = await list<Movement>(client, "InventoryMovement", MOVEMENT_FIELDS, { postingKey }, { pageSize: 1 })
    return items[0]
  }

  async function setStatus(movementId: string, status: Movement["status"]) {
    await update(client, "InventoryMovement", { ItemId: movementId }, { status })
  }

  /** Posts one line. Safe to call again with the same source and lineId. */
  async function postLine(line: PostingLine, source: PostingSource, options: PostingOptions = {}): Promise<Movement["ItemId"]> {
    if (!Number.isFinite(line.qtyDelta) || line.qtyDelta === 0) {
      throw new PostingError("server_error", "A stock line needs a quantity other than zero.", line)
    }
    const baseKey = postingKeyFor(source, line.lineId)
    const effectiveAt = source.effectiveAt ?? new Date().toISOString()

    // A key whose movement failed or was reversed never changed stock, so a
    // retry moves on to the next generation of the key (base, base#2, ...).
    let postingKey = baseKey
    let movementId = ""
    for (let generation = 1; !movementId; generation++) {
      postingKey = generation === 1 ? baseKey : `${baseKey}#${generation}`
      try {
        movementId = await insert(client, "InventoryMovement", {
          ...balanceKey(line),
          qtyDelta: line.qtyDelta,
          enteredQty: line.enteredQty ?? null,
          enteredUom: line.enteredUom ?? null,
          unitCost: line.unitCost ?? null,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          sourceNumber: source.sourceNumber ?? null,
          sourceLineId: line.lineId,
          effectiveAt,
          status: "pending",
          postingKey,
          note: source.note ?? null,
        })
      } catch (error) {
        if (!(error instanceof Error && isDuplicate(error.message))) throw error
        // A retry of a posting that already started.
        const existing = await findMovement(postingKey)
        if (!existing) throw error
        if (existing.status === "posted") return existing.ItemId
        if (existing.status === "pending") movementId = existing.ItemId
        if (generation >= MAX_ATTEMPTS) throw new PostingError("server_error", `This line failed to post too many times (${baseKey}).`, line)
      }
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const balance = await ensureBalance(line)
      const applied = balance.appliedKeys ?? []
      if (applied.includes(postingKey)) {
        await setStatus(movementId, "posted")
        return movementId
      }
      const onHand = Number(balance.onHand ?? 0)
      const next = onHand + line.qtyDelta
      if (line.qtyDelta < 0 && next < 0 && !options.allowNegative) {
        await setStatus(movementId, "failed")
        throw new PostingError(
          "insufficient_stock",
          `Not enough stock: ${onHand} on hand, ${-line.qtyDelta} needed.`,
          line
        )
      }
      if (balanceKey(line).serial && (next < 0 || next > 1)) {
        await setStatus(movementId, "failed")
        throw new PostingError(
          "serial_out_of_range",
          next > 1 ? `Serial ${line.serial} is already in stock here.` : `Serial ${line.serial} is not in stock here.`,
          line
        )
      }
      const changed = await update(
        client,
        "InventoryBalance",
        { ItemId: balance.ItemId, version: balance.version },
        {
          onHand: next,
          version: balance.version + 1,
          appliedKeys: [...applied, postingKey].slice(-KEPT_KEYS),
        }
      )
      if (changed === 1) {
        await setStatus(movementId, "posted")
        return movementId
      }
      // Someone else changed this balance first; wait a little, read again, retry.
      await backoff(attempt)
    }
    await setStatus(movementId, "failed")
    throw new PostingError(
      "conflict_retry_exhausted",
      "Stock changed too often while posting. Try again in a moment.",
      line
    )
  }

  /**
   * Posts every line of one document. If a line fails, the lines already posted
   * are reversed, so the document lands all or nothing in effect.
   */
  async function postDocument(lines: PostingLine[], source: PostingSource, options: PostingOptions = {}) {
    const posted: { line: PostingLine; movementId: string }[] = []
    try {
      for (const line of lines) {
        posted.push({ line, movementId: await postLine(line, source, options) })
      }
    } catch (error) {
      for (const { line, movementId } of posted.reverse()) {
        try {
          const undoId = await postLine(
            {
              ...line,
              lineId: `${source.sourceType}:${movementId}`,
              qtyDelta: -line.qtyDelta,
              enteredQty: line.enteredQty == null ? null : -line.enteredQty,
            },
            { ...source, sourceType: "rollback", sourceId: source.sourceId, note: `Undo of ${source.sourceType}` },
            { allowNegative: true }
          )
          // The pair nets to zero on the balance; take both out of the ledger sums.
          await setStatus(undoId, "reversed")
          await setStatus(movementId, "reversed")
        } catch {
          // Left posted: the pair still nets to zero, and repair can find it.
        }
      }
      throw error
    }
  }

  async function movementsFor(sourceType: string, sourceId: string): Promise<Movement[]> {
    const { items } = await list<Movement>(client, "InventoryMovement", MOVEMENT_FIELDS, { sourceType, sourceId }, { pageSize: 500 })
    return items
  }

  /** Writes reversing movements for every posted line of a source (cancel). */
  async function reverseSource(
    sourceType: SourceType,
    sourceId: string,
    reversalType: SourceType,
    options: PostingOptions = { allowNegative: true }
  ) {
    const original = (await movementsFor(sourceType, sourceId)).filter((movement) => movement.status === "posted")
    const lines: PostingLine[] = original.map((movement) => ({
      lineId: movement.sourceLineId ?? movement.ItemId,
      productId: movement.productId,
      locationId: movement.locationId,
      sublocationId: movement.sublocationId,
      lotId: movement.lotId,
      serial: movement.serial,
      qtyDelta: -movement.qtyDelta,
      enteredQty: movement.enteredQty == null ? null : -movement.enteredQty,
      enteredUom: movement.enteredUom,
      unitCost: movement.unitCost,
    }))
    if (lines.length) {
      await postDocument(lines, { sourceType: reversalType, sourceId, sourceNumber: original[0]?.sourceNumber, note: "Cancel" }, options)
    }
    return lines.length
  }

  /**
   * Undoes posted movements one by one and marks each pair `reversed`, so they
   * drop out of the ledger sums and a later cancel does not reverse them again.
   */
  async function undoMovements(movements: Movement[], sourceType: SourceType, note: string) {
    for (const movement of movements) {
      const undoId = await postLine(
        {
          lineId: `undo:${movement.ItemId}`,
          productId: movement.productId,
          locationId: movement.locationId,
          sublocationId: movement.sublocationId,
          lotId: movement.lotId,
          serial: movement.serial,
          qtyDelta: -movement.qtyDelta,
          enteredQty: movement.enteredQty == null ? null : -movement.enteredQty,
          enteredUom: movement.enteredUom,
          unitCost: movement.unitCost,
        },
        { sourceType, sourceId: movement.sourceId, sourceNumber: movement.sourceNumber, note },
        { allowNegative: true }
      )
      await setStatus(undoId, "reversed")
      await setStatus(movement.ItemId, "reversed")
    }
  }

  /** Settles movements stuck in `pending` (spec 0026 repair rule). */
  async function repairPending(now = Date.now()): Promise<{ posted: number; failed: number }> {
    const cutoff = new Date(now - PENDING_GRACE_MS).toISOString()
    const { items } = await list<Movement>(
      client,
      "InventoryMovement",
      MOVEMENT_FIELDS,
      // Blocks matches dates only as { $date }; a plain ISO string matches nothing.
      { status: "pending", CreatedDate: { $lt: { $date: cutoff } } },
      { pageSize: 100 }
    )
    let posted = 0
    let failed = 0
    for (const movement of items) {
      const balance = await readBalance(movement as unknown as PostingLine)
      if (balance?.appliedKeys?.includes(movement.postingKey)) {
        await setStatus(movement.ItemId, "posted")
        posted += 1
      } else {
        await setStatus(movement.ItemId, "failed")
        failed += 1
      }
    }
    return { posted, failed }
  }

  /**
   * Moving average cost on receipt (spec 0007 AC-7), compare and set on
   * Product.costVersion. Call after the receipt's stock is posted.
   */
  async function applyReceiptCost(productId: string, receivedQty: number, landedUnitCost: number) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { items } = await list<{ ItemId: string; averageCost: number | null; costVersion: number | null }>(
        client,
        "Product",
        "ItemId averageCost costVersion",
        { ItemId: productId },
        { pageSize: 1 }
      )
      const product = items[0]
      if (!product) throw new PostingError("server_error", "Product not found.")
      const balances = await list<Balance>(client, "InventoryBalance", BALANCE_FIELDS, { productId }, { pageSize: 500 })
      const totalAfter = balances.items.reduce((sum, balance) => sum + Number(balance.onHand ?? 0), 0)
      const oldQty = Math.max(0, totalAfter - receivedQty)
      const oldAvg = Number(product.averageCost ?? 0)
      const averageCost =
        oldQty + receivedQty > 0 ? (oldQty * oldAvg + receivedQty * landedUnitCost) / (oldQty + receivedQty) : landedUnitCost
      const version = Number(product.costVersion ?? 0)
      const changed = await update(
        client,
        "Product",
        product.costVersion == null ? { ItemId: productId, costVersion: null } : { ItemId: productId, costVersion: version },
        { averageCost, costVersion: version + 1 }
      )
      if (changed === 1) return averageCost
      await backoff(attempt)
    }
    throw new PostingError("conflict_retry_exhausted", "Cost changed too often while receiving. Try again.")
  }

  /**
   * Moving average cost for an opening stock adjustment, applied once
   * (spec 0029). A compare and set on StockAdjustment.costStatus claims the
   * step first, so a retry, a double click or a second seeder run cannot count
   * the cost twice. Returns false when another run already claimed it. Call
   * after the document's stock is posted. A failure releases the claim; with
   * several products, those already applied would be applied again on the next
   * try, which the product screen avoids by posting one product per document.
   */
  async function applyDocumentCost(adjustmentId: string, lines: { productId: string; qty: number; unitCost: number }[]) {
    const totals = new Map<string, { qty: number; value: number }>()
    for (const line of lines) {
      if (!(line.qty > 0)) continue
      const total = totals.get(line.productId) ?? { qty: 0, value: 0 }
      total.qty += line.qty
      total.value += line.qty * line.unitCost
      totals.set(line.productId, total)
    }
    const claimed = await update(client, "StockAdjustment", { ItemId: adjustmentId, costStatus: null }, { costStatus: "applying" })
    if (claimed !== 1) return false
    try {
      for (const [productId, total] of totals) {
        await applyReceiptCost(productId, total.qty, total.value / total.qty)
      }
      await update(client, "StockAdjustment", { ItemId: adjustmentId, costStatus: "applying" }, { costStatus: "applied" })
      return true
    } catch (error) {
      await update(client, "StockAdjustment", { ItemId: adjustmentId, costStatus: "applying" }, { costStatus: null })
      throw error
    }
  }

  return {
    postLine,
    postDocument,
    reverseSource,
    undoMovements,
    repairPending,
    applyReceiptCost,
    applyDocumentCost,
    movementsFor,
    readBalance,
    async balances(filter: Record<string, unknown>, options?: { pageNo?: number; pageSize?: number; sort?: Record<string, 1 | -1> }) {
      return list<Balance>(client, "InventoryBalance", BALANCE_FIELDS, filter, options)
    },
    async movements(filter: Record<string, unknown>, options?: { pageNo?: number; pageSize?: number; sort?: Record<string, 1 | -1> }) {
      return list<Movement>(client, "InventoryMovement", MOVEMENT_FIELDS, filter, options)
    },
  }
}

export type Posting = ReturnType<typeof createPosting>
