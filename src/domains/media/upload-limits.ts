// =============================================================================
// FILE: src/domains/media/upload-limits.ts
//
// What one upload may weigh and how long its token lasts. Kept out of sizes.ts,
// which the shop's browser loads for every photo URL: only the console and the
// upload routes need these (checkout's script budget, PI·2 release 2026-11-12).
// =============================================================================

import { MAX_UPLOAD_BYTES } from './sizes'

/**
 * The most one size of a photo may weigh (security review PI·2: a 400 never needs 3 MB). The browser lowers its
 * quality to fit; an upload token allows no more. A 1600 WebP of a busy print is ~600 kB at 0.82, so these leave room.
 */
const MAX_BYTES_AT: Record<number, number> = { 400: 512 * 1024, 800: 1536 * 1024, 1200: MAX_UPLOAD_BYTES, 1600: MAX_UPLOAD_BYTES }
export const maxBytesFor = (width: number) => MAX_BYTES_AT[width] ?? MAX_UPLOAD_BYTES
/** How long an upload token lasts: each size asks for its own just before it is sent (3 MB on a slow phone: < 1 minute). */
export const UPLOAD_TOKEN_MS = 5 * 60 * 1000
