export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/',
    '/campaigns/:path*',
    '/csv/:path*',
    '/mail-accounts/:path*',
    '/warmup/:path*',
    '/api-management/:path*',
    '/sent/:path*',
    '/api/api-management/:path*',
    '/api/campaigns/:path*',
    '/api/csv/:path*',
    '/api/mail-accounts/:path*',
    '/api/warmup-settings/:path*',
    '/api/scrape/:path*',
    '/api/sent/:path*',
  ],
}
