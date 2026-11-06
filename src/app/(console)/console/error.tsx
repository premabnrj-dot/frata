'use client'

import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Panel title="We could not load this screen" action={<Button variant="secondary" onClick={reset}>Try again</Button>}>
      Nothing was changed.{error.digest && <> Reference <code>{error.digest}</code>.</>}
    </Panel>
  )
}
