'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

// =============================================================================
// FILE: src/components/shell/tenant-check.tsx (tenancy audit of U·2a, MEDIUM 1)
//
// Next keeps a layout across in-app moves, so the shell (shop name, support
// banner, To confirm pill) is not re-rendered when the page is. For staff,
// whose access can change in another tab (a support visit started or ended),
// after each move and when the tab comes back into view the shell asks the
// server which shop this request is for; if it is not the shop the shell was
// drawn for, everything is refreshed. Merchants' access does not change
// mid-session (choosing another shop is a full page load), so they skip it.
// =============================================================================
export function TenantCheck({ tenantId, staff, ask }: { tenantId: string; staff: boolean; ask: () => Promise<string | null> }) {
  const router = useRouter()
  const path = usePathname()
  useEffect(() => {
    if (!staff) return
    let live = true
    const check = () => ask().then((now) => { if (live && now !== tenantId) router.refresh() }).catch(() => {})
    check()
    const back = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', back)
    return () => { live = false; document.removeEventListener('visibilitychange', back) }
  }, [path, staff, tenantId, ask, router])
  return null
}
