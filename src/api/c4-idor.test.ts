import { describe, expect, it } from 'vitest'
import { createC4Patched, createC4Vulnerable } from './c4-idor'
import type { Session } from './types'

const YOU: Session = { userId: 'you', role: 'customer' }
const STAFF: Session = { userId: 'staff_1', role: 'staff' }

describe('C4 — IDOR on order lookup', () => {
  it('VULNERABLE: any logged-in customer reads any order by reference', () => {
    const api = createC4Vulnerable(YOU)

    const res = api.lookup('MF-1001')
    expect(res.ok).toBe(true)

    // Someone else's PII, served to you on a plate.
    expect(res.order?.ownerId).toBe('cust_a')
    expect(res.order?.shippingAddress).toContain('Marta Kowalski')
    expect(res.order?.phone).toBe('+48 601 234 567')

    // The whole reference range is walkable.
    for (const ref of ['MF-1002', 'MF-1003']) {
      expect(api.lookup(ref).ok).toBe(true)
    }
  })

  it('PATCHED: not-yours answers exactly like not-found — no leak, no oracle', () => {
    const api = createC4Patched(YOU)

    const someoneElses = api.lookup('MF-1001')
    const nonexistent = api.lookup('MF-9999')

    expect(someoneElses.ok).toBe(false)
    expect(someoneElses.order).toBeUndefined()

    // Identical response for both: an attacker cannot even tell it exists.
    expect(someoneElses).toEqual(nonexistent)

    // The owner still sees their own order.
    expect(api.lookup('MF-1007').ok).toBe(true)
  })

  it('PATCHED: staff keep access — the check that "would break staff" does not', () => {
    const api = createC4Patched(STAFF)
    const res = api.lookup('MF-1001')
    expect(res.ok).toBe(true)
    expect(res.order?.ownerId).toBe('cust_a')
  })
})
