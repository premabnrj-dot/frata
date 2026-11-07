import { appIcon } from '@/components/brand/app-icon'

export const dynamic = 'force-static'
/** The platform's home-screen icon (iOS rounds the corners itself, so the square is full-bleed). */
export function GET() { return appIcon(180) }
