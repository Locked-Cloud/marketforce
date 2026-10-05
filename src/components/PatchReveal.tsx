import { useState } from 'react'
import { CodeBlock } from './CodeBlock'

export function PatchReveal({
  patchNote,
  howFound,
  vulnCode,
  patchedCode,
}: {
  patchNote: string
  howFound: string
  vulnCode: string
  patchedCode: string
}) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div className="panel-body">
        <button type="button" className="btn btn-primary reveal-btn" onClick={() => setOpen(true)}>
          UNSEAL — THE REAL PATCH
        </button>
        <p className="brief-note" style={{ marginTop: 12, marginBottom: 0 }}>
          Work the exploit first. The reveal contains the fix, the vulnerable code, and how the bug
          was originally found in production.
        </p>
      </div>
    )
  }

  return (
    <div className="panel-body patch-reveal">
      <p className="patch-note">{patchNote}</p>
      <p className="how-found">
        <span className="dim">HOW IT WAS FOUND — </span>
        {howFound}
      </p>
      <div className="code-pair">
        <CodeBlock tone="vuln" title="vulnerable — as it shipped" code={vulnCode} />
        <CodeBlock tone="patch" title="patched — as it ships now" code={patchedCode} />
      </div>
    </div>
  )
}
