'use client'

import { useRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { FIELD } from './field'

// =============================================================================
// FILE: src/components/ui/unit-field.tsx — FIELDS THAT CARRY A UNIT (Neel N0b, § More components · Inputs with a unit).
//
// The unit sits in the field: before it (₹, +91) or after it (%, kg), in text 2, part of the label for a screen reader
// (aria-describedby is the caller's mistake line; the unit is in the accessible name through `unit`). Stepper: − and +
// around a number. CodeInput: one box per digit that takes a paste. PinField: the city it names, once six digits are in.
// =============================================================================

type Base = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & { className?: string }

export function UnitField({ unit, at = 'start', className, ...input }: Base & { unit: string; at?: 'start' | 'end' }) {
  const wide = unit.length > 1
  return (
    <span className={cn('relative block', className)}>
      <i aria-hidden="true" className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-label font-medium not-italic text-muted-foreground', at === 'start' ? 'left-2.5' : 'right-2.5')}>{unit}</i>
      <input {...input} className={cn(FIELD, 'w-full font-num', at === 'start' ? (wide ? 'pl-10' : 'pl-6') : 'pr-8')} />
    </span>
  )
}

export function Stepper({ value, onChange, min = 0, max = 9999, label, className }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string; className?: string }) {
  const btn = 'w-11 bg-sunk text-base text-foreground hover:bg-accent disabled:opacity-45 md:w-9'
  return (
    <span role="group" aria-label={label} className={cn('inline-flex h-11 w-fit justify-self-start overflow-hidden rounded-md border border-input md:h-9', className)}>
      <button type="button" aria-label="One less" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <input aria-label={label} inputMode="numeric" value={value} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n))) }}
        className="w-13 border-0 bg-card text-center font-num text-sm outline-offset-[-2px]" />
      <button type="button" aria-label="One more" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </span>
  )
}

/** One box per digit; typing moves on, Backspace moves back, a paste fills them all. */
export function CodeInput({ length = 6, value, onChange, label, className }: { length?: number; value: string; onChange: (v: string) => void; label: string; className?: string }) {
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const set = (v: string) => onChange(v.replace(/\D/g, '').slice(0, length))
  return (
    <span role="group" aria-label={label} className={cn('flex flex-wrap gap-1', className)}>
      {Array.from({ length }, (_, i) => (
        <input key={i} ref={(el) => { boxes.current[i] = el }} aria-label={`Digit ${i + 1} of ${length}`} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={1}
          value={value[i] ?? ''} className="h-11 w-9 rounded-md border border-input bg-card text-center text-base font-semibold md:h-10 md:w-8"
          onPaste={(e) => { e.preventDefault(); const v = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length); set(v); boxes.current[Math.min(v.length, length - 1)]?.focus() }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !value[i] && i > 0) { e.preventDefault(); set(value.slice(0, i - 1)); boxes.current[i - 1]?.focus() } }}
          onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(-1); if (!d) { set(value.slice(0, i)); return } set(value.slice(0, i) + d + value.slice(i + 1)); boxes.current[i + 1]?.focus() }} />
      ))}
    </span>
  )
}

/** A PIN code and the place it names (the caller looks it up once six digits are in; null: not found). */
export function PinField({ place, className, ...input }: Base & { place?: ReactNode | null }) {
  return (
    <span className={cn('grid gap-1', className)}>
      <input inputMode="numeric" maxLength={6} autoComplete="postal-code" {...input} className={cn(FIELD, 'w-full font-num')} />
      <span aria-live="polite" className="min-h-4.5 text-label font-medium text-muted-foreground">{place === null ? 'No such PIN code' : place}</span>
    </span>
  )
}
