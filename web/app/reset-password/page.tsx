'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { apiRequest } from '@/lib/api'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!token) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h3 style={{ color: 'var(--error)' }}>Invalid Link</h3>
        <p style={{ margin: '16px 0', color: 'var(--text-light)' }}>
          This reset link is invalid or has expired. Please request a new one.
        </p>
        <Link href="/forgot-password" className="btn btn-outline">Request New Link</Link>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== passwordConfirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setSubmitting(true)
    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, new_password: password }),
      })
      router.push('/login')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed')
      setSubmitting(false)
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      {error && (
        <div role="alert" className="message error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="password" className="required">New Password</label>
        <input
          type="password"
          id="password"
          name="password"
          required
          minLength={8}
          autoFocus
          placeholder="At least 8 characters"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="password_confirm" className="required">Confirm Password</label>
        <input
          type="password"
          id="password_confirm"
          name="password_confirm"
          required
          minLength={8}
          placeholder="Type your password again"
          value={passwordConfirm}
          onChange={e => setPasswordConfirm(e.target.value)}
        />
      </div>

      <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
        {submitting ? 'Resetting…' : 'Reset Password'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <>
      <Header />
      <main className="container page">
        <div style={{ maxWidth: 400, margin: '60px auto' }}>
          <h1 style={{ textAlign: 'center' }}>Set New Password</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-light)', marginBottom: 32 }}>
            Choose a new password for your account.
          </p>
          <Suspense fallback={<div className="loading">Loading…</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </main>
    </>
  )
}
