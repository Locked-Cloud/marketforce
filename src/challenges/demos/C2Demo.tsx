import { useState } from 'react'
import { C2_CODE_SPACE, C2_QUOTA, createC2Patched, createC2Vulnerable } from '../../api/c2-enumeration'
import { ConsoleLog, Stat, StatBar, useConsole } from '../../components/ConsoleLog'

export function C2Demo({ patched }: { patched: boolean }) {
  const api = patched ? createC2Patched() : createC2Vulnerable()
  const [attempts, setAttempts] = useState(0)
  const [code, setCode] = useState('')
  const { entries, cmd, result, push } = useConsole([
    `marketforce redeem endpoint — ${patched ? 'PATCHED' : 'VULNERABLE'} twin loaded`,
    `code space: ${C2_CODE_SPACE.toLocaleString('en-US')} codes (6 digits) · quota: ${C2_QUOTA} attempts`,
    'issued cards in this store: 2 (one live, one already burned) — you do not know which',
  ])

  const refresh = () => setAttempts(api.attemptsUsed())

  const onProbe = (raw: string) => {
    const target = raw.trim()
    if (!target) {
      push('err', 'enter a 6-digit code to probe')
      return
    }
    cmd(`POST /giftcards/redeem { code: "${target}" }`)
    result(api.probe(target))
    refresh()
  }

  const onHarvest = () => {
    cmd('for code in random_codes(25): POST /giftcards/redeem')
    let lastMsg = ''
    let sample = 0
    for (let i = 0; i < 25; i++) {
      const c = String(Math.floor(Math.random() * C2_CODE_SPACE)).padStart(6, '0')
      const r = api.probe(c)
      if (sample < 2) {
        push(r.ok ? 'out' : 'err', `${r.ok ? '200 OK' : 'ERR '} ${r.message}`)
        sample++
      }
      lastMsg = r.message
    }
    push('sys', `... 23 more probes elided (last: ${lastMsg})`)
    const used = api.attemptsUsed()
    setAttempts(used)
    if (used === 0) {
      push('err', `HARVEST COMPLETE — attempts used: 0 / ${C2_QUOTA}. every failure rolled its quota bump back.`)
    } else {
      push('sys', `HARVEST COMPLETE — attempts used: ${used} / ${C2_QUOTA}${used >= C2_QUOTA ? ' — LOCKED OUT. uniform failures, no oracle.' : ''}`)
    }
  }

  const usedCells = Math.min(attempts, C2_QUOTA)

  return (
    <div>
      <StatBar>
        <Stat label="attempts used" value={`${Math.min(attempts, C2_QUOTA)} / ${C2_QUOTA}`} tone={attempts >= C2_QUOTA ? 'bad' : undefined} />
        <Stat label="code space" value={C2_CODE_SPACE.toLocaleString('en-US')} />
        <Stat label="wallet" value={`$${(api.walletCents() / 100).toFixed(2)}`} tone="good" />
      </StatBar>

      <div className="controls">
        <label className="field">
          probe a code
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="######"
            maxLength={12}
            style={{ width: 120 }}
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={() => onProbe(code)}>
          SEND PROBE
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onProbe('000000')}>
          probe 000000
        </button>
        <button type="button" className="btn btn-danger" onClick={onHarvest}>
          HARVEST x25 (script)
        </button>
        <span className="quota-meter" aria-label="quota meter">
          QUOTA
          <span className="quota-bar">
            {Array.from({ length: C2_QUOTA }, (_, i) => (
              <span key={i} className={`quota-cell${i < usedCells ? ' used' : ''}`} />
            ))}
          </span>
        </span>
      </div>

      <ConsoleLog entries={entries} label="redeem endpoint console" />
    </div>
  )
}
