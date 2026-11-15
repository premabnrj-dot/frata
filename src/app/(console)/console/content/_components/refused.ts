import type { ToastApi } from '@/components/ui/toast-context'

/** A refused save as an error toast with its one way on (final mockup § States): a stale copy offers Reload, the
 *  minute's limit offers to try in a minute, anything else Try again. The words are the action's own. */
export function refused(toast: ToastApi, refresh: () => void, error: string, retry: () => void, what = '') {
  const action = /Reload to see it/.test(error) ? { label: what ? `Reload ${what}` : 'Reload', run: refresh }
    : /Too many saves/.test(error) ? { label: 'Try in 1 minute', run: () => { setTimeout(retry, 60_000) } } // clock-ok: a timer, never rendered
    : { label: 'Try again', run: retry }
  toast.error(error, { action })
}
