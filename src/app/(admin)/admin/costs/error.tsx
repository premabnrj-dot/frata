'use client'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'

export default function CostsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <PageHeader title="Costs" />
      <Empty picto="payments" title="We couldn’t read costs">
        <p className="w-full text-small text-muted-foreground">Nothing was changed.</p>
        <Button variant="secondary" onClick={reset}>Try again</Button>
      </Empty>
    </>
  )
}
