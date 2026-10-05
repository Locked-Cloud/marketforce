export function Stars({ n, of = 3 }: { n: number; of?: number }) {
  return (
    <span className="stars" aria-label={`difficulty ${n} of ${of}`} title={`difficulty ${n} of ${of}`}>
      {'★'.repeat(n)}
      <span className="star-off">{'★'.repeat(Math.max(0, of - n))}</span>
    </span>
  )
}
