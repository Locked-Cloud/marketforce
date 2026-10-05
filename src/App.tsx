import { useRoute, Link } from './router'
import Home from './Home'
import { ChallengePage } from './challenges/ChallengePage'
import { CHALLENGES } from './challenges/registry'
import { C1Demo } from './challenges/demos/C1Demo'
import { C2Demo } from './challenges/demos/C2Demo'
import { C3Demo } from './challenges/demos/C3Demo'
import { C4Demo } from './challenges/demos/C4Demo'
import { C5Demo } from './challenges/demos/C5Demo'
import type { ComponentType } from 'react'

const DEMOS: Record<number, ComponentType<{ patched: boolean }>> = {
  1: C1Demo,
  2: C2Demo,
  3: C3Demo,
  4: C4Demo,
  5: C5Demo,
}

function NotFound({ path }: { path: string }) {
  return (
    <div className="notfound">
      <h1>404 — SEGMENTATION FAULT</h1>
      <p>
        no route matches <code>{path}</code>
      </p>
      <p>
        <Link to="/">return to index</Link>
      </p>
    </div>
  )
}

export default function App() {
  const path = useRoute()

  if (path === '/' || path === '') return <Home />

  const match = /^\/c\/([1-5])$/.exec(path)
  if (match) {
    const id = Number(match[1])
    const meta = CHALLENGES.find((c) => c.id === id)
    const Demo = DEMOS[id]
    if (meta && Demo) return <ChallengePage key={id} meta={meta} Demo={Demo} />
  }

  return <NotFound path={path} />
}
