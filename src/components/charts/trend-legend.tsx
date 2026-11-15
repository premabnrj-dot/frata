/** The trend's key, in its card's heading row (Neel N1b, as drawn): this period, the one before, and the marks. */
export function TrendLegend({ names, marks, className }: { names: [string, string]; marks?: string; className?: string }) {
  return (
    <span className={`flex flex-wrap gap-x-4 gap-y-1 text-label text-muted-foreground ${className ?? ''}`} aria-hidden="true">
      <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-3 bg-chart" />{names[0]}</span>
      <span className="inline-flex items-center gap-1.5"><i className="w-3 border-t-2 border-dashed border-text-3" />{names[1]}</span>
      {marks ? <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-warn-mark" />{marks}</span> : null}
    </span>
  )
}
