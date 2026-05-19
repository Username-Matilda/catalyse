'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { orpc } from '@/lib/orpc'
import Button from '@/components/Button'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [devUrl, setDevUrl] = useState('')

  const mutation = useMutation({
    ...orpc.auth.forgotPassword.mutationOptions(),
    onSuccess: (data) => {
      if (data._devResetUrl) setDevUrl(data._devResetUrl)
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate({ email: email.trim() })
  }

  return (
    <>
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <div style={{ maxWidth: 400, margin: '60px auto' }}>
          <h1 className="text-center">Reset Password</h1>
          <p className="text-center text-text-light" style={{ marginBottom: 32 }}>
            Enter your email and we&apos;ll send you a reset link.
          </p>

          {mutation.isError && (
            <div
              role="alert"
              className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]"
            >
              {mutation.error instanceof Error ? mutation.error.message : 'Something went wrong'}
            </div>
          )}

          {!mutation.isSuccess ? (
            <form
              className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
              onSubmit={handleSubmit}
            >
              <div className="mb-5">
                <label htmlFor="email" className="required">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? 'Sending…' : 'Send Reset Link'}
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
                  If an account exists with that email, you&apos;ll receive a password reset link
                  shortly.
                </p>
                <Button href="/login" variant="outline">
                  Back to Login
                </Button>
                <p className="text-sm text-text-light" style={{ marginTop: 16 }}>
                  Not receiving the email? Check your spam folder, or{' '}
                  <a href="mailto:matilda@pauseai.info">contact support</a>.
                </p>
              </div>
              {devUrl && (
                <div
                  style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}
                >
                  <p style={{ fontSize: 12, color: 'var(--text-light)' }}>Dev mode — Reset link:</p>
                  <a href={devUrl} style={{ wordBreak: 'break-all' }}>
                    {devUrl}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
