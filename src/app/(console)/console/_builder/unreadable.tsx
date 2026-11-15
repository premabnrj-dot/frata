import { Panel } from '@/components/ui/panel'

/** What a Builder's page says when its read fails (T1c): the Builder login not set yet (a preview, or before the
 *  secret is added: owner question 7) is said as such; anything else is the usual error. Never a fallback read. */
export function unreadable(err: unknown): { panel: React.ReactElement } {
  if (err instanceof Error && err.name === 'BuilderDbMissing') return { panel: <Panel title="Builder access isn’t set up yet" /> }
  return { panel: <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel> }
}
