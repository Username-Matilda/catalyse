import type { Metadata } from 'next'
import { Montserrat, Roboto_Slab, Saira_Condensed } from 'next/font/google'
import { AuthProvider } from '@/lib/auth-context'
import './globals.css'

const montserrat = Montserrat({
  weight: '900',
  subsets: ['latin'],
  variable: '--font-montserrat',
})

const robotoSlab = Roboto_Slab({
  weight: ['300', '700'],
  subsets: ['latin'],
  variable: '--font-roboto-slab',
})

const sairaCondensed = Saira_Condensed({
  weight: '700',
  subsets: ['latin'],
  variable: '--font-saira',
})

export const metadata: Metadata = {
  title: 'Catalyse',
  description: 'PauseAI UK volunteer platform',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${robotoSlab.variable} ${sairaCondensed.variable}`}
    >
      <body className="min-h-screen flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
