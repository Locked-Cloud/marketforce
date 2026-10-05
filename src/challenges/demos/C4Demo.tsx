import { useState } from 'react'
import { createC4Patched, createC4Vulnerable } from '../../api/c4-idor'
import type { C4Result } from '../../api/c4-idor'
import { money } from '../../api/types'
import { ConsoleLog, useConsole } from '../../components/ConsoleLog'

export function C4Demo({ patched }: { patched: boolean }) {
  const api = patched ? createC4Patched({ userId: 'you', role: 'customer' }) : createC4Vulnerable({ userId: 'you', role: 'customer' })
  const [ref, setRef] = useState('')
  const [last, setLast] = useState<C4Result | null>(null)
  const { entries, cmd, result } = useConsole([
    `marketforce order tracker — ${patched ? 'PATCHED' : 'VULNERABLE'} twin loaded`,
    'session: signed in as you (customer)',
    'your own order is MF-1007 — refs in this store are sequential',
  ])

  const onLookup = (target: string) => {
    const t = target.trim().toUpperCase()
    if (!t) return
    setRef(t)
    cmd(`GET /api/orders/${t}`)
    const r = api.lookup(t)
    result(r)
    setLast(r)
  }

  const pwned = last?.ok === true && last.order !== undefined && last.order.ownerId !== 'you'

  return (
    <div>
      <p style={{ margin: '0 0 12px', color: 'var(--dim)', fontSize: 12.5 }}>
        session: <span style={{ color: 'var(--phos)' }}>you</span> (customer) ·{' '}
        {patched ? 'owner-or-staff check enforced' : 'no ownership check on lookup'}
      </p>

      <div className="controls">
        <label className="field">
          order reference
          <input
            type="text"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onLookup(ref)
            }}
            placeholder="MF-####"
            style={{ width: 140 }}
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={() => onLookup(ref)}>
          LOOKUP
        </button>
        <span className="mini-btns">
          <button type="button" className="btn btn-ghost" onClick={() => onLookup('MF-1007')}>
            yours (MF-1007)
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onLookup('MF-1006')}>
            neighbor (MF-1006)
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onLookup('MF-9999')}>
            nonexistent (MF-9999)
          </button>
        </span>
      </div>

      {last ? (
        last.ok && last.order ? (
          <div className={`order-card${pwned ? ' pwned' : ''}`}>
            <span className="oc-ref">{last.order.reference}</span>{' '}
            {pwned ? <span className="badge badge-red">PII LEAK — owner: {last.order.ownerId}</span> : <span className="badge">yours</span>}
            <dl>
              <dt>owner</dt>
              <dd>{last.order.ownerId}</dd>
              <dt>status</dt>
              <dd>
                {last.order.status} / {last.order.paymentState}
              </dd>
              <dt>items</dt>
              <dd>{last.order.items.map((i) => `${i.qty}x ${i.name}`).join(', ')}</dd>
              <dt>total</dt>
              <dd>{money(last.order.totalCents)}</dd>
              <dt>ship to</dt>
              <dd>{last.order.shippingAddress}</dd>
              <dt>phone</dt>
              <dd>{last.order.phone}</dd>
            </dl>
          </div>
        ) : (
          <p style={{ color: 'var(--red)', fontSize: 13 }}>{last.message}</p>
        )
      ) : null}

      <div style={{ height: 14 }} />
      <ConsoleLog entries={entries} label="order tracker console" />
    </div>
  )
}
