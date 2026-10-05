import { useState } from 'react'
import {
  C1_CATALOG,
  createC1Patched,
  createC1Vulnerable,
  GIFT_CARD_AMOUNT_CENTS,
} from '../../api/c1-giftcard'
import { money } from '../../api/types'
import { ConsoleLog, Stat, StatBar, useConsole } from '../../components/ConsoleLog'

export function C1Demo({ patched }: { patched: boolean }) {
  const api = patched ? createC1Patched() : createC1Vulnerable()
  const [snap, setSnap] = useState(api.snapshot())
  const [code, setCode] = useState('')
  const { entries, cmd, result, push } = useConsole([
    `marketforce gift-card module — ${patched ? 'PATCHED' : 'VULNERABLE'} twin loaded`,
    'store: fresh · wallet $0.00 · collected $0.00',
  ])

  const refresh = () => setSnap(api.snapshot())

  const onBuyCard = () => {
    cmd(`POST /giftcards/purchase { amount: "${money(GIFT_CARD_AMOUNT_CENTS)}" }`)
    const r = api.purchaseGiftCard(GIFT_CARD_AMOUNT_CENTS)
    result(r)
    if (r.ok && r.code) setCode(r.code)
    refresh()
  }

  const onSettle = (c: string) => {
    cmd(`POST /payments/webhook { card: "${c}" }  // provider server-to-server`)
    result(api.settlePayment(c))
    refresh()
  }

  const onRedeem = () => {
    if (!code.trim()) {
      push('err', 'enter a card code first (or click BUY GIFT CARD)')
      return
    }
    cmd(`POST /giftcards/redeem { code: "${code.trim()}" }`)
    result(api.redeem(code.trim()))
    refresh()
  }

  const onBuyItem = (sku: string) => {
    cmd(`POST /orders { sku: "${sku}", pay_with: "wallet" }`)
    result(api.buyItem(sku))
    refresh()
  }

  const unpaidCards = snap.cards.filter((c) => c.state === 'unpaid')

  return (
    <div>
      <StatBar>
        <Stat label="wallet" value={money(snap.walletCents)} />
        <Stat
          label="collected"
          value={money(snap.revenueCents)}
          tone={snap.revenueCents === 0 && snap.orders.length > 0 ? 'bad' : undefined}
        />
        <Stat label="orders shipped" value={String(snap.orders.length)} />
        <Stat label="cards" value={String(snap.cards.length)} />
      </StatBar>

      <div className="controls">
        <button type="button" className="btn btn-primary" onClick={onBuyCard}>
          BUY GIFT CARD ({money(GIFT_CARD_AMOUNT_CENTS)})
        </button>
        {patched && unpaidCards.length > 0 ? (
          unpaidCards.map((c) => (
            <button
              key={c.code}
              type="button"
              className="btn"
              onClick={() => onSettle(c.code)}
              title="simulates the payment provider's server-to-server callback"
            >
              SETTLE PAYMENT — {c.code} (webhook)
            </button>
          ))
        ) : null}
      </div>

      <div className="controls">
        <label className="field">
          redeem code
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="GC-######"
            style={{ width: 140 }}
          />
        </label>
        <button type="button" className="btn" onClick={onRedeem}>
          REDEEM
        </button>
      </div>

      <div className="controls">
        <span style={{ color: 'var(--dim)', fontSize: 12, letterSpacing: '0.1em' }}>CATALOG:</span>
        {C1_CATALOG.map((item) => (
          <button key={item.sku} type="button" className="btn" onClick={() => onBuyItem(item.sku)}>
            {item.name} — {money(item.unitCents)}
          </button>
        ))}
      </div>

      <ConsoleLog entries={entries} label="store console" />
    </div>
  )
}
