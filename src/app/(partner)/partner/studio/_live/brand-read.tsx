import { Empty } from '@/components/ui/empty'
import { COLOUR_ROLES, DENSITY_NAMES, FONT_NAMES, ROLE_NAMES, type BrandRecord } from '@/domains/brand/record'

// Design until hosting (V3a R7; Deviations): the store's brand record as it is now, what Apply changes, read-only. Drawn
// on the server and handed to the live screen as a node, so the record's names stay out of the page's script.

export function BrandRead({ brand }: { brand: BrandRecord | null }) {
  if (!brand) return <Empty title="No brand yet" />
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex min-h-8 items-center justify-between gap-2.5"><span className="text-label text-muted-foreground">{label}</span><span>{value}</span></div>
  )
  return (
    <div className="grid content-start gap-3.5">
      <p className="text-small font-medium text-muted-foreground">Brand</p>
      {brand.logos.main ? <img alt="The store’s logo" src={brand.logos.main} className="h-10 max-w-full justify-self-start object-contain" /> : null}
      <div className="grid grid-cols-6 gap-1.5">
        {COLOUR_ROLES.map((r) => <i key={r} role="img" aria-label={`${ROLE_NAMES[r]} ${brand.palette[r]}`} style={{ background: brand.palette[r] }} className="h-6 rounded-sm border border-border" />)}
      </div>
      {row('Headings font', FONT_NAMES[brand.display])}
      {row('Body font', FONT_NAMES[brand.body])}
      {row('Corners', `${brand.radius} px`)}
      {row('Spacing', DENSITY_NAMES[brand.density])}
    </div>
  )
}
