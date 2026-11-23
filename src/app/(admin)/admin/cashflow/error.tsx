'use client'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'

export default function CashflowError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <PageHeader title="Cashflow" />
      <Empty picto="payments" title="We couldn’t load Cashflow. Nothing was changed.">
        <Button variant="secondary" onClick={reset}>Try again</Button>
      </Empty>
    </>
  )
}
