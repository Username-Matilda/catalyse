import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'People for a Pause · Journalist outreach',
  robots: { index: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
