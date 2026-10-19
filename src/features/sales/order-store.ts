import type { Collection, Entity } from "@/lib/blocks/data"
import type { OrderBase, OrderEvent } from "./api"

// Every change to a sales or purchase order goes through mutateOrder: read the
// latest copy, work out the change, save it only if the revision is still the
// one read (compare and set, spec 0026), else read again and retry. The whole
// order is one document, so this is atomic for everything inside it.

export class OrderConflictError extends Error {
  constructor() {
    super("Someone else changed this order a moment ago. Reload it and try again.")
    this.name = "OrderConflictError"
  }
}

export type OrderChange<T> = {
  patch: Partial<T>
  event?: Omit<OrderEvent, "at"> | null
}

const ATTEMPTS = 5

export async function mutateOrder<T extends OrderBase>(
  store: Collection<T>,
  orderId: string,
  change: (order: T) => OrderChange<T> | Promise<OrderChange<T>>
): Promise<T> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const order = await store.get(orderId)
    if (!order) throw new Error("This order no longer exists.")
    const { patch, event } = await change(order)
    const revision = order.revision ?? null
    const history = event ? [...(order.history ?? []), { at: new Date().toISOString(), ...event }] : undefined
    const payload = { ...patch, ...(history ? { history } : {}), revision: (revision ?? 0) + 1 } as Partial<T>
    const changed = await store.updateWhere({ ItemId: orderId, revision }, payload as Omit<Partial<T>, keyof Entity>)
    if (changed === 1) return { ...order, ...payload }
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 150 * (attempt + 1)))
  }
  throw new OrderConflictError()
}
