import { describe, expect, it } from 'vitest'
import { createC2Patched, createC2Vulnerable } from './c2-enumeration'

describe('C2 — enumeration oracle', () => {
  it('VULNERABLE: distinct errors map the code space and failed probes never burn quota', () => {
    const api = createC2Vulnerable()

    // Three distinguishable failure modes -> an oracle over ~1M codes.
    expect(api.probe('12x')).toMatchObject({ ok: false, code: 'INVALID_FORMAT' })
    expect(api.probe('999999')).toMatchObject({ ok: false, code: 'NOT_ISSUED' })
    expect(api.probe('100000')).toMatchObject({ ok: false, code: 'ALREADY_REDEEMED' })

    // The transactional twist: every raise rolled the quota bump back.
    expect(api.attemptsUsed()).toBe(0)

    // So probing is free — 25 failures later, still no lockout, still talking.
    for (let i = 0; i < 25; i++) api.probe(String(200000 + i))
    expect(api.attemptsUsed()).toBe(0)

    // And the oracle still answers distinctly, then a live code redeems.
    const live = api.probe('417293')
    expect(live.ok).toBe(true)
    expect(api.walletCents()).toBe(2500)
  })

  it('PATCHED: every failure mode answers identically — no oracle', () => {
    const api = createC2Patched()

    const format = api.probe('12x')
    const notIssued = api.probe('999999')
    const burned = api.probe('100000')

    for (const r of [format, notIssued, burned]) {
      expect(r).toEqual({ ok: false, code: 'REDEEM_FAILED', message: 'redeem failed' })
    }
  })

  it('PATCHED: every probe burns quota — lockout hits even before a live code', () => {
    const api = createC2Patched()

    // A live code still works within quota (the patch broke nothing).
    const live = createC2Patched().probe('417293')
    expect(live.ok).toBe(true)

    // Burn the whole quota on garbage probes.
    for (let i = 0; i < 5; i++) {
      const r = api.probe(String(700000 + i))
      expect(r.ok).toBe(false)
    }
    expect(api.attemptsUsed()).toBe(5)

    // The live card is now unreachable: uniform REDEEM_FAILED, no hint it exists.
    const after = api.probe('417293')
    expect(after).toEqual({ ok: false, code: 'REDEEM_FAILED', message: 'redeem failed' })
    expect(api.walletCents()).toBe(0)
  })
})
