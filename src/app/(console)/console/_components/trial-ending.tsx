'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { button } from '@/components/ui/button'

/** The last 10 days of a trial: the date and the price, two equal choices (CCPA: decline as visible as accept). */
export function TrialEnding({ lastDay, price, dismissKey }: { lastDay: string; price: string; dismissKey: string }) {
  const [hidden, setHidden] = useState(true)
  useEffect(() => { try { setHidden(sessionStorage.getItem(dismissKey) === '1') } catch { setHidden(false) } }, [dismissKey])
  if (hidden) return null
  return (
    <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warn-text/30 bg-warn px-3 py-2 text-sm text-warn-text">
      <span>Trial ends {lastDay} · then {price}/mo incl. GST</span>
      <span className="flex gap-2">
        <Link href="/console/settings/billing#paying" className={button({ variant: 'secondary' })}>Set up autopay</Link>
        <button type="button" className={button({ variant: 'secondary' })} onClick={() => { try { sessionStorage.setItem(dismissKey, '1') } catch { /* private window */ } setHidden(true) }}>Not now</button>
      </span>
    </div>
  )
}
