'use client'

import { useEffect, useRef, useState } from 'react'
import { slugProblem } from '@/domains/signup/slug'
import type { AddressCheck } from '@/domains/signup/steps'
import { checkAddressOpen } from '../check-address-open'

/** An address's state: its shape judged here at once; whether it is free asked 300 ms after typing stops. An answer for
 *  an address that is no longer the one typed is dropped (out of order). Null while waiting or empty. */
export function useAddressCheck(slug: string): AddressCheck | null {
  const s = slug.toLowerCase()
  const [answer, setAnswer] = useState<{ slug: string; check: AddressCheck } | null>(null)
  const latest = useRef(s); latest.current = s
  const local = s ? slugProblem(s) : null
  useEffect(() => {
    if (!s || slugProblem(s)) return
    const t = setTimeout(() => {
      checkAddressOpen(s)
        .then((check) => { if (latest.current === s) setAnswer({ slug: s, check }) })
        .catch(() => { if (latest.current === s) setAnswer({ slug: s, check: { state: 'limited' } }) })
    }, 300)
    return () => clearTimeout(t)
  }, [s])
  if (!s) return null
  if (local) return { state: local }
  return answer?.slug === s ? answer.check : null
}
