import type { Collection } from "@/lib/blocks/data"
import { posting } from "@/features/stock/api"
import type { PostingLine, SourceType } from "@/features/stock/posting.ts"
import type { OrderBase, OrderEvent, StockStep, StockStepLine } from "./api"
import { mutateOrder } from "./order-store"

// A stock step (pick, restock, receive, unstock) on an order, in three writes:
//   1. the order records the step as `posting` and its progress, in one
//      compare and set save, so two people can never pick the same units;
//   2. the stock posts through spec 0007 (all lines or none, in effect);
//   3. the order marks the step `posted`, or `failed` with the progress undone.
// A closed browser between 1 and 3 leaves a `posting` step that finishStep()
// settles from the ledger.

export type StepPlan<T> = {
  lines: StockStepLine[]
  /** The order fields the step changes (line progress), before statuses. */
  patch: Partial<T>
  posting: PostingLine[]
  details: string
}

export type StepConfig<T extends OrderBase> = {
  store: Collection<T>
  orderId: string
  kind: StockStep["kind"]
  sourceType: SourceType
  by: string
  /** Works out the step from the latest copy of the order; throw to refuse. */
  plan: (order: T, stepId: string) => StepPlan<T> | Promise<StepPlan<T>>
  /** Takes the step's progress back out of the order. */
  undo: (order: T, step: StockStep) => Partial<T>
  /** Derived fields (statuses, cost) for the order after a change. */
  derive: (order: T) => Partial<T>
  allowNegative?: boolean
}

function setStepStatus(steps: StockStep[] | null | undefined, stepId: string, status: StockStep["status"]) {
  return (steps ?? []).map((step) => (step.stepId === stepId ? { ...step, status } : step))
}

export async function runStockStep<T extends OrderBase>(config: StepConfig<T>): Promise<T> {
  const stepId = crypto.randomUUID()
  let planned: StepPlan<T> | undefined
  const started = await mutateOrder(config.store, config.orderId, async (order) => {
    planned = await config.plan(order, stepId)
    const step: StockStep = { stepId, kind: config.kind, at: new Date().toISOString(), by: config.by, status: "posting", lines: planned.lines }
    const next = { ...order, ...planned.patch, stockSteps: [...(order.stockSteps ?? []), step] }
    return {
      patch: { ...planned.patch, stockSteps: next.stockSteps, ...config.derive(next) },
      event: { by: config.by, action: config.kind, details: planned.details },
    }
  })
  const plan = planned as StepPlan<T>
  try {
    if (plan.posting.length) {
      await posting.postDocument(
        plan.posting,
        { sourceType: config.sourceType, sourceId: config.orderId, sourceNumber: started.number },
        { allowNegative: config.allowNegative }
      )
    }
  } catch (error) {
    await mutateOrder(config.store, config.orderId, (order) => {
      const step = (order.stockSteps ?? []).find((item) => item.stepId === stepId)
      const undone = step && step.status === "posting" ? config.undo(order, step) : {}
      const next = { ...order, ...undone, stockSteps: setStepStatus(order.stockSteps, stepId, "failed") }
      return {
        patch: { ...undone, stockSteps: next.stockSteps, ...config.derive(next) },
        event: { by: config.by, action: `${config.kind} failed`, details: error instanceof Error ? error.message : String(error) },
      }
    }).catch(() => undefined)
    throw error
  }
  return mutateOrder(config.store, config.orderId, (order) => {
    const next = { ...order, stockSteps: setStepStatus(order.stockSteps, stepId, "posted") }
    return { patch: { stockSteps: next.stockSteps, ...config.derive(next) } }
  })
}

/**
 * Settles a step left `posting` (the browser closed mid step): posted when
 * every line's movement is in the ledger, else the lines that did post are
 * reversed and the step is undone.
 */
export async function finishStep<T extends OrderBase>(
  config: Pick<StepConfig<T>, "store" | "orderId" | "sourceType" | "undo" | "derive" | "by">,
  step: StockStep,
  reversalType: SourceType,
  /** How many of the step's lines move stock (non stocked lines post nothing). */
  expected: number
) {
  const movements = (await posting.movementsFor(config.sourceType, config.orderId)).filter(
    (movement) => movement.status === "posted" && movement.sourceLineId?.startsWith(`${step.stepId}:`)
  )
  const complete = movements.length >= expected
  if (!complete && movements.length) await posting.undoMovements(movements, reversalType, "Unfinished step undone")
  const event: Omit<OrderEvent, "at"> = { by: config.by, action: complete ? `${step.kind} finished` : `${step.kind} undone`, details: null }
  return mutateOrder(config.store, config.orderId, (order) => {
    const current = (order.stockSteps ?? []).find((item) => item.stepId === step.stepId)
    if (!current || current.status !== "posting") return { patch: {} }
    const undone = complete ? {} : config.undo(order, current)
    const next = { ...order, ...undone, stockSteps: setStepStatus(order.stockSteps, step.stepId, complete ? "posted" : "failed") }
    return { patch: { ...undone, stockSteps: next.stockSteps, ...config.derive(next) }, event }
  })
}
