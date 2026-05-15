import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin · Stats' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
