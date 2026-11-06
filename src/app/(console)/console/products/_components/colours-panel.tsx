'use client'

import { useState } from 'react'
import type { ColourInput } from '@/domains/catalogue/product-form'
import { pick, urlFor } from '@/domains/media/sizes'
import { clampCrop, swatchBackground, type Crop } from '@/domains/media/swatch'
import type { Photo } from './photos'

export type Family = { id: string; name: string }

/** A round swatch: a cut from a photo, a plain colour, or the colour's initial. The name is always written beside it elsewhere. */
export function Swatch({ c, photos, d = 28 }: { c: ColourInput; photos: Photo[]; d?: number }) {
  const img = c.crop ? photos.find((p) => p.id === c.crop!.imageId) : undefined
  if (img && c.crop) {
    const b = swatchBackground(c.crop, img.width, img.height, d)
    return <span aria-hidden="true" className="inline-block shrink-0 rounded-full border border-border" style={{ width: d, height: d, backgroundImage: `url(${urlFor(img.base, pick(img.widths, 400))})`, backgroundSize: b.size, backgroundPosition: b.position }} />
  }
  if (c.hex) return <span aria-hidden="true" className="inline-block shrink-0 rounded-full border border-border" style={{ width: d, height: d, background: c.hex }} />
  return <span aria-hidden="true" className="inline-grid shrink-0 place-items-center rounded-full border border-dashed border-input text-[10px] text-muted-foreground" style={{ width: d, height: d }}>{c.value.slice(0, 1)}</span>
}

/** Each colour: the family it files under (filters, Google), and its swatch — cut from a photo (prints) or a plain colour. */
export function ColoursPanel({ values, colours, onChange, photos, families }: { values: string[]; colours: ColourInput[]; onChange: (c: ColourInput[]) => void; photos: Photo[]; families: Family[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const get = (v: string): ColourInput => colours.find((c) => c.value === v) ?? { value: v, family: null, hex: null, crop: null }
  const put = (c: ColourInput) => onChange([...colours.filter((x) => x.value !== c.value && values.includes(x.value)), c])
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-md border border-border">
        {values.map((v) => {
          const c = get(v)
          return (
            <li key={v} className="space-y-2 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Swatch c={c} photos={photos} />
                <span className="min-w-20 font-medium">{v}</span>
                <label className="sr-only" htmlFor={`fam-${v}`}>Colour family for {v}</label>
                <select id={`fam-${v}`} value={c.family ?? ''} onChange={(e) => put({ ...c, family: e.target.value || null })} className="h-8 rounded-md border border-input bg-card px-1.5 text-sm">
                  <option value="">Family…</option>{families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <button type="button" className="ml-auto text-xs underline" aria-expanded={editing === v} onClick={() => setEditing(editing === v ? null : v)}>{editing === v ? 'Done' : 'Swatch'}</button>
              </div>
              {editing === v && <SwatchEditor c={c} photos={photos.filter((p) => !p.optionValue || p.optionValue === v)} onChange={put} />}
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">The family files &ldquo;Rani pink&rdquo; under Pink for shoppers’ filters and for Google. A print (bandhani, ikat) reads best as a swatch cut from its photo.</p>
    </div>
  )
}

function SwatchEditor({ c, photos, onChange }: { c: ColourInput; photos: Photo[]; onChange: (c: ColourInput) => void }) {
  const img = (c.crop && photos.find((p) => p.id === c.crop!.imageId)) || null
  const setCrop = (p: Photo, crop: Crop) => onChange({ ...c, hex: null, crop: { imageId: p.id, ...clampCrop(crop, p.width, p.height) } })
  return (
    <div className="space-y-3 rounded-md bg-muted/50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">Plain colour
          <input type="color" value={c.hex ?? '#888888'} onChange={(e) => onChange({ ...c, hex: e.target.value, crop: null })} className="h-8 w-10 cursor-pointer rounded border border-input bg-card" /></label>
        {(c.hex || c.crop) && <button type="button" className="text-xs underline" onClick={() => onChange({ ...c, hex: null, crop: null })}>No swatch</button>}
      </div>
      {photos.length === 0 ? <p className="text-xs text-muted-foreground">Add a photo of this colour to cut a swatch from it.</p> : (
        <div className="space-y-2">
          <p className="text-xs font-medium">Or cut it from a photo: pick one, then click (or use the arrow keys) where the swatch should be.</p>
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => <button key={p.id} type="button" aria-pressed={img?.id === p.id} aria-label="Use this photo" onClick={() => setCrop(p, c.crop && img?.id === p.id ? c.crop : { x: 0.5, y: 0.45, r: 0.08 })}
              className={`overflow-hidden rounded-sm border-2 ${img?.id === p.id ? 'border-ring' : 'border-transparent'}`}><img src={urlFor(p.base, pick(p.widths, 160))} alt="" width={40} height={50} className="h-[50px] w-10 object-cover" /></button>)}
          </div>
          {img && c.crop && <CropArea photo={img} crop={c.crop} onChange={(k) => setCrop(img, k)} />}
        </div>
      )}
    </div>
  )
}

function CropArea({ photo, crop, onChange }: { photo: Photo; crop: Crop; onChange: (c: Crop) => void }) {
  const W = 220, H = Math.round((W * photo.height) / photo.width)
  const at = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); onChange({ ...crop, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }) }
  const step = 0.02
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div role="slider" tabIndex={0} aria-label="Swatch position" aria-valuetext={`${Math.round(crop.x * 100)}% across, ${Math.round(crop.y * 100)}% down`}
        className="relative cursor-crosshair touch-none overflow-hidden rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" style={{ width: W, height: H }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); at(e) }} onPointerMove={(e) => { if (e.buttons) at(e) }}
        onKeyDown={(e) => {
          const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
          if (d) { e.preventDefault(); onChange({ ...crop, x: crop.x + d[0]!, y: crop.y + d[1]! }) }
        }}>
        <img src={urlFor(photo.base, pick(photo.widths, 400))} alt="" width={W} height={H} draggable={false} className="h-full w-full object-cover" />
        <span aria-hidden="true" className="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.5),0_0_0_999px_rgba(0,0,0,.35)]"
          style={{ left: crop.x * W - crop.r * W, top: crop.y * H - crop.r * W, width: crop.r * 2 * W, height: crop.r * 2 * W }} />
      </div>
      <div className="space-y-1">
        <label htmlFor="crop-size" className="block text-xs font-medium">Size</label>
        <input id="crop-size" type="range" min={0.03} max={0.3} step={0.01} value={crop.r} onChange={(e) => onChange({ ...crop, r: Number(e.target.value) })} />
      </div>
    </div>
  )
}
