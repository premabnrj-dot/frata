import { appIcon } from '@/components/brand/app-icon'

export const dynamic = 'force-static'
/** The platform's browser-tab icon (64 px; browsers scale it down). */
export function GET() { return appIcon(64) }
