export function PatchedToggle({
  patched,
  onChange,
}: {
  patched: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      className={`toggle${patched ? ' on' : ''}`}
      role="switch"
      aria-checked={patched}
      onClick={() => onChange(!patched)}
    >
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">
        {patched ? 'patched mode — exploit stops here' : 'vulnerable mode — exploit away'}
      </span>
    </button>
  )
}
