import { highlight } from '@/domains/text/highlight'

/** Text with a search's match marked (Neel N1c, § Finding): parts rendered as text, never HTML. */
export function Marked({ text, query, digits = false }: { text: string; query?: string | null; digits?: boolean }) {
  if (!query) return <>{text}</>
  return <>{highlight(text, query, digits).map((p, i) => p.hit ? <mark key={i} className="rounded-xs bg-warn px-px text-inherit">{p.text}</mark> : <span key={i}>{p.text}</span>)}</>
}
