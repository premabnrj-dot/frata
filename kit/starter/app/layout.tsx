import './globals.css'
import Link from 'next/link'
import { api, type Shop } from '@/lib/frrata'
import { Landing } from '@/components/landing'

export const revalidate = 60

export async function generateMetadata() {
  const s = await api<Shop>('shop')
  return { title: s?.name ?? 'Store', description: s?.tagline }
}

/** Every page: the store's name and bag; the legal block India's E-Commerce Rules ask for, from the API at runtime. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await api<Shop>('shop')
  return (
    <html lang="en-IN">
      <body>
        <Landing />
        <header className="top"><Link href="/" className="brand">{s?.name ?? 'Store'}</Link><nav><Link href="/bag">Bag</Link></nav></header>
        <main>{children}</main>
        {s ? (
          <footer className="legal">
            <span>{s.legal.legalName} · {s.legal.address}</span>
            <span>Customer care: {s.legal.customerCare.email} · {s.legal.customerCare.phone}</span>
            <span>Grievance officer: {s.legal.grievanceOfficer.name}, {s.legal.grievanceOfficer.role} · {s.legal.grievanceOfficer.email} · {s.legal.grievanceOfficer.phone}</span>
            <span>{s.policies.map((p, i) => <span key={p.kind}>{i ? ' · ' : ''}<a href={p.url}>{p.title}</a></span>)} · <Link href="/faq">Questions</Link></span>
          </footer>
        ) : null}
      </body>
    </html>
  )
}
