import { Link } from './router'
import { CHALLENGES } from './challenges/registry'
import { Stars } from './components/Stars'

const BOOT_LINES: Array<{ text: string; cls?: string }> = [
  { text: 'MARKETFORCE SECURE SHELL — lab build 0.1' },
  { text: 'host: local · store: in-memory · blast radius: zero' },
  { text: '> mounting store runtime .................... OK', cls: 'ok' },
  { text: '> loading challenge modules [#####] ......... 5/5', cls: 'ok' },
  { text: '> replaying production audit trail .......... OK', cls: 'ok' },
  { text: '> WARNING: 5 deliberately-vulnerable modules resident', cls: 'warn' },
  { text: '> every bug below was found + fixed in a real store' },
  { text: '> select a target:' },
]

export default function Home() {
  return (
    <div>
      <header className="topbar">
        <span className="brand">MARKETFORCE</span>
        <span>mini-store // security lab</span>
      </header>

      <h1 className="home-logo">MARKETFORCE</h1>
      <p className="home-sub">exploit it in the browser — then read the real patch</p>

      <div className="boot" aria-hidden="true">
        {BOOT_LINES.map((l, i) => (
          <span
            key={i}
            className={`boot-line ${l.cls ?? ''}`}
            style={{ animationDelay: `${i * 110}ms` }}
          >
            {l.text}
          </span>
        ))}
      </div>

      <nav className="menu" aria-label="challenge index">
        <div className="menu-head">
          <span>TGT</span>
          <span>CHALLENGE</span>
          <span>CLASS</span>
          <span>DIFF</span>
          <span />
        </div>
        {CHALLENGES.map((c) => (
          <Link key={c.id} to={`/c/${c.id}`} className="menu-row">
            <span className="m-num">0{c.id}</span>
            <span className="m-title">{c.title}</span>
            <span className="m-class">{c.className}</span>
            <span className="m-stars">
              <Stars n={c.difficulty} />
            </span>
            <span className="m-go">RUN &gt;</span>
          </Link>
        ))}
      </nav>

      <footer className="credits">
        <b>CREDITS:</b> patterns from a real audited production store (WOKOOD), 2026.
        <br />
        Built to teach both sides of the aisle — break it here, ship the fix there. No real
        customers, payments, or PII were harmed; every dataset in this lab is synthetic and
        resets on reload.
      </footer>
    </div>
  )
}
