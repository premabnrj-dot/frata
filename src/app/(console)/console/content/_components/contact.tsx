'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Button, button } from '@/components/ui/button'
import { FIELD } from '@/components/ui/field'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { CONTACT_MAX } from '@/domains/content/kinds-facts'
import { saveContactAction, undoContentAction } from '../actions'
import { refused } from './refused'

// =============================================================================
// Content › Contact line (final mockup § Contact line): the one line above Chat on WhatsApp on the Contact page; the
// business details come from Settings, read-only here. Save is live, with Undo for a minute.
// =============================================================================

export function ContactLine({ id, version, line, details, canSave, lock }: { id: string | null; version: number | null; line: string; details: string; canSave: boolean; lock: string | null }) {
  const router = useRouter()
  const toast = useToast()
  const [v, setV] = useState(line)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true); setError(null)
    const r = await saveContactAction({ version, line: v })
    setBusy(false)
    if (!r.ok) { if (r.field) setError(r.error); else refused(toast, router.refresh, r.error, () => void save()); return }
    toast({ text: 'Contact line saved', undo: id ? async () => { const u = await undoContentAction({ id: r.id, version: r.version }); router.refresh(); return u } : undefined })
    router.refresh()
  }
  return (
    <Section ariaLabel="Contact line" action={!canSave && lock ? <Badge>{lock}</Badge> : null}>
      <div className="grid gap-4">
        <label className="grid gap-1.5"><span className="flex justify-between text-label font-medium">Line<span className="font-num font-normal text-muted-foreground">{v.length}/{CONTACT_MAX}</span></span>
          <input name="line" value={v} maxLength={CONTACT_MAX} disabled={!canSave} {...fieldProps('line', error)} onChange={(e) => { setV(e.target.value); setError(null) }} className={`${FIELD} w-full`} />
          <FieldError name="line" message={error} /></label>
        <div className="rounded-md border border-border bg-sunk px-3 py-2.5 text-sm"><p className="text-label text-muted-foreground">From Settings</p><p>{details}</p></div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <a href="/console/settings/contact" className={button({ variant: 'secondary', size: 'sm' })}>Change in Settings</a>
          {canSave && <Button busy={busy} disabled={v === line} onClick={save}>Save</Button>}
        </div>
      </div>
    </Section>
  )
}
