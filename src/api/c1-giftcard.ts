// C1 — "FREE-MONEY MINTING"
//
// Real-world origin (WOKOOD, 2026 audit): the gift-card purchase endpoint
// minted cards in a redeemable state at request time. The payment step was
// supposed to happen afterwards, but nothing in the data model or the redeem
// path required it. Purchase → redeem → wallet credit → order, all without a
// single cent ever being collected.
//
// The twins below are the lab retelling of that pattern: the vulnerable one
// reproduces the flaw, the patched one is the state machine that shipped
// after the audit.

import { money, type GiftCard, type Order, type OrderItem } from './types'

export const C1_CATALOG: OrderItem[] = [
  { sku: 'MF-HOODIE', name: 'MarketForce hoodie', unitCents: 4200, qty: 1 },
  { sku: 'MF-STICKER', name: 'flag{free_money} sticker pack', unitCents: 999, qty: 1 },
]

export const GIFT_CARD_AMOUNT_CENTS = 2500

export interface C1Snapshot {
  walletCents: number
  revenueCents: number
  cards: GiftCard[]
  orders: Order[]
}

export type C1Result =
  | { ok: true; message: string; code?: string; walletCents?: number; reference?: string }
  | { ok: false; code: string; message: string }

export interface C1Api {
  mode: 'vulnerable' | 'patched'
  snapshot(): C1Snapshot
  /** POST /giftcards/purchase */
  purchaseGiftCard(amountCents: number): C1Result
  /** POST /payments/webhook — the payment provider's server-to-server callback. */
  settlePayment(code: string): C1Result
  /** POST /giftcards/redeem */
  redeem(code: string): C1Result
  /** POST /orders */
  buyItem(sku: string): C1Result
}

function freshCode(): string {
  let digits = ''
  for (let i = 0; i < 6; i++) digits += Math.floor(Math.random() * 10)
  return `GC-${digits}`
}

function baseState() {
  return {
    walletCents: 0,
    revenueCents: 0,
    cards: new Map<string, GiftCard>(),
    orders: [] as Order[],
  }
}

export function createC1Vulnerable(): C1Api {
  const s = baseState()

  return {
    mode: 'vulnerable',

    snapshot: () => ({
      walletCents: s.walletCents,
      revenueCents: s.revenueCents,
      cards: [...s.cards.values()],
      orders: [...s.orders],
    }),

    purchaseGiftCard(amountCents) {
      const code = freshCode()
      // THE BUG — the card is minted 'active': instantly redeemable, no
      // payment required. settlePayment() exists in the codebase, but
      // nothing calls it before redemption, so nothing enforces it.
      s.cards.set(code, { code, amountCents, state: 'active', ownerId: 'you' })
      return {
        ok: true,
        code,
        message: `card ${code} issued — ACTIVE, ready to redeem (${money(amountCents)})`,
      }
    },

    settlePayment(code) {
      const card = s.cards.get(code)
      if (!card) return { ok: false, code: 'NOT_FOUND', message: `no card ${code}` }
      card.state = 'active'
      s.revenueCents += card.amountCents
      return { ok: true, message: `payment settled for ${code} (+${money(card.amountCents)} collected)` }
    },

    redeem(code) {
      const card = s.cards.get(code)
      if (!card) return { ok: false, code: 'REDEEM_FAILED', message: `redeem failed for ${code}` }
      if (card.state === 'redeemed') {
        return { ok: false, code: 'REDEEM_FAILED', message: `card ${code} already redeemed` }
      }
      // Any non-redeemed card sails through — including one nobody ever paid for.
      card.state = 'redeemed'
      s.walletCents += card.amountCents
      return {
        ok: true,
        walletCents: s.walletCents,
        message: `card ${code} redeemed — wallet +${money(card.amountCents)}`,
      }
    },

    buyItem(sku) {
      const item = C1_CATALOG.find((i) => i.sku === sku)
      if (!item) return { ok: false, code: 'NO_SUCH_ITEM', message: `unknown sku ${sku}` }
      if (s.walletCents < item.unitCents) {
        return {
          ok: false,
          code: 'INSUFFICIENT_FUNDS',
          message: `wallet ${money(s.walletCents)} < ${money(item.unitCents)}`,
        }
      }
      s.walletCents -= item.unitCents
      // Digital goods: "delivered" the moment wallet balance pays for it.
      // Note where revenue is NOT counted — nowhere. No provider ever settled.
      const order: Order = {
        reference: `MF-${1000 + s.orders.length}`,
        ownerId: 'you',
        items: [item],
        totalCents: item.unitCents,
        status: 'delivered',
        paymentState: 'paid',
        pointsGranted: 0,
        shippingAddress: '—',
        phone: '—',
      }
      s.orders.push(order)
      return {
        ok: true,
        reference: order.reference,
        message: `order ${order.reference} placed & delivered — ${item.name}. collected so far: ${money(s.revenueCents)}`,
      }
    },
  }
}

export function createC1Patched(): C1Api {
  const s = baseState()

  return {
    mode: 'patched',

    snapshot: () => ({
      walletCents: s.walletCents,
      revenueCents: s.revenueCents,
      cards: [...s.cards.values()],
      orders: [...s.orders],
    }),

    purchaseGiftCard(amountCents) {
      const code = freshCode()
      // PATCH — cards are minted 'unpaid'. The only door to 'active' is the
      // payment provider's webhook, and only that webhook counts revenue.
      s.cards.set(code, { code, amountCents, state: 'unpaid', ownerId: 'you' })
      return {
        ok: true,
        code,
        message: `card ${code} issued — UNPAID, awaiting payment provider (${money(amountCents)})`,
      }
    },

    settlePayment(code) {
      const card = s.cards.get(code)
      if (!card) return { ok: false, code: 'SETTLE_REFUSED', message: `no card ${code}` }
      if (card.state !== 'unpaid') {
        return { ok: false, code: 'SETTLE_REFUSED', message: `card ${code} is not awaiting settlement` }
      }
      card.state = 'active'
      s.revenueCents += card.amountCents
      return { ok: true, message: `payment settled for ${code} (+${money(card.amountCents)} collected)` }
    },

    redeem(code) {
      const card = s.cards.get(code)
      if (!card) return { ok: false, code: 'REDEEM_FAILED', message: `redeem failed for ${code}` }
      if (card.state === 'unpaid') {
        // PATCH — unpaid cards cannot be redeemed. Ever.
        return { ok: false, code: 'CARD_NOT_PAID', message: `card ${code} has not been paid for — redeem refused` }
      }
      if (card.state === 'redeemed') {
        return { ok: false, code: 'REDEEM_FAILED', message: `card ${code} already redeemed` }
      }
      card.state = 'redeemed'
      s.walletCents += card.amountCents
      return {
        ok: true,
        walletCents: s.walletCents,
        message: `card ${code} redeemed — wallet +${money(card.amountCents)}`,
      }
    },

    buyItem(sku) {
      const item = C1_CATALOG.find((i) => i.sku === sku)
      if (!item) return { ok: false, code: 'NO_SUCH_ITEM', message: `unknown sku ${sku}` }
      if (s.walletCents < item.unitCents) {
        return {
          ok: false,
          code: 'INSUFFICIENT_FUNDS',
          message: `wallet ${money(s.walletCents)} < ${money(item.unitCents)}`,
        }
      }
      s.walletCents -= item.unitCents
      const order: Order = {
        reference: `MF-${1000 + s.orders.length}`,
        ownerId: 'you',
        items: [item],
        totalCents: item.unitCents,
        status: 'delivered',
        paymentState: 'paid',
        pointsGranted: 0,
        shippingAddress: '—',
        phone: '—',
      }
      s.orders.push(order)
      return {
        ok: true,
        reference: order.reference,
        message: `order ${order.reference} placed & delivered — ${item.name}. collected so far: ${money(s.revenueCents)}`,
      }
    },
  }
}
