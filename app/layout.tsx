import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Project Focus',
  description: 'Your distraction-free learning management system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
