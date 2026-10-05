import { useState } from 'react'
import type { ComponentType } from 'react'
import { Link } from '../router'
import type { ChallengeMeta } from './registry'
import { HintLadder } from '../components/HintLadder'
import { PatchReveal } from '../components/PatchReveal'
import { PatchedToggle } from '../components/Toggle'
import { Stars } from '../components/Stars'

export function ChallengePage({
  meta,
  Demo,
}: {
  meta: ChallengeMeta
  Demo: ComponentType<{ patched: boolean }>
}) {
  const [patched, setPatched] = useState(false)

  const prev = meta.id > 1 ? meta.id - 1 : null
  const next = meta.id < 5 ? meta.id + 1 : null

  return (
    <div>
      <header className="topbar">
        <span className="brand">MARKETFORCE</span>
        <span>
          target 0{meta.id} / 05 —{' '}
          <Link to="/" className="back-link">
            &lt; INDEX
          </Link>
        </span>
      </header>

      <div className="ch-header">
        <div className="ch-kicker">
          challenge 0{meta.id} // {meta.className}
        </div>
        <h1 className="ch-title">
          {meta.title}
          <Stars n={meta.difficulty} />
        </h1>
      </div>

      <section className="panel" aria-label="brief">
        <div className="panel-title">brief — the bug and where it lived</div>
        <div className="panel-body">
          {meta.brief.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="brief-note">
            State resets every visit — break this demo as hard as you like, then leave and come
            back for a fresh store.
          </p>
        </div>
      </section>

      <section className="panel" aria-label="live demo">
        <div className="panel-title">
          <span>interactive demo — live fire</span>
          <PatchedToggle patched={patched} onChange={setPatched} />
        </div>
        <div className="panel-body">
          {/* key remounts the demo on toggle so both twins start from scratch */}
          <Demo key={patched ? 'patched' : 'vulnerable'} patched={patched} />
        </div>
      </section>

      <section className="panel" aria-label="hints">
        <div className="panel-title">hints — climb only as far as you need</div>
        <div className="panel-body">
          <HintLadder hints={meta.hints} />
        </div>
      </section>

      <section className="panel" aria-label="exploit script">
        <div className="panel-title">exploit — step by step</div>
        <div className="panel-body">
          <ol className="exploit">
            {meta.exploit.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className="panel" aria-label="the real patch">
        <div className="panel-title">the real patch — what shipped after the audit</div>
        <PatchReveal
          patchNote={meta.patchNote}
          howFound={meta.howFound}
          vulnCode={meta.vulnCode}
          patchedCode={meta.patchedCode}
        />
      </section>

      <nav className="ch-nav" aria-label="challenge navigation">
        <span>
          {prev ? <Link to={`/c/${prev}`}>&lt;&lt; challenge 0{prev}</Link> : <Link to="/">&lt;&lt; index</Link>}
        </span>
        <span>
          {next ? <Link to={`/c/${next}`}>challenge 0{next} &gt;&gt;</Link> : <Link to="/">index &gt;&gt;</Link>}
        </span>
      </nav>
    </div>
  )
}
