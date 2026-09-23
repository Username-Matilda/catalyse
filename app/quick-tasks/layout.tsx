import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Quick Tasks' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
