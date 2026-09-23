import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Propose a project' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
