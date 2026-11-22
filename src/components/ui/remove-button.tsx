import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A row's Remove or Delete: the bin icon alone, its words in the accessible name and the tooltip. 44 px on a phone, 32 from 768 px. */
export function RemoveButton({ label, onClick, disabled, className }: { label: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className={cn('inline-grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-danger hover:text-danger-text focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 md:size-8', className)}>
      <Trash2 aria-hidden className="size-5" strokeWidth={1.75} />
    </button>
  )
}
