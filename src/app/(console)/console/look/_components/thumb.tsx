import { displayFamily } from '@/components/shop-preview/fonts'
import type { ResolvedTheme } from '@/domains/themes/types'

// A theme as a tiny phone (mockup "Look"): drawn from the theme's own colours, type and header, so a merchant
// recognises it before trying it. Decorative: the theme's name is beside it.
export function ThemeThumb({ t, name, size = 'md' }: { t: ResolvedTheme; name: string; size?: 'sm' | 'md' }) {
  const p = t.schemes.paper, s = t.settings
  const w = size === 'sm' ? 'w-[104px] h-[200px]' : 'w-[150px] h-[300px]'
  const upper = s.headings === 'upper' || s.header === 'minimal'
  const radius = s.corners === 'square' ? '0px' : s.corners === 'round' ? '8px' : '2px'
  const tiles = s.phoneColumns === 3 ? 'grid-cols-3' : 'grid-cols-2'
  return (
    <div aria-hidden="true" className={`${w} shrink-0 overflow-hidden rounded-[18px] border-[5px] border-foreground`} style={{ background: p.bg, color: p.text }}>
      {s.announcement && <div className="py-0.5 text-center text-[6px]" style={{ background: p.accent, color: p.onAccent }}>{s.announcement.text.slice(0, 32)}</div>}
      <div className={`flex h-6 items-center px-2 text-[9px] font-semibold ${s.header === 'centred' || s.header === 'minimal' ? 'justify-center' : ''}`} style={{ fontFamily: displayFamily(s.pairing), letterSpacing: upper ? '0.2em' : '0.08em' }}>
        {upper ? name.toUpperCase() : name}
      </div>
      {s.header === 'circles' && <div className="flex gap-1 px-1.5 pb-1">{[0, 1, 2, 3].map((i) => <span key={i} className="size-4 rounded-full border" style={{ borderColor: p.accent, background: p.chip }} />)}</div>}
      <div className="mx-1.5 flex h-[38%] items-end p-1.5" style={{ background: p.chip, borderRadius: radius }}>
        <span className="text-[10px] leading-tight" style={{ fontFamily: displayFamily(s.pairing) }}>{name}</span>
      </div>
      <div className={`grid ${tiles} gap-1 p-1.5`}>
        {Array.from({ length: s.phoneColumns === 3 ? 6 : 4 }, (_, i) => <span key={i} className="h-9" style={{ background: i % 2 ? p.line : p.chip, borderRadius: radius }} />)}
      </div>
      {s.bottomTabs && <div className="mt-auto h-3 border-t" style={{ borderColor: p.line }} />}
    </div>
  )
}
