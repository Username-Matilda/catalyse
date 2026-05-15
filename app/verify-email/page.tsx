'use client'

import { useEffect, useState, Suspense, FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { apiRequest } from '@/lib/api'
import Button from '@/components/Button'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(() =>
    token ? 'loading' : 'error',
  )
  const [errorMessage, setErrorMessage] = useState(() =>
    token ? '' : 'No confirmation token found. Please use the link from your email.',
  )
  const [resendEmail, setResendEmail] = useState('')
  const [resendSent, setResendSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  async function handleResend(e: FormEvent) {
    e.preventDefault()
    await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resendEmail }),
    })
    setResendSent(true)
    setResendCooldown(60)
  }

  useEffect(() => {
    if (!token) return

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
        <p className="text-text-light mb-6">In the meantime, you can browse available projects.</p>
        <Button href="/projects">Browse Projects</Button>
      </div>
    )
  }

  const alreadyUsed = errorMessage.includes('already been used')

  return (
    <div className="bg-surface rounded-xl shadow p-8 text-center">
      <h1 style={{ color: 'var(--error)' }}>Confirmation failed</h1>
      <p className="text-text-light mt-4 mb-6">{errorMessage}</p>
      {!alreadyUsed && (
        <div className="mt-2 pt-6 border-t border-border text-left">
          {resendSent ? (
            <p className="text-text-light text-sm text-center">
              {resendCooldown > 0
                ? `Email sent! You can request another in ${resendCooldown}s.`
                : 'Email sent! Check your inbox.'}
            </p>
          ) : (
            <>
              <p className="text-text-light text-sm mb-3">Request a new confirmation link:</p>
              <form onSubmit={handleResend} className="flex gap-2">
                <input
                  type="email"
                  required
                  placeholder="Your email address"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="flex-1 border border-border rounded px-3 py-2 text-sm bg-background"
                />
                <Button type="submit" disabled={resendCooldown > 0} variant="outline">
                  Send
                </Button>
              </form>
            </>
          )}
        </div>
      )}
      {alreadyUsed && (
        <Button href="/login" variant="outline">
          Go to login
        </Button>
      )}
      <p className="text-text-light text-sm mt-6">
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
