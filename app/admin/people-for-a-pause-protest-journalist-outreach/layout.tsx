import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin · Journalist Outreach' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
