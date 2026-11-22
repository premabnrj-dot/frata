'use client'

import { Icon, type IconName, type IconPaths } from '@/components/icons/icon'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/panel-rail.tsx — A FOLDED PANEL (Studio workbench, plan WB·2; mockup
// docs/mockups/2026-11-22-studio-workbench.html screen 1, `.rail`).
//
// A side panel folded to a 44 px column of icon buttons on the side colour: the first shows the panel again, the rest
// open a part of it. A dot marks one that needs the person (the agent asks, a check fails); its words are in the
// button's name ("Show chat. 1 new"), never the dot alone. A rail never opens its panel by itself: only a press does.
// Not the console's sidebar rail (src/components/shell/rail-toggle.tsx), which folds navigation.
// =============================================================================

export type RailItem = {
  icon: IconName | IconPaths
  /** The button's name ("Show chat", "Checks"). */
  label: string
  /** What needs the person, said after the name and drawn as the dot ("1 new", "1 to fix"). */
  note?: string
  /** For the button that shows the panel: false while folded (WAI-ARIA disclosure). */
  expanded?: boolean
  /** The id of the panel the button shows. */
  controls?: string
  onClick: () => void
}

/** An icon-only button as the workbench draws it (`.ib`): 32 px from 768, 44 on a phone; its name is its label. Unlike
 *  the menu's and the nav's looser icon buttons, it hovers to the sunk colour and shows `aria-pressed` the same way
 *  (Preview only). Shared by the rail and the Studio workbench's bars. */
export const ICON_BUTTON = 'relative grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:bg-sunk hover:text-foreground aria-pressed:bg-sunk aria-pressed:text-foreground md:size-8'

export function PanelRail({ items, className }: { items: readonly RailItem[]; className?: string }) {
  return (
    <div data-rail className={cn('grid w-11 auto-rows-min justify-items-center gap-1 bg-side py-1.5', className)}>
      {items.map((it) => (
        <button key={it.label} type="button" onClick={it.onClick} aria-label={it.note ? `${it.label}. ${it.note}` : it.label}
          aria-expanded={it.expanded} aria-controls={it.controls}
          className={ICON_BUTTON}>
          <Icon name={it.icon} className="size-4" />
          {it.note ? <span aria-hidden="true" data-dot className="absolute top-[5px] right-[5px] size-[7px] rounded-full border-[1.5px] border-side bg-primary" /> : null}
        </button>
      ))}
    </div>
  )
}
