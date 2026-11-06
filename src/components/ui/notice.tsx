/** A one-line result or error under a page header, from ?ok= / ?error= after a form posts. */
export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p role="alert" className="rounded-md border border-danger-text/30 bg-danger px-3 py-2 text-sm text-danger-text">{error}</p>
  if (ok) return <p role="status" className="rounded-md border border-ok-text/30 bg-ok px-3 py-2 text-sm text-ok-text">{ok}</p>
  return null
}
