// The shop's close mark (the bag, the size guide): the same two strokes as the console's `close` icon, drawn here so
// a shop's browser never loads the console's whole icon set for one × (product page at its 121 kB ceiling).
export function CloseMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}
