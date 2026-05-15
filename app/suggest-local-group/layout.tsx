import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Suggest a Local Group' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
