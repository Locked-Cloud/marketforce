// Dependency-free syntax tinting — enough to read TS like a terminal
// listing: comments dim, strings amber, keywords bright phosphor.

import type { ReactNode } from 'react'

const TOKEN_RE =
  /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|if|else|throw|new|export|import|from|type|interface|as|true|false|null|undefined|for|of|in|try|catch|await|async|class|this|typeof|while|switch|break|continue)\b|(\b\d[\d_.]*\b)/g

function highlight(code: string): ReactNode[] {
  const parts: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of code.matchAll(TOKEN_RE)) {
    const i = m.index ?? 0
    if (i > last) parts.push(<span key={key++}>{code.slice(last, i)}</span>)
    const cls = m[1] ? 'tok-com' : m[2] ? 'tok-str' : m[3] ? 'tok-kw' : 'tok-num'
    parts.push(
      <span key={key++} className={cls}>
        {m[0]}
      </span>,
    )
    last = i + m[0].length
  }
  if (last < code.length) parts.push(<span key={key++}>{code.slice(last)}</span>)
  return parts
}

export function CodeBlock({
  code,
  title,
  tone,
}: {
  code: string
  title?: string
  tone?: 'vuln' | 'patch'
}) {
  return (
    <div className={`codeblock${tone ? ` ${tone}` : ''}`}>
      {title ? <div className="codeblock-title">{title}</div> : null}
      <pre>
        <code>{highlight(code)}</code>
      </pre>
    </div>
  )
}
