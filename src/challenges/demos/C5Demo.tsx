import { useMemo, useState } from 'react'
import {
  bootC5Patched,
  bootC5Vulnerable,
  CONSOLE_SCREEN,
  createC5Patched,
  createC5Vulnerable,
} from '../../api/c5-router'
import type { C5Api, NavigateResult } from '../../api/c5-router'
import type { Role, Session } from '../../api/types'
import { ConsoleLog, Stat, StatBar, useConsole } from '../../components/ConsoleLog'

interface Booted {
  api: C5Api
  log: string[]
}

function boot(patched: boolean): Booted {
  const api = patched ? createC5Patched() : createC5Vulnerable()
  const log: string[] = [
    `spa mini-router — ${patched ? 'PATCHED' : 'VULNERABLE'} twin loaded`,
    'boot: registering app routes...',
  ]

  if (patched) {
    bootC5Patched(api)
    // A late feature module tries to register /admin again — loudly refused.
    const dup = api.register({ path: '/admin', screen: 'LATE MODULE /admin' })
    log.push(...api.routes().map((r) => `  ${r.path} -> ${r.screen.split(' — ')[0]}${r.guard ? ' (guarded)' : ''}`))
    if (!dup.ok) {
      log.push(`late module register /admin -> REFUSED — ${dup.message}`)
    }
  } else {
    bootC5Vulnerable(api)
    log.push(...api.routes().map((r) => `  ${r.path} -> ${r.screen.split(' — ')[0]}${r.guard ? ' (guarded)' : ' (NO GUARD)'}`))
    for (const r of api.shadowed()) {
      log.push(`  ${r.path} -> ${r.screen.split(' — ')[0]}${r.guard ? ' (guarded)' : ''} ... SILENTLY SHADOWED — never matches`)
    }
  }

  return { api, log }
}

export function C5Demo({ patched }: { patched: boolean }) {
  const { api, log } = useMemo(() => boot(patched), [patched])
  const [role, setRole] = useState<Role>('guest')
  const [nav, setNav] = useState<NavigateResult | null>(null)
  const { entries, cmd, result } = useConsole(log)

  const session: Session = { userId: role === 'guest' ? 'anon' : role === 'staff' ? 'staff_1' : 'you', role }

  const onNavigate = () => {
    cmd(`navigate('/admin') as ${role}`)
    const r = api.navigate('/admin', session)
    result({ ok: r.screen !== '404 — not found', message: r.screen })
    setNav(r)
  }

  const rows = [...api.routes().map((r) => ({ r, shadowed: false })), ...api.shadowed().map((r) => ({ r, shadowed: true }))]

  const screenClass = nav
    ? nav.screen === CONSOLE_SCREEN
      ? 'console-shell'
      : nav.screen.startsWith('ACCESS DENIED')
        ? 'denied'
        : ''
    : ''

  return (
    <div>
      <StatBar>
        <Stat label="/admin registrations" value={String(rows.filter((x) => x.r.path === '/admin').length)} tone={rows.filter((x) => x.r.path === '/admin').length > 1 ? 'bad' : undefined} />
        <Stat label="shadowed routes" value={String(api.shadowed().length)} tone={api.shadowed().length > 0 ? 'bad' : undefined} />
        <Stat label="current role" value={role.toUpperCase()} />
      </StatBar>

      <table className="route-table" aria-label="route table in registration order">
        <thead>
          <tr>
            <th>#</th>
            <th>path</th>
            <th>component</th>
            <th>guard</th>
            <th>status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ r, shadowed }, i) => (
            <tr key={`${r.path}-${i}`} className={shadowed ? 'rt-shadowed' : ''}>
              <td>{i + 1}</td>
              <td className="rt-path">{r.path}</td>
              <td>{r.screen.split(' — ')[0]}</td>
              <td>
                {r.guard ? <span className="rt-guard-yes">staff/login</span> : <span className="rt-guard-no">NONE</span>}
              </td>
              <td>{shadowed ? 'SHADOWED — never matches' : 'live'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="controls" style={{ marginTop: 14 }}>
        <span className="select-inline">
          role
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="guest">guest (logged out)</option>
            <option value="customer">customer</option>
            <option value="staff">staff</option>
          </select>
        </span>
        <button type="button" className="btn btn-primary" onClick={onNavigate}>
          NAVIGATE TO /admin
        </button>
        <span className="mini-btns">
          <button type="button" className="btn btn-ghost" onClick={() => cmd('location.hash = "#/c/5"')}>
            navigate /shop (sanity)
          </button>
        </span>
      </div>

      <div className="screen-frame">
        <div className="sf-label">browser viewport — what renders at /admin</div>
        {nav ? (
          <div className={`sf-content ${screenClass}`}>
            {nav.screen}
            {nav.screen === CONSOLE_SCREEN ? (
              <div className="mini-btns" style={{ marginTop: 10 }} aria-hidden="true">
                <button type="button" className="btn btn-danger" disabled>
                  REFUND ALL ORDERS
                </button>
                <button type="button" className="btn btn-danger" disabled>
                  OVERRIDE PRICES
                </button>
                <button type="button" className="btn btn-danger" disabled>
                  EXPORT CUSTOMERS (PII)
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="sf-content" style={{ color: 'var(--dimmer)' }}>
            no navigation yet — pick a role and navigate to /admin
          </div>
        )}
      </div>

      <div style={{ height: 14 }} />
      <ConsoleLog entries={entries} label="router console" />
    </div>
  )
}
