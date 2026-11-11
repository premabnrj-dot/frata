'use client'

import { useEffect } from 'react'
import { markNoticesReadAction } from './actions'

/** Marks what this page showed as read, once, after it rendered (a write in an action, never in the page). */
export function MarkRead({ ids }: { ids: string[] }) {
  const key = ids.join(',')
  useEffect(() => { if (key) void markNoticesReadAction(key.split(',')) }, [key])
  return null
}
