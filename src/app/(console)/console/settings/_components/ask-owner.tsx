'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { OWNER_ONLY_WORDS, type AskPage } from '@/domains/settings/owner-only'
import { askOwnerAction } from '../actions'

/**
 * Ask the owner (PP1 mockup screens 1–4): one secondary button. After asking, an ok toast and the button Off for the
 * rest of the India day (Button's `reason`: still focusable, "Asked today" beside it); a page opened again the same day
 * draws the Off state from the notice that exists (`asked`). Never on a support visit (the page leaves it out).
 */
export function AskOwner({ page, asked: askedBefore, size }: { page: AskPage; asked: boolean; size?: 'sm' }) {
  const toast = useToast()
  const [asked, setAsked] = useState(askedBefore)
  const [busy, setBusy] = useState(false)
  // The Off button replaces the pressed one: focus stays where it was (the mockup's "stays where it was").
  const off = useRef<HTMLButtonElement>(null)
  const [justAsked, setJustAsked] = useState(false)
  useEffect(() => { if (justAsked) off.current?.focus() }, [justAsked])
  if (asked) return <Button ref={off} variant="secondary" size={size} reason={OWNER_ONLY_WORDS.askedToday} reasonBelow={size === 'sm'}>{OWNER_ONLY_WORDS.ask}</Button>
  return (
    <Button variant="secondary" size={size} busy={busy} onClick={async () => {
      setBusy(true)
      const r = await askOwnerAction(page).catch(() => ({ ok: false as const, error: 'We couldn’t ask the owner. Nothing was sent. Try again in a minute.' }))
      setBusy(false)
      if (!r.ok) { toast.error(r.error); return }
      setAsked(true)
      setJustAsked(true)
      toast.ok(OWNER_ONLY_WORDS.asked)
    }}>{OWNER_ONLY_WORDS.ask}</Button>
  )
}
