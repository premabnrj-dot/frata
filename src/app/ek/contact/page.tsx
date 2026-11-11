import type { Metadata } from 'next'
import { GRIEVANCE } from '@/domains/ekcode-core/notice'

export const metadata: Metadata = { title: 'Contact' }

export default function EkContact() {
  return (
    <article className="grid gap-3 text-sm leading-6">
      <h1 className="text-xl font-semibold">Contact</h1>
      <p>Privacy and grievances: {GRIEVANCE.name}</p>
      <p className="select-all font-medium">{GRIEVANCE.email}</p>
    </article>
  )
}
