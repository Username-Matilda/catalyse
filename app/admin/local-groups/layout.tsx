import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin · Local Groups' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
