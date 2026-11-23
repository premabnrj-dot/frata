'use client'

import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'

export default function CostsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Panel title="We couldn’t read costs" action={<Button variant="secondary" onClick={reset}>Try again</Button>}>
      Nothing was changed.
    </Panel>
  )
}
