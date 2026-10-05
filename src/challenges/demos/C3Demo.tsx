import { useState } from 'react'
import { C3_CATALOG, createC3Patched, createC3Vulnerable } from '../../api/c3-orders'
import type { C3OrderInput } from '../../api/c3-orders'
import { money } from '../../api/types'
import { ConsoleLog, Stat, StatBar, useConsole } from '../../components/ConsoleLog'

const RAW_TEMPLATE = JSON.stringify(
  {
    items: [{ sku: 'MF-KEYCAP', qty: 2 }],
    status: 'created',
    payment_state: 'unpaid',
  },
  null,
  2,
)

export function C3Demo({ patched }: { patched: boolean }) {
  const api = patched ? createC3Patched() : createC3Vulnerable()
  const [snap, setSnap] = useState(api.snapshot())
  const [sku, setSku] = useState<string>(C3_CATALOG[0].sku)
  const [qty, setQty] = useState(1)
  const [raw, setRaw] = useState(RAW_TEMPLATE)
  const [lastRef, setLastRef] = useState<string | null>(null)
  const { entries, cmd, result, push } = useConsole([
    `marketforce orders module — ${patched ? 'PATCHED' : 'VULNERABLE'} twin loaded`,
    'loyalty: 1 pt per $1 of order value · tiers: BRONZE / SILVER 50+ / GOLD 150+',
  ])

  const refresh = () => setSnap(api.snapshot())

  const onCreateUiOrder = () => {
    const payload: C3OrderInput = { items: [{ sku, qty }] }
    cmd(`POST /api/orders (as the UI sends it) ${JSON.stringify(payload)}`)
    const r = api.createOrder(payload)
    result(r)
    if (r.ok && r.reference) setLastRef(r.reference)
    refresh()
  }

  const onRawPost = () => {
    let parsed: C3OrderInput
    try {
      parsed = JSON.parse(raw) as C3OrderInput
    } catch {
      push('err', 'malformed JSON — the server would 400, but you knew that')
      return
    }
    cmd(`POST /api/orders (raw body from the client) ${JSON.stringify(parsed)}`)
    const r = api.createOrder(parsed)
    result(r)
    if (r.ok && r.reference) setLastRef(r.reference)
    refresh()
  }

  const onSettle = () => {
    if (!lastRef) return
    cmd(`POST /payments/webhook { order: "${lastRef}" }  // provider server-to-server`)
    result(api.settlePayment(lastRef))
    refresh()
  }

  const onFulfill = () => {
    if (!lastRef) return
    cmd(`POST /api/orders/${lastRef}/fulfill  // ops/staff transition`)
    result(api.fulfill(lastRef))
    refresh()
  }

  const lastOrder = snap.orders.find((o) => o.reference === lastRef)

  return (
    <div>
      <StatBar>
        <Stat label="loyalty points" value={String(snap.points)} tone={snap.points > 0 ? 'good' : undefined} />
        <Stat label="tier" value={snap.tier} />
        <Stat
          label="collected"
          value={money(snap.collectedCents)}
          tone={snap.points > 0 && snap.collectedCents === 0 ? 'bad' : undefined}
        />
        <Stat label="orders" value={String(snap.orders.length)} />
      </StatBar>

      <div className="controls">
        <span className="select-inline">
          item
          <select value={sku} onChange={(e) => setSku(e.target.value)}>
            {C3_CATALOG.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.name} — {money(p.unitCents)}
              </option>
            ))}
          </select>
        </span>
        <span className="select-inline">
          qty
          <input
            type="number"
            min={1}
            max={9}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(9, Number(e.target.value) || 1)))}
            style={{ width: 60 }}
          />
        </span>
        <button type="button" className="btn" onClick={onCreateUiOrder}>
          CREATE ORDER — as the UI sends it
        </button>
      </div>

      <div className="field" style={{ marginBottom: 10 }}>
        <span style={{ marginBottom: 4 }}>raw request body — edit me, then POST</span>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          spellCheck={false}
          aria-label="raw request body"
        />
      </div>

      <div className="controls">
        <button type="button" className="btn btn-primary" onClick={onRawPost}>
          POST /api/orders — raw body
        </button>
        {patched && lastRef ? (
          <>
            <button type="button" className="btn" onClick={onSettle}>
              SETTLE PAYMENT — {lastRef} (webhook)
            </button>
            <button type="button" className="btn" onClick={onFulfill}>
              FULFILL — {lastRef} (ops)
            </button>
          </>
        ) : null}
      </div>

      {lastOrder ? (
        <p style={{ color: 'var(--dim)', fontSize: 12.5, margin: '0 0 12px' }}>
          last order {lastOrder.reference} — status:{' '}
          <span style={{ color: lastOrder.status === 'delivered' ? 'var(--red)' : 'var(--phos)' }}>
            {lastOrder.status}
          </span>{' '}
          / payment: {lastOrder.paymentState} / points granted: {lastOrder.pointsGranted}
        </p>
      ) : null}

      <ConsoleLog entries={entries} label="orders + loyalty console" />
    </div>
  )
}
