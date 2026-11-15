'use client'

import { useId } from 'react'
import { FIELD } from '@/components/ui/field'

/** A link to one of the store's own pages, picked, never typed (constraints over refusals). */
export type Target = { path: string; label: string }
export function LinkSelect({ label, value, targets, onChange, none = 'No link' }: { label: string; value: string | null; targets: Target[]; onChange: (v: string | null) => void; none?: string | null }) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-label font-medium">{label}</label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={`${FIELD} w-full`}>
        {none !== null && <option value="">{none}</option>}
        {value && !targets.some((t) => t.path === value) && <option value={value}>{value}</option>}
        {targets.map((t) => <option key={t.path} value={t.path}>{t.label}</option>)}
      </select>
    </div>
  )
}
