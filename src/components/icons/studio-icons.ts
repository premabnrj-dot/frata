// =============================================================================
// FILE: src/components/icons/studio-icons.ts — the Studio workbench's own icons (WB·2/WB·3; mockup 2026-11-22
// screen 1): the inspector as a panel on the right, Design, Versions, Preview only, a shopper's phone and Copy.
//
// Drawn to icon.tsx's rule (24 grid, two strokes: body and tinge) but kept OUT of its shared map: that map is in
// every page's script, and six icons only Studio draws put the look editor over its budget (release 2026-11-22).
// Pass one as `<Icon name={STUDIO_ICONS.focus} />`.
// =============================================================================
import type { IconPaths } from './icon'

export const STUDIO_ICONS = {
  inspector: ['M4 5h16v14H4z', 'M14.5 5v14'],
  brush: ['M14.5 4.5l5 5-8 8-5 .5.5-5z', 'M12 7l5 5'],
  clock: ['M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z', 'M12 7.5V12l3 2'],
  focus: ['M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5', 'M10 12h4'],
  device: ['M7 3h10v18H7z', 'M10.5 18h3'],
  copy: ['M9 9h11v11H9z', 'M15 9V4H4v11h5'],
} as const satisfies Record<string, IconPaths>
