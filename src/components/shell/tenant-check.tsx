'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

// =============================================================================
// FILE: src/components/shell/tenant-check.tsx (tenancy audit of U·2a, MEDIUM 1)
//
// Next keeps a layout across in-app moves, so the shell (shop name, support
// banner, To confirm pill) is not re-rendered when the page is. For staff,
// whose access can change in another tab (a support visit started or ended),
// after each move (not the first render, which is fresh) and when the tab
// comes back into view the shell asks GET /api/console/tenant which shop this
// request is for; if it is not the shop the shell was drawn for, everything is
// refreshed. Merchants' access does not change mid-session (choosing another
// shop is a full page load), so they skip it.
// =============================================================================
export function TenantCheck({ tenantId, staff }: { tenantId: string; staff: boolean }) {
  const router = useRouter()
  const path = usePathname()
  const first = useRef(true)
  useEffect(() => {
    if (!staff) return
    let live = true
    const check = () => fetch('/api/console/tenant', { cache: 'no-store' }).then((r) => r.json())
      .then((b: { tenantId: string | null }) => { if (live && b.tenantId !== tenantId) router.refresh() }).catch(() => {})
    if (first.current) first.current = false
    else check()
    const back = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', back)
    return () => { live = false; document.removeEventListener('visibilitychange', back) }
  }, [path, staff, tenantId, router])
  return null
}
