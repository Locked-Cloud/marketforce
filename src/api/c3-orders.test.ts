import { describe, expect, it } from 'vitest'
import { createC3Patched, createC3Vulnerable } from './c3-orders'

describe('C3 — client-trusted state', () => {
  const CRAFTED = {
    items: [{ sku: 'MF-KEYCAP', qty: 2 }],
    status: 'delivered',
    payment_state: 'paid',
  }

  it('VULNERABLE: a hand-crafted delivered+paid order mints loyalty points for free', () => {
    const api = createC3Vulnerable()

    const res = api.createOrder(CRAFTED)
    expect(res.ok).toBe(true)
    const ref = res.ok ? res.reference : undefined

    // 2x keycap set = $90.00 -> 90 loyalty points, tier SILVER.
    const snap = api.snapshot()
    expect(snap.points).toBe(90)
    expect(snap.tier).toBe('SILVER')

    // ...while zero money was ever collected.
    expect(snap.collectedCents).toBe(0)

    // The stored order carries the client's forged state verbatim.
    const stored = snap.orders.find((o) => o.reference === ref)
    expect(stored?.status).toBe('delivered')
    expect(stored?.paymentState).toBe('paid')
  })

  it('PATCHED: server pins the initial state; points need a server-verified transition', () => {
    const api = createC3Patched()

    // Same crafted request — accepted, but stripped of client state.
    const res = api.createOrder(CRAFTED)
    expect(res.ok).toBe(true)
    const ref = res.ok ? res.reference : undefined

    let snap = api.snapshot()
    expect(snap.points).toBe(0)
    const stored = snap.orders.find((o) => o.reference === ref)
    expect(stored?.status).toBe('created')
    expect(stored?.paymentState).toBe('unpaid')

    // Fulfilling before payment is refused — no points either way.
    const earlyFulfill = api.fulfill(ref ?? '')
    expect(earlyFulfill.ok).toBe(false)
    expect(api.snapshot().points).toBe(0)

    // Pay, then deliver: points granted exactly once.
    expect(api.settlePayment(ref ?? '').ok).toBe(true)
    expect(api.fulfill(ref ?? '').ok).toBe(true)
    snap = api.snapshot()
    expect(snap.points).toBe(90)
    expect(snap.collectedCents).toBe(9000)

    // A second fulfill cannot double-grant.
    api.fulfill(ref ?? '')
    expect(api.snapshot().points).toBe(90)
  })
})
