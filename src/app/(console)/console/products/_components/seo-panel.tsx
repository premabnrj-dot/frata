'use client'

import { InfoTip } from '@/components/ui/info-tip'
import { DESCRIPTION_WARN_AT, shareCard, TITLE_WARN_AT } from '@/domains/catalogue/seo'
import { pick, urlFor } from '@/domains/media/sizes'
import type { Photo } from './photos'
import { Icon } from '@/components/icons/icon'

/**
 * Search and sharing: closed by default (owner, 2026-11-06) — every product
 * already has a title, description and address made for it; this is for the
 * merchant who wants to change them. Empty fields use the defaults shown.
 */
export function SeoPanel({ handle, onHandle, seoTitle, onSeoTitle, seoDescription, onSeoDescription, defaults, address, cover, everLive, errors }: {
  handle: string; onHandle: (v: string) => void; seoTitle: string; onSeoTitle: (v: string) => void; seoDescription: string; onSeoDescription: (v: string) => void
  defaults: { title: string; description: string; handle: string }; address: string; cover: Photo | undefined; everLive: boolean; errors: Record<string, string>
}) {
  const title = seoTitle.trim() || defaults.title
  const description = seoDescription.trim() || defaults.description
  const url = `${address}/products/${handle || defaults.handle}`
  const share = shareCard(title.replace(/\s*\|[^|]*$/, ''), description)
  const count = (n: number, warn: number) => <span className={n > warn ? 'text-warn-text' : ''}>{n}{n > warn ? ` · phones may cut it after about ${warn}` : ''}</span>
  return (
    <details className="group rounded-md border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform duration-fast group-open:rotate-90"><Icon name="chevron" className="size-3.5" /></span>
        <span className="min-w-0 flex-1"><span className="block font-semibold">Search and sharing</span>
          <span className="block truncate text-xs text-muted-foreground">{url}</span></span>
        <span className="text-xs text-muted-foreground">{seoTitle || seoDescription ? 'Edited' : 'Made for you'}</span>
      </summary>
      <div className="space-y-4 border-t border-border p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <figure className="min-w-0 space-y-1">
            <figcaption className="text-xs font-medium text-muted-foreground">On Google</figcaption>
            <div className="rounded-md border border-border p-3">
              <p className="truncate text-xs text-muted-foreground">{url.replace(/\//g, ' › ')}</p>
              <p className="line-clamp-1 text-base text-info-text">{title}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
            </div>
          </figure>
          <figure className="min-w-0 space-y-1">
            <figcaption className="text-xs font-medium text-muted-foreground">Shared on WhatsApp</figcaption>
            <div className="flex overflow-hidden rounded-md border border-border bg-muted/40">
              {cover ? <img src={urlFor(cover.base, pick(cover.widths, 160))} alt="" width={64} height={80} className="h-20 w-16 shrink-0 object-cover" /> : <span className="h-20 w-16 shrink-0 bg-muted" />}
              <div className="min-w-0 p-2 text-sm"><p className="line-clamp-1 font-medium">{share.title}</p><p className="line-clamp-2 text-xs text-muted-foreground">{share.description}</p><p className="truncate text-xs text-muted-foreground">{address}</p></div>
            </div>
          </figure>
        </div>
        <div className="space-y-1">
          <label htmlFor="seo-title" className="block text-sm font-medium">Page title</label>
          <input id="seo-title" value={seoTitle} maxLength={200} placeholder={defaults.title} aria-invalid={!!errors.seoTitle || undefined} onChange={(e) => onSeoTitle(e.target.value)} className="h-10 md:h-9 w-full rounded-md border border-input bg-card px-3 text-sm" />
          <p className="text-xs text-muted-foreground">{count(title.length, TITLE_WARN_AT)} characters. Empty uses the one shown.</p>
        </div>
        <div className="space-y-1">
          <div className="flex items-center"><label htmlFor="seo-desc" className="text-sm font-medium">Description</label><InfoTip about="the description">Made from the product’s own facts. Google may show its own words instead.</InfoTip></div>
          <textarea id="seo-desc" rows={3} value={seoDescription} maxLength={400} placeholder={defaults.description} aria-invalid={!!errors.seoDescription || undefined} onChange={(e) => onSeoDescription(e.target.value)} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
          <p className="text-xs text-muted-foreground">{count(description.length, DESCRIPTION_WARN_AT)} characters.</p>
        </div>
        <div className="space-y-1">
          <label htmlFor="handle" className="block text-sm font-medium">Address</label>
          <div className="flex min-w-0 items-center rounded-md border border-input bg-card text-sm aria-invalid:border-danger-text focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring" aria-invalid={!!errors.handle || undefined}>
            <span className="shrink-0 truncate pl-3 font-mono text-xs text-muted-foreground">…/products/</span>
            <input id="handle" value={handle} maxLength={100} placeholder={defaults.handle} onChange={(e) => onHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} className="h-10 md:h-9 min-w-0 flex-1 bg-transparent pr-3 font-mono text-sm outline-none" />
          </div>
          {errors.handle ? <p className="text-xs text-danger-text">{errors.handle}</p>
            : <p className="text-xs text-muted-foreground">{everLive ? 'It has been live: if you change it, the old address keeps working and sends shoppers here.' : 'Short words shoppers can read. Fixed once it has been live (a change then redirects).'}</p>}
        </div>
      </div>
    </details>
  )
}
