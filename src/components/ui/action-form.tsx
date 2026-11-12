'use client'

import { createContext, useContext, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from './toast'
import { FieldError, errorId, useErrorSummary } from './field-error'

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
// <Submit> inside it reads `pending` from here as well as from useFormStatus.
// =============================================================================

export type ActionResult = { ok?: string; error?: string; fields?: Record<string, string>; go?: string } | undefined | void

const Pending = createContext(false)
const Fields = createContext<Record<string, string>>({})
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
  const [pending, start] = useTransition()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [attempt, setAttempt] = useState(0)
  useErrorSummary(errors, { attempt, noun, scope: ref })

  // The fields are the author's markup: mark the broken ones here (and unmark the fixed ones).
  useEffect(() => {
    const form = ref.current
    if (!form) return
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      if (!el.name) continue
      if (errors[el.name]) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', errorId(el.name)); el.dataset.marked = '' }
      else if ('marked' in el.dataset) { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); delete el.dataset.marked }
    }
  }, [errors])

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (pending) return
    const form = e.currentTarget
    const local: Record<string, string> = {}
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      if (el.name && el.willValidate && !el.checkValidity() && !local[el.name]) local[el.name] = el.dataset.error || el.validationMessage
    }
    if (Object.keys(local).length) { setErrors(local); setAttempt((a) => a + 1); return }
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const data = new FormData(form, submitter && submitter.form === form ? submitter : undefined)
    start(async () => {
      let r: ActionResult
      try { r = await action(data) } catch (err) {
        // A redirect from the action is Next's own navigation, not a failure.
        if (err && typeof err === 'object' && 'digest' in err && String((err as { digest?: unknown }).digest).startsWith('NEXT_REDIRECT')) throw err
        toast.error('We could not reach Frrata.', { sub: 'Nothing was changed. Try again.' })
        return
      }
      const fields = r?.fields ?? {}
      setErrors(fields)
      if (Object.keys(fields).length) setAttempt((a) => a + 1)
      if (r?.error) toast.error(r.error)
      else if (r?.ok) toast.ok(r.ok)
      if (r?.go) router.push(r.go)
      else if (refresh && !r?.error && !Object.keys(fields).length) router.refresh()
    })
  }
  const onInput = (e: React.FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name
    if (name && errors[name]) setErrors(({ [name]: _gone, ...rest }) => rest)
  }

  return (
    <form ref={ref} id={id} aria-label={ariaLabel} noValidate onSubmit={onSubmit} onInput={onInput} onChange={onInput} className={className} aria-busy={pending || undefined}>
      <Pending.Provider value={pending}>
        <Fields.Provider value={errors}>{children}</Fields.Provider>
      </Pending.Provider>
    </form>
  )
}

/** The line under a field inside an ActionForm: shows that field's mistake, if any. */
export function FieldMessage({ name, reserve }: { name: string; reserve?: boolean }) {
  const errors = useContext(Fields)
  return <FieldError name={name} message={errors[name]} reserve={reserve} />
}
