'use client'

import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from './toast'
import { FieldError, errorId, useErrorSummary } from './field-error'
import { settle } from '@/lib/settle'

// =============================================================================
// FILE: src/components/ui/action-form.tsx — A FORM THAT POSTS TO A SERVER ACTION AND SAYS ITS RESULT IN A TOAST
// (frata-design-language § Feedback; plan docs/plans/2026-11-12-feedback.md F0·5).
//
// The action returns { ok?, error?, fields?, go? } instead of redirecting with ?error=/?ok=: a result never travels in
// a URL or a cookie (any link could put words in a ?error= line; security review 2026-11-12). Here:
//   - the browser's own rules (required, pattern, min, type=email…) are checked first, without its bubbles: each
//     broken field gets its <FieldMessage> (the field's data-error words, else the browser's) and the one summary
//     toast; nothing is posted;
//   - ok → toast.ok, error → toast.error, fields → marked at their fields; then the page refreshes, or `go` is
//     followed (the layout's Toaster outlives the move, so the toast stays);
//   - a network failure → "We could not reach Frrata." with "Nothing was changed.".
// Posting by hand (not <form action>) because React 19 resets a form after an action: nothing typed may be cleared.
// Plain pending state and settle(router) after the action, never a transition (frata-gotchas: Next 15.5 leaves a
// transition around an action + refresh unsettled now and then); pending gives itself back after 15 s, with <Submit>.
// <Submit> inside it reads `pending` from here as well as from useFormStatus.
// =============================================================================

export type ActionResult = { ok?: string; error?: string; fields?: Record<string, string>; go?: string } | undefined | void

const Pending = createContext(false)
// The form's mistakes, and its id prefix: two forms on one page may both have a `reason` (impact review F1–F3).
const Fields = createContext<{ errors: Record<string, string>; prefix: string }>({ errors: {}, prefix: '' })
/** True while the ActionForm around it is posting (read by <Submit>). */
export const useActionPending = () => useContext(Pending)

export function ActionForm({ action, children, className, noun, refresh = true, id, 'aria-label': ariaLabel }: {
  action: (form: FormData) => Promise<ActionResult>
  children: React.ReactNode
  className?: string
  /** The summary's noun: "field" (default) or "detail". */
  noun?: string
  /** Refresh the page's server data after an ok result (default). */
  refresh?: boolean
  id?: string
  'aria-label'?: string
}) {
  const toast = useToast()
  const router = useRouter()
  const ref = useRef<HTMLFormElement>(null)
  const [pending, setPending] = useState(false)
  const prefix = `f${useId().replace(/[^A-Za-z0-9]/g, '')}-`
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [attempt, setAttempt] = useState(0)
  // A refusal that came with field mistakes is said as the summary's second line (one toast, not two).
  const [also, setAlso] = useState<string | undefined>(undefined)
  useErrorSummary(errors, { attempt, noun, scope: ref, sub: also })

  // The fields are the author's markup: mark the broken ones here (and unmark the fixed ones).
  useEffect(() => {
    const form = ref.current
    if (!form) return
    // A field's own description (an info tip) is kept: the error's id is added to it, and taken off again.
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      if (!el.name) continue
      const own = (el.getAttribute('aria-describedby') ?? '').split(' ').filter((t) => t && t !== errorId(prefix + el.name))
      if (errors[el.name]) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', [...own, errorId(prefix + el.name)].join(' ')); el.dataset.marked = '' }
      else if ('marked' in el.dataset) {
        el.removeAttribute('aria-invalid'); delete el.dataset.marked
        if (own.length) el.setAttribute('aria-describedby', own.join(' ')); else el.removeAttribute('aria-describedby')
      }
    }
  }, [errors, prefix])

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (pending) return
    const form = e.currentTarget
    const local: Record<string, string> = {}
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      if (el.name && el.willValidate && !el.checkValidity() && !local[el.name]) local[el.name] = el.dataset.error || el.validationMessage
    }
    if (Object.keys(local).length) { setAlso(undefined); setErrors(local); setAttempt((a) => a + 1); return }
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const data = new FormData(form, submitter && submitter.form === form ? submitter : undefined)
    setPending(true)
    const giveBack = window.setTimeout(() => setPending(false), 15_000)
    void (async () => {
      let r: ActionResult
      try { r = await action(data) } catch (err) {
        // A redirect from the action is Next's own navigation, not a failure.
        if (!(err && typeof err === 'object' && 'digest' in err && String((err as { digest?: unknown }).digest).startsWith('NEXT_REDIRECT'))) {
          toast.error('We could not reach Frrata.', { sub: 'Nothing was changed. Try again.' })
        }
        return
      } finally { window.clearTimeout(giveBack); setPending(false) }
      const fields = r?.fields ?? {}
      const bad = Object.keys(fields).length > 0
      setAlso(bad ? r?.error : undefined)
      setErrors(fields)
      if (bad) setAttempt((a) => a + 1)
      else if (r?.error) toast.error(r.error)
      else if (r?.ok) toast.ok(r.ok)
      if (r?.go) router.push(r.go)
      else if (refresh && !r?.error && !bad) settle(router)
    })()
  }
  const onInput = (e: React.FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name
    if (name && errors[name]) setErrors(({ [name]: _gone, ...rest }) => rest)
  }

  return (
    <form ref={ref} id={id} aria-label={ariaLabel} noValidate onSubmit={onSubmit} onInput={onInput} onChange={onInput} className={className} aria-busy={pending || undefined}>
      <Pending.Provider value={pending}>
        <Fields.Provider value={{ errors, prefix }}>{children}</Fields.Provider>
      </Pending.Provider>
    </form>
  )
}

/** The line under a field inside an ActionForm: shows that field's mistake, if any. */
export function FieldMessage({ name, reserve }: { name: string; reserve?: boolean }) {
  const { errors, prefix } = useContext(Fields)
  return <FieldError name={prefix + name} message={errors[name]} reserve={reserve} />
}
