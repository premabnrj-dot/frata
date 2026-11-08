import { displayFamily } from '@/components/shop-preview/fonts'
import type { ResolvedTheme } from '@/domains/themes/types'

// A theme as a tiny phone (mockup "Look"): drawn at full size from the theme's own colours, type and header, then
// scaled down (so the type scale holds), so a merchant recognises a theme before trying it. Decorative: the
// theme's name is beside it.
export function ThemeThumb({ t, name, size = 'md' }: { t: ResolvedTheme; name: string; size?: 'sm' | 'md' }) {
  const p = t.schemes.paper, s = t.settings
  const upper = s.headings === 'upper' || s.header === 'minimal' || s.header === 'split'
  const radius = s.corners === 'square' ? '0px' : s.corners === 'round' ? '12px' : '3px'
  const three = s.phoneColumns === 3
  return (
    <div aria-hidden="true" className={size === 'sm' ? 'h-[200px] w-[104px] shrink-0 overflow-hidden' : 'h-[300px] w-[150px] shrink-0 overflow-hidden'}>
      <div className={`flex h-[600px] w-[300px] origin-top-left flex-col overflow-hidden rounded-[36px] border-[10px] border-foreground ${size === 'sm' ? 'scale-[0.3467]' : 'scale-50'}`} style={{ background: p.bg, color: p.text }}>
        {s.announcement && <div className="py-1 text-center text-xs" style={{ background: p.accent, color: p.onAccent }}>{s.announcement.text}</div>}
        <div className={`flex h-12 items-center px-4 text-lg font-semibold ${s.header === 'centred' || s.header === 'minimal' || s.header === 'split' ? 'justify-center' : ''}`} style={{ fontFamily: displayFamily(s.pairing), letterSpacing: upper ? '0.2em' : '0.08em' }}>
          {upper ? name.toUpperCase() : name}
        </div>
        {s.header === 'circles' && <div className="flex gap-2 px-3 pb-2">{[0, 1, 2, 3].map((i) => <span key={i} className="size-10 rounded-full border-2" style={{ borderColor: p.accent, background: p.chip }} />)}</div>}
        <div className="mx-3 flex h-56 items-end p-3" style={{ background: p.chip, borderRadius: radius }}>
          <span className="text-2xl leading-tight" style={{ fontFamily: displayFamily(s.pairing) }}>{name}</span>
        </div>
        <div className={`grid gap-2 p-3 ${three ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {Array.from({ length: three ? 6 : 4 }, (_, i) => <span key={i} className={three ? 'h-24' : 'h-28'} style={{ background: i % 2 ? p.line : p.chip, borderRadius: radius }} />)}
        </div>
        {s.footer === 'statement' && <div className="mt-auto px-4 py-3 text-3xl leading-none" style={{ background: t.schemes[s.footerScheme].bg, color: t.schemes[s.footerScheme].text, fontFamily: displayFamily(s.pairing) }}>{name}</div>}
        {s.bottomTabs && <div className={`${s.footer === 'statement' ? '' : 'mt-auto '}h-10 border-t-2`} style={{ borderColor: p.line }} />}
      </div>
    </div>
  )
}
