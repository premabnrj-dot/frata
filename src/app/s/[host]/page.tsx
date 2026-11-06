import { notFound } from 'next/navigation'
import { tenantForHost } from '@/lib/db/platform'
import { isDatabaseConfigured } from '@/lib/env'

// A storefront is cached: festive traffic must hit the CDN, not Postgres.
export const revalidate = 60

export default async function Storefront({ params }: { params: Promise<{ host: string }> }) {
  const { host } = await params
  if (!isDatabaseConfigured()) notFound()
  const tenant = await tenantForHost(decodeURIComponent(host))
  if (!tenant) notFound()
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-semibold tracking-tight">{tenant.name}</h1>
      <p className="mt-2 text-muted-foreground">This store is being set up.</p>
    </main>
  )
}
