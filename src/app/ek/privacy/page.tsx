import type { Metadata } from 'next'
import { AGE_LINE, GRIEVANCE, NOTICE_LINES, NOTICE_VERSION } from '@/domains/ekcode-core/notice'

export const metadata: Metadata = { title: 'Privacy' }

// Draft for counsel (plan task 11): the notice, what is kept and shared, rights, and the grievance contact. The company
// behind EkCode is named here once, when counsel signs off (spec § Brand).
export default function EkPrivacy() {
  return (
    <article className="grid gap-4 text-sm leading-6">
      <h1 className="text-xl font-semibold">Privacy</h1>
      <ul className="grid gap-2 list-disc pl-5">{NOTICE_LINES.map((l) => <li key={l}>{l}</li>)}</ul>
      <p>{AGE_LINE}</p>
      <h2 className="font-semibold">What a shop gets</h2>
      <p>Your name and WhatsApp number, and an address only when you pick one. Each shop gets its own id for you, so two shops cannot match you up. Every time a shop gets something, we keep a note of it.</p>
      <h2 className="font-semibold">Your rights</h2>
      <p>Ask for a copy of what EkCode keeps, a correction, or deletion. We answer within 90 days.</p>
      <h2 className="font-semibold">Grievance contact</h2>
      <p>{GRIEVANCE.name} · <span className="select-all">{GRIEVANCE.email}</span></p>
      <p className="text-xs text-[var(--ek-sub)]">Notice {NOTICE_VERSION}</p>
    </article>
  )
}
