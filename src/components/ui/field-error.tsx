'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from './toast'

// =============================================================================
// FILE: src/components/ui/field-error.tsx — FIELD MISTAKES STAY AT THE FIELD (frata-design-language § Feedback 3).
//
// <FieldError id message /> is the one line under a field: the mark, the words, dropping in 4 px (animate-err-in).
// The field itself carries aria-invalid and aria-describedby={id} (fieldProps). useErrorSummary(errors) watches a
// form's own error state: when mistakes appear it moves focus to the first field marked aria-invalid (DOM order) and
// shows ONE error toast "2 fields need fixing" with Show; as they are fixed the toast counts down, and at zero it
// leaves. The toast never takes focus (GOV.UK error summary, WCAG 3.3.1/4.1.3). Nothing typed is ever cleared.
// useFieldErrors() is the same with the state held for you.
// =============================================================================

export type Errors = Record<string, string | null | undefined | false>

const count = (e: Errors) => Object.values(e).filter(Boolean).length
const words = (n: number, noun: string) => (n === 1 ? `1 ${noun} needs fixing.` : `${n} ${noun}s need fixing.`)

/** Focus the first field marked aria-invalid inside the form (`scope`), after React has painted the marks; a closed
 *  <details> around it opens first. Never the whole page: another form's marks are not this form's. */
export function focusFirstInvalid(scope: HTMLElement | null | undefined) {
  requestAnimationFrame(() => {
    const el = scope?.querySelector<HTMLElement>('[aria-invalid="true"]')
    if (!el) return
    for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  })
}

/**
 * Watches a form's errors. `attempt` changes on every submit, so the same mistakes submitted again focus and show
 * again. `noun`: "field" in the console and Admin, "detail" at the shop's checkout.
 */
export function useErrorSummary(errors: Errors, opts: { attempt?: number; noun?: string; scope: React.RefObject<HTMLElement | null>; /** A refusal said with the mistakes, as the second line. */ sub?: string }) {
  const toast = useToast()
  const noun = opts.noun ?? 'field'
  const n = count(errors)
  const shown = useRef<number | null>(null)
  const last = useRef({ n: 0, attempt: opts.attempt })
  useEffect(() => {
    const prev = last.current
    last.current = { n, attempt: opts.attempt }
    if (n === 0) { if (shown.current !== null) { toast.dismiss(shown.current); shown.current = null } return }
    // Fresh only for more mistakes or a new submit: fixing one never moves focus (inside a Dialog too).
    const fresh = n > prev.n || opts.attempt !== prev.attempt
    // Inside an open Dialog the page behind is inert: no toast, the marks and the focus say it (§ Feedback 4).
    const inDialog = !!opts.scope.current?.closest('dialog[open]')
    if (fresh) {
      if (!inDialog) {
        const id = toast.next()
        // Quiet: focus is already on the first field, which reads its own line; the count is said once, politely.
        toast.error(words(n, noun), { quiet: true, sub: opts.sub, action: { label: 'Show', keep: true, run: () => focusFirstInvalid(opts.scope.current) } })
        shown.current = id
      }
      focusFirstInvalid(opts.scope.current)
    } else if (shown.current !== null) {
      toast.update(shown.current, words(n, noun))
    }
  }, [n, opts.attempt]) // eslint-disable-line react-hooks/exhaustive-deps -- the toast API is stable; noun and scope are fixed per form
  // The form went away (a panel closed, the page changed): so does its summary.
  useEffect(() => () => { if (shown.current !== null) toast.dismiss(shown.current) }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

/** A form's field errors with the summary built in: set() after a submit, clear(name) as a field changes. */
export function useFieldErrors(opts: { noun?: string; scope: React.RefObject<HTMLElement | null> }) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [attempt, setAttempt] = useState(0)
  useErrorSummary(errors, { attempt, ...opts })
  const set = useCallback((e: Errors) => {
    const clean: Record<string, string> = {}
    for (const [k, v] of Object.entries(e)) if (v) clean[k] = v
    setErrors(clean); setAttempt((a) => a + 1)
  }, [])
  const clear = useCallback((name: string) => setErrors((e) => {
    if (!(name in e)) return e
    const { [name]: _gone, ...rest } = e
    return rest
  }), [])
  return { errors, set, clear, props: (name: string) => fieldProps(name, errors[name]) }
}

/** What a field with a possible error carries: aria-invalid, aria-describedby → its <FieldError id>. */
export function fieldProps(name: string, error: string | null | undefined | false) {
  return error ? { 'aria-invalid': true as const, 'aria-describedby': errorId(name) } : { 'aria-invalid': undefined }
}
export const errorId = (name: string) => `${name.replace(/[^A-Za-z0-9_-]/g, '-')}-error`

/** The line under a field. Empty: renders nothing (a form that reserves the line passes `reserve`). */
export function FieldError({ name, id, message, reserve, className }: { name?: string; id?: string; message?: string | null | false; reserve?: boolean; className?: string }) {
  const theId = id ?? (name ? errorId(name) : undefined)
  if (!message) return reserve ? <span className="block min-h-5" aria-hidden /> : null
  return (
    <span id={theId} className={`flex animate-err-in items-start gap-1.5 text-xs text-danger-text ${className ?? ''}`}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="mt-px shrink-0">
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="M8 4.6v4.2M8 11.3v.2" stroke="var(--background)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span>{message}</span>
    </span>
  )
}
