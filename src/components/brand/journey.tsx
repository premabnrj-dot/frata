import { Icon, type IconName } from '@/components/icons/icon'

/**
 * A row of steps as pictures (website spec W·1): each an icon on a tile, two or three words and Now or Next, joined
 * by the running stitch (brand rule 38). On a phone the row becomes a column. The tinge is on (data-tinge).
 */
export function Journey({ steps, label }: { steps: { icon: IconName; title: string; next?: boolean }[]; label: string }) {
  return (
    <ol aria-label={label} data-tinge className="relative grid gap-5 md:grid-cols-[repeat(var(--n),minmax(0,1fr))] md:gap-4" style={{ ['--n' as string]: steps.length }}>
      <span aria-hidden="true" className="absolute top-7 right-[10%] left-[10%] hidden border-t-[1.5px] border-dashed border-input md:block" />
      {steps.map((s) => (
        <li key={s.title} className="relative flex items-center gap-4 md:flex-col md:text-center">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl border border-border bg-card"><Icon name={s.icon} className="size-7" /></span>
          <span className="grid gap-1 md:justify-items-center">
            <b className="font-semibold">{s.title}</b>
            <span className={`w-fit rounded-sm px-1.5 text-xs font-semibold ${s.next ? 'bg-info text-info-text' : 'bg-ok text-ok-text'}`}>{s.next ? 'Next' : 'Now'}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
