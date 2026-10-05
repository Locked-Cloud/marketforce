// C3 — "CLIENT-TRUSTED STATE"
//
// Real-world origin (WOKOOD, 2026 audit): the order-create endpoint accepted
// the client's entire payload — including `status` and `payment_state` — and
// stored it verbatim. The store UI only ever sent created/unpaid, but the API
// never checked. A loyalty-points trigger granted points to any order that
// ARRIVED already marked delivered+paid, so a hand-crafted request minted
// points, tiers, and discount eligibility out of thin air.

import { money, type Order, type OrderItem, type OrderStatus, type PaymentState } from './types'

export const C3_CATALOG = [
  { sku: 'MF-MUG', name: 'terminal mug', unitCents: 1800 },
  { sku: 'MF-KEYCAP', name: 'phosphor-green keycap set', unitCents: 4500 },
] as const

export interface C3OrderInput {
  items: { sku: string; qty: number }[]
  status?: string
  payment_state?: string
}

export interface C3Snapshot {
  points: number
  tier: string
  collectedCents: number
  orders: Order[]
}

export type C3Result =
  | { ok: true; message: string; reference?: string; order?: Order }
  | { ok: false; code: string; message: string }

export interface C3Api {
  mode: 'vulnerable' | 'patched'
  snapshot(): C3Snapshot
  /** POST /api/orders */
  createOrder(input: C3OrderInput): C3Result
  /** POST /payments/webhook — provider callback for a given order. */
  settlePayment(reference: string): C3Result
  /** POST /api/orders/:ref/fulfill — staff/ops server-side delivery transition. */
  fulfill(reference: string): C3Result
}

/** Loyalty rule: 1 point per whole dollar of order value. */
export function pointsFor(totalCents: number): number {
  return Math.floor(totalCents / 100)
}

export function tierFor(points: number): string {
  if (points >= 150) return 'GOLD'
  if (points >= 50) return 'SILVER'
  return 'BRONZE'
}

function resolveItems(input: C3OrderInput): { items: OrderItem[]; totalCents: number } | null {
  const items: OrderItem[] = []
  for (const line of input.items) {
    const product = C3_CATALOG.find((p) => p.sku === line.sku)
    if (!product) return null
    const qty = Math.max(1, Math.floor(line.qty) || 1)
    items.push({ sku: product.sku, name: product.name, unitCents: product.unitCents, qty })
  }
  if (items.length === 0) return null
  const totalCents = items.reduce((sum, i) => sum + i.unitCents * i.qty, 0)
  return { items, totalCents }
}

function baseState() {
  return {
    points: 0,
    collectedCents: 0,
    orders: new Map<string, Order>(),
    nextRef: 2001,
  }
}

function syncSnapshot(s: ReturnType<typeof baseState>): C3Snapshot {
  return {
    points: s.points,
    tier: tierFor(s.points),
    collectedCents: s.collectedCents,
    orders: [...s.orders.values()],
  }
}

export function createC3Vulnerable(): C3Api {
  const s = baseState()

  function grantLoyaltyPoints(order: Order): number {
    const pts = pointsFor(order.totalCents)
    order.pointsGranted = pts
    s.points += pts
    return pts
  }

  return {
    mode: 'vulnerable',

    snapshot: () => syncSnapshot(s),

    createOrder(input) {
      const resolved = resolveItems(input)
      if (!resolved) return { ok: false, code: 'BAD_ITEMS', message: 'no valid line items' }
      const reference = `MF-${s.nextRef++}`
      // THE BUG — the server copies client-controlled state fields verbatim.
      // The UI only ever sends created/unpaid... but the API never checks.
      const status = (input.status ?? 'created') as OrderStatus
      const paymentState = (input.payment_state ?? 'unpaid') as PaymentState
      const order: Order = {
        reference,
        ownerId: 'you',
        items: resolved.items,
        totalCents: resolved.totalCents,
        status,
        paymentState,
        pointsGranted: 0,
        shippingAddress: '14 Rue du Terminal',
        phone: '+33 6 12 34 56 78',
      }
      // Loyalty trigger: any order ARRIVING as delivered+paid gets points.
      if (status === 'delivered' && paymentState === 'paid') {
        const pts = grantLoyaltyPoints(order)
        s.orders.set(reference, order)
        return {
          ok: true,
          reference,
          order,
          message: `order ${reference} created (delivered/paid on arrival) — loyalty +${pts} pts`,
        }
      }
      s.orders.set(reference, order)
      return { ok: true, reference, order, message: `order ${reference} created (${status}/${paymentState})` }
    },

    settlePayment(reference) {
      const order = s.orders.get(reference)
      if (!order) return { ok: false, code: 'NOT_FOUND', message: `no order ${reference}` }
      order.paymentState = 'paid'
      s.collectedCents += order.totalCents
      return { ok: true, message: `payment settled for ${reference} (+${money(order.totalCents)})` }
    },

    fulfill(reference) {
      const order = s.orders.get(reference)
      if (!order) return { ok: false, code: 'NOT_FOUND', message: `no order ${reference}` }
      order.status = 'delivered'
      if (order.paymentState === 'paid' && order.pointsGranted === 0) {
        const pts = grantLoyaltyPoints(order)
        return { ok: true, message: `${reference} delivered — loyalty +${pts} pts` }
      }
      return { ok: true, message: `${reference} delivered` }
    },
  }
}

export function createC3Patched(): C3Api {
  const s = baseState()

  // PATCH — points are granted by a server-verified transition only, and the
  // ledger guard (`pointsGranted === 0`) makes the grant idempotent.
  function grantLoyaltyPoints(order: Order): number {
    if (order.pointsGranted !== 0) return 0
    const pts = pointsFor(order.totalCents)
    order.pointsGranted = pts
    s.points += pts
    return pts
  }

  return {
    mode: 'patched',

    snapshot: () => syncSnapshot(s),

    createOrder(input) {
      const resolved = resolveItems(input)
      if (!resolved) return { ok: false, code: 'BAD_ITEMS', message: 'no valid line items' }
      const reference = `MF-${s.nextRef++}`
      // PATCH — initial state is pinned server-side. Client-supplied status
      // and payment_state are dropped entirely: an order is BORN created and
      // unpaid, whatever the request body claims.
      const order: Order = {
        reference,
        ownerId: 'you',
        items: resolved.items,
        totalCents: resolved.totalCents,
        status: 'created',
        paymentState: 'unpaid',
        pointsGranted: 0,
        shippingAddress: '14 Rue du Terminal',
        phone: '+33 6 12 34 56 78',
      }
      s.orders.set(reference, order)
      const ignored = [input.status, input.payment_state].filter((v) => v && v !== 'created' && v !== 'unpaid')
      const note = ignored.length > 0 ? ` (ignored client fields: ${ignored.join(', ')})` : ''
      return { ok: true, reference, order, message: `order ${reference} created (created/unpaid)${note}` }
    },

    settlePayment(reference) {
      const order = s.orders.get(reference)
      if (!order) return { ok: false, code: 'NOT_FOUND', message: `no order ${reference}` }
      if (order.paymentState === 'paid') {
        return { ok: false, code: 'SETTLE_REFUSED', message: `${reference} already settled` }
      }
      order.paymentState = 'paid'
      s.collectedCents += order.totalCents
      return { ok: true, message: `payment settled for ${reference} (+${money(order.totalCents)})` }
    },

    fulfill(reference) {
      const order = s.orders.get(reference)
      if (!order) return { ok: false, code: 'NOT_FOUND', message: `no order ${reference}` }
      // PATCH — delivery is a server-verified transition: no points unless
      // the payment provider actually settled first.
      if (order.paymentState !== 'paid') {
        return { ok: false, code: 'PAYMENT_REQUIRED', message: `${reference} refused — payment not settled` }
      }
      if (order.status !== 'delivered') order.status = 'delivered'
      const pts = grantLoyaltyPoints(order)
      return pts > 0
        ? { ok: true, message: `${reference} delivered — loyalty +${pts} pts` }
        : { ok: true, message: `${reference} delivered (points already granted)` }
    },
  }
}
