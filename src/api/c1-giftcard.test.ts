import { describe, expect, it } from 'vitest'
import { createC1Patched, createC1Vulnerable, GIFT_CARD_AMOUNT_CENTS } from './c1-giftcard'

describe('C1 — free-money minting', () => {
  it('VULNERABLE: mint -> redeem -> order ships while revenue stays $0.00', () => {
    const api = createC1Vulnerable()

    // 1. "Buy" a gift card — the vulnerable mint requires no payment.
    const purchase = api.purchaseGiftCard(GIFT_CARD_AMOUNT_CENTS)
    expect(purchase.ok).toBe(true)
    const code = purchase.ok ? purchase.code : undefined
    expect(code).toMatch(/^GC-\d{6}$/)

    // 2. Redeem it immediately — nothing ever checked for payment.
    const redeem = api.redeem(code ?? '')
    expect(redeem.ok).toBe(true)

    // 3. Order real goods with the minted wallet balance.
    const order = api.buyItem('MF-STICKER')
    expect(order.ok).toBe(true)

    // 4. The punchline: goods delivered, money collected = zero.
    const snap = api.snapshot()
    expect(snap.orders).toHaveLength(1)
    expect(snap.orders[0]?.status).toBe('delivered')
    expect(snap.revenueCents).toBe(0)
  })

  it('PATCHED: unpaid card cannot be redeemed; the provider webhook is the only door', () => {
    const api = createC1Patched()

    const purchase = api.purchaseGiftCard(GIFT_CARD_AMOUNT_CENTS)
    expect(purchase.ok).toBe(true)
    const code = purchase.ok ? purchase.code : undefined

    // Redeem before payment -> refused.
    const early = api.redeem(code ?? '')
    expect(early.ok).toBe(false)
    expect(early.ok ? null : early.code).toBe('CARD_NOT_PAID')

    // No free order either.
    const earlyOrder = api.buyItem('MF-STICKER')
    expect(earlyOrder.ok).toBe(false)

    // Provider settles -> card activates and revenue is counted.
    const settle = api.settlePayment(code ?? '')
    expect(settle.ok).toBe(true)
    expect(api.snapshot().revenueCents).toBe(GIFT_CARD_AMOUNT_CENTS)

    // Now redeem works and the order is backed by collected money.
    const redeem = api.redeem(code ?? '')
    expect(redeem.ok).toBe(true)
    const order = api.buyItem('MF-STICKER')
    expect(order.ok).toBe(true)
    expect(api.snapshot().revenueCents).toBe(GIFT_CARD_AMOUNT_CENTS)
    expect(api.snapshot().orders).toHaveLength(1)
  })
})
