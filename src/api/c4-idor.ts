// C4 — "IDOR ON ORDER LOOKUP"
//
// Real-world origin (WOKOOD, 2026 audit): the order-tracking endpoint looked
// up any order by reference with no ownership predicate. References were
// short, sequential, and printed on every invoice — so any logged-in
// customer could read any other customer's order: address, phone, items,
// totals. Staff shared the same endpoint, and "adding a check would break
// staff" was the reason the check never shipped.

import { money, type Order, type Session } from './types'

export interface C4Result {
  ok: boolean
  code: string
  message: string
  order?: Order
}

export interface C4Api {
  mode: 'vulnerable' | 'patched'
  session: Session
  /** GET /api/orders/:reference */
  lookup(reference: string): C4Result
  references(): string[]
}

function seedOrders(): Map<string, Order> {
  const orders: Order[] = [
    {
      reference: 'MF-1001',
      ownerId: 'cust_a',
      items: [{ sku: 'MF-MUG', name: 'terminal mug', unitCents: 1800, qty: 2 }],
      totalCents: 3600,
      status: 'delivered',
      paymentState: 'paid',
      pointsGranted: 36,
      shippingAddress: 'Marta Kowalski, 9 ul. Fosforowa, apt 41, 00-142 Warsaw, PL',
      phone: '+48 601 234 567',
    },
    {
      reference: 'MF-1002',
      ownerId: 'cust_b',
      items: [{ sku: 'MF-KEYCAP', name: 'phosphor-green keycap set', unitCents: 4500, qty: 1 }],
      totalCents: 4500,
      status: 'delivered',
      paymentState: 'paid',
      pointsGranted: 45,
      shippingAddress: 'Dana Okafor, 27 Phosphor Lane, Lagos, NG',
      phone: '+234 802 555 0199',
    },
    {
      reference: 'MF-1003',
      ownerId: 'cust_a',
      items: [
        { sku: 'MF-MUG', name: 'terminal mug', unitCents: 1800, qty: 1 },
        { sku: 'MF-STICKER', name: 'sticker pack', unitCents: 999, qty: 3 },
      ],
      totalCents: 4797,
      status: 'paid',
      paymentState: 'paid',
      pointsGranted: 47,
      shippingAddress: 'Marta Kowalski, 9 ul. Fosforowa, apt 41, 00-142 Warsaw, PL',
      phone: '+48 601 234 567',
    },
    {
      reference: 'MF-1007',
      ownerId: 'you',
      items: [{ sku: 'MF-STICKER', name: 'flag{almost_too_easy} sticker', unitCents: 499, qty: 1 }],
      totalCents: 499,
      status: 'delivered',
      paymentState: 'paid',
      pointsGranted: 4,
      shippingAddress: 'your place',
      phone: 'your phone',
    },
  ]
  return new Map(orders.map((o) => [o.reference, o]))
}

export function createC4Vulnerable(session: Session): C4Api {
  const orders = seedOrders()

  return {
    mode: 'vulnerable',
    session,
    references: () => [...orders.keys()],
    lookup(reference) {
      const order = orders.get(reference)
      if (!order) return { ok: false, code: 'NOT_FOUND', message: `no order ${reference}` }
      // THE BUG — the order is returned to whoever asks. No ownership
      // predicate, no role check, nothing.
      return {
        ok: true,
        code: 'FOUND',
        message: `order ${reference} — ${order.items.map((i) => `${i.qty}x ${i.name}`).join(', ')} — ${money(order.totalCents)}`,
        order,
      }
    },
  }
}

export function createC4Patched(session: Session): C4Api {
  const orders = seedOrders()

  return {
    mode: 'patched',
    session,
    references: () => [...orders.keys()],
    lookup(reference) {
      const order = orders.get(reference)
      if (!order) return { ok: false, code: 'NOT_FOUND', message: 'order not found' }
      const isOwner = order.ownerId === session.userId
      const isStaff = session.role === 'staff'
      // PATCH — owner-or-staff, and a "not yours" answer is byte-identical
      // to a "does not exist" answer, so the endpoint leaks no existence
      // oracle either (that lesson came from C2).
      if (!isOwner && !isStaff) {
        return { ok: false, code: 'NOT_FOUND', message: 'order not found' }
      }
      return {
        ok: true,
        code: 'FOUND',
        message: `order ${reference} — ${order.items.map((i) => `${i.qty}x ${i.name}`).join(', ')} — ${money(order.totalCents)}`,
        order,
      }
    },
  }
}
