'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { apiRequest } from '@/lib/api'
import Button from '@/components/Button'

interface ForgotResponse {
  message: string
  _dev_reset_url?: string
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [devUrl, setDevUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const data = await apiRequest<ForgotResponse>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      })
      setSubmitted(true)
      if (data._dev_reset_url) setDevUrl(data._dev_reset_url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <div style={{ maxWidth: 400, margin: '60px auto' }}>
          <h1 className="text-center">Reset Password</h1>
          <p className="text-center text-text-light" style={{ marginBottom: 32 }}>
            Enter your email and we&apos;ll send you a reset link.
          </p>

          {error && (
            <div role="alert" className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]">
              {error}
            </div>
          )}

          {!submitted ? (
            <form className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word" onSubmit={handleSubmit}>
              <div className="mb-5">
                <label htmlFor="email" className="required">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send Reset Link'}
              </Button>

              <p className="text-center text-text-light" style={{ marginTop: 20 }}>
                Remember your password? <Link href="/login">Login</Link>
              </p>
            </form>
          ) : (
            <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word">
              <div className="text-center">
                <h3 style={{ color: 'var(--success)' }}>Check Your Email</h3>
                <p className="text-text-light" style={{ margin: '16px 0' }}>
                  If an account exists with that email, you&apos;ll receive a password reset link shortly.
                </p>
                <Button href="/login" variant="outline">Back to Login</Button>
                <p className="text-sm text-text-light" style={{ marginTop: 16 }}>
                  Not receiving the email? Check your spam folder, or{' '}
                  <a href="mailto:matilda@pauseai.info">contact support</a>.
                </p>
              </div>
              {devUrl && (
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-light)' }}>Dev mode — Reset link:</p>
                  <a href={devUrl} style={{ wordBreak: 'break-all' }}>{devUrl}</a>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
