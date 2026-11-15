import { Skeleton } from '@/components/ui/empty'

/** Plan and billing while its reads run (the bill estimate is a rolled-back run): the heading, two cards, the chart as
 *  still grey lines (§ Motion: no shimmer). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading plan and billing" className="flex max-w-5xl flex-col gap-5">
      <h1 className="text-title font-semibold">Plan and billing</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton lines={[30, 60, 100, 100, 70]} />
        <Skeleton lines={[30, 50, 50, 50]} />
      </div>
      <Skeleton lines={[30, 100, 100, 60]} />
    </div>
  )
}
