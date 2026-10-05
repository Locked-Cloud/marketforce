export function HintLadder({ hints }: { hints: [string, string, string] }) {
  const labels = ['gentle nudge', 'stronger nudge', 'nearly the answer']
  return (
    <ol className="hints" style={{ listStyle: 'none' }}>
      {hints.map((h, i) => (
        <li key={i}>
          <details className="hint">
            <summary>
              HINT {i + 1} — {labels[i]}
            </summary>
            <p>{h}</p>
          </details>
        </li>
      ))}
    </ol>
  )
}
