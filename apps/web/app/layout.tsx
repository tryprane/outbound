import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'OutreachOS - Outbound Automation',
  description: 'Internal outbound automation platform for digital marketing agencies',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={GeistSans.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
