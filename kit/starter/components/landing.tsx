'use client'

import { useEffect } from 'react'

/** Keeps the shopper's own utm_ tags from their first page, so checkout credits where they came from. */
export function Landing() {
  useEffect(() => { try { if (!sessionStorage.getItem('landing') && /[?&]utm_/.test(location.search)) sessionStorage.setItem('landing', location.search) } catch { /* private window */ } }, [])
  return null
}
