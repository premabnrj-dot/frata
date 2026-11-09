import type { ThemeManifest } from '../../types'
import { signal_1_0_0 } from './1.0.0'

// Signal 1.1.0 (V1, docs/plans/2026-11-09-video-v1.md) — 1.0 plus a short muted loop in the Hero and in Image with
// text (Mux; the photo stays the first paint and the fallback).
export const signal_1_1_0: ThemeManifest = {
  ...signal_1_0_0,
  version: '1.1.0',
  features: [...signal_1_0_0.features, 'A short silent loop in your hero and stories'],
  allowed: { ...signal_1_0_0.allowed, videoSections: ['hero', 'image_text'] },
}
