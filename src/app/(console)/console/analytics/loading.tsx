import { Skeleton } from '@/components/ui/empty'

/** Analytics while its reads run: the heading, four figures and the trend as still grey lines (§ Motion: no shimmer). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading analytics" className="flex flex-col gap-6">
      <h1 className="font-display text-title font-semibold">Analytics</h1>
      <div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} lines={[40, 70]} />)}
      </div>
      <Skeleton lines={[30, 100, 100, 100, 60]} />
    </div>
  )
}
