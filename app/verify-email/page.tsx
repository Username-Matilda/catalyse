'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { apiRequest } from '@/lib/api'
import Button from '@/components/Button'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setErrorMessage('No confirmation token found. Please use the link from your email.')
      setStatus('error')
      return
    }

    apiRequest('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        setErrorMessage(err instanceof Error ? err.message : 'Email confirmation failed')
        setStatus('error')
      })
  }, [token])

  if (status === 'loading') {
    return (
      <div className="bg-surface rounded-xl shadow p-8 text-center">
        <p className="text-text-light">Confirming your email address…</p>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="bg-surface rounded-xl shadow p-8 text-center">
        <h1>Email confirmed!</h1>
        <p className="text-text-light mt-4 mb-6">
          Your email address has been confirmed. Your application is now under review — we&#39;ll
          notify you by email once it&#39;s been assessed.
        </p>
        <p className="text-text-light mb-6">
          In the meantime, you can browse available projects.
        </p>
        <Button href="/projects">Browse Projects</Button>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl shadow p-8 text-center">
      <h1 style={{ color: 'var(--error)' }}>Confirmation failed</h1>
      <p className="text-text-light mt-4 mb-6">{errorMessage}</p>
      <p className="text-text-light text-sm">
        Questions? Contact{' '}
        <a href="mailto:uk@pauseai.info" className="underline">
          uk@pauseai.info
        </a>
      </p>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
      <div className="max-w-lg mx-auto">
        <Suspense
          fallback={
            <div className="bg-surface rounded-xl shadow p-8 text-center">
              <p className="text-text-light">Loading…</p>
            </div>
          }
        >
          <VerifyEmailContent />
        </Suspense>
      </div>
    </main>
  )
}
