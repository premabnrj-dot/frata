import { NextResponse } from 'next/server'
import { PREVIEW_COOKIE } from '@/lib/frrata'

// The brand's Preview on website lands here with a token for one page, for 10 minutes. The token goes into an HttpOnly
// cookie (never a page or a log) and the shopper goes on to that page, on this site only.
export function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? ''
  const to = url.searchParams.get('to') ?? ''
  if (!/^v1\.[A-Za-z0-9_-]{8,120}\.[A-Za-z0-9_-]{43}$/.test(token) || !/^\/pages\/[a-z0-9-]{1,60}$/.test(to)) return new NextResponse(null, { status: 404 })
  const res = NextResponse.redirect(new URL(to, url.origin), 303)
  res.cookies.set(PREVIEW_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 })
  res.headers.set('Referrer-Policy', 'no-referrer')
  res.headers.set('Cache-Control', 'no-store')
  return res
}
