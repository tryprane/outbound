export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/',
    '/campaigns/:path*',
    '/csv/:path*',
    '/mail-accounts/:path*',
    '/sent/:path*',
    '/api/campaigns/:path*',
    '/api/csv/:path*',
    '/api/mail-accounts/:path*',
    '/api/scrape/:path*',
    '/api/sent/:path*',
  ],
}
