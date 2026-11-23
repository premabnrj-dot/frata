'use client'

import dynamic from 'next/dynamic'

// Studio's entry states' two controls, drawn on the server and loaded after the first paint: the Studio page's
// first-load script stays 1.5 kB under its pin (the chat's page, which most visits are, never needs them).
export const ConfirmPasskeys = dynamic(() => import('./confirm-passkeys').then((m) => m.ConfirmPasskeys))
export const OpenStore = dynamic(() => import('./open-store').then((m) => m.OpenStore))
