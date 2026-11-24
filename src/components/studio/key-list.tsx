'use client'

import { KeySheet } from '@/components/ui/key-sheet'
import { KEY_LIST } from '@/domains/studio/layout'

// `?`: the workbench's keys (one table, src/domains/studio/layout.ts) in the console's key sheet, with its one switch
// for single keys on this device (WCAG 2.1.4; the orders queue's switch, so one choice holds across the console).

const KEYS = KEY_LIST.map((k) => ({ key: k.shows, label: k.label }))

export function KeyList({ open, onClose, enabled, onEnabled }: { open: boolean; onClose: () => void; enabled: boolean; onEnabled: (on: boolean) => void }) {
  return <KeySheet open={open} onClose={onClose} enabled={enabled} onEnabled={onEnabled} keys={KEYS} description={null} close="Close shortcuts" />
}
