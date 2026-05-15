import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin · Volunteer Profile' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
