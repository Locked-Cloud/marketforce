import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type LogKind = 'cmd' | 'out' | 'err' | 'sys'

export interface LogEntry {
  id: number
  kind: LogKind
  text: string
}

export interface ResultLike {
  ok: boolean
  message: string
}

/** Tiny logging helper shared by every challenge demo. */
export function useConsole(initialSys: string[]) {
  const [entries, setEntries] = useState<LogEntry[]>(() =>
    initialSys.map((text, id) => ({ id, kind: 'sys' as const, text })),
  )
  const nextId = useRef(initialSys.length)

  const push = useCallback((kind: LogKind, text: string) => {
    setEntries((es) => [...es, { id: nextId.current++, kind, text }])
  }, [])

  const cmd = useCallback((text: string) => push('cmd', text), [push])

  const result = useCallback(
    (r: ResultLike) => {
      push(r.ok ? 'out' : 'err', `${r.ok ? '200 OK' : 'ERR '} ${r.message}`)
    },
    [push],
  )

  return { entries, push, cmd, result }
}

export function ConsoleLog({ entries, label }: { entries: LogEntry[]; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries.length])

  return (
    <div>
      {label ? <div className="s-label" style={{ marginBottom: 6 }}>{label}</div> : null}
      <div ref={ref} className="console" role="log" aria-live="polite" aria-label={label ?? 'console output'}>
        {entries.map((e) => (
          <div key={e.id} className={`log log-${e.kind}`}>
            {e.kind === 'cmd' ? <span className="prompt">&gt;</span> : <span className="prompt"> </span>}
            <span className="log-text">{e.text}</span>
          </div>
        ))}
        <div className="log log-cmd">
          <span className="prompt">&gt;</span>
          <span className="caret">_</span>
        </div>
      </div>
    </div>
  )
}

/** Status line rendered above the console in most demos. */
export function StatBar({ children }: { children: ReactNode }) {
  return <div className="statbar">{children}</div>
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'bad' | 'good'
}) {
  return (
    <div className="stat">
      <span className="s-label">{label}</span>
      <span className={`s-value${tone ? ` ${tone}` : ''}`}>{value}</span>
    </div>
  )
}
