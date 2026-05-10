import type { Metadata } from 'next'
import { Montserrat, Roboto_Slab, Saira_Condensed } from 'next/font/google'
import { AuthProvider } from '@/lib/auth-context'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ToastProvider } from '@/lib/toast'
import FloatingActions from '@/components/FloatingActions'
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
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':t==='light'?'light':window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              {children}
              <FloatingActions />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
