import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin · Quick Tasks' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
