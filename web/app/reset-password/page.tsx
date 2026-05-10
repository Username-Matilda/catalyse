'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import { apiRequest, ApiError } from '@/lib/api'
import Button from '@/components/Button'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  if (!token) {
    return (
      <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
        <h3 style={{ color: 'var(--error)' }}>Invalid Link</h3>
        <p className="text-text-light" style={{ margin: '16px 0' }}>
          This reset link is invalid or has expired. Please request a new one.
        </p>
        <Button href="/forgot-password" variant="outline">Request New Link</Button>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setFieldErrors({})

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
      if (err instanceof ApiError && err.fieldErrors?.new_password) {
        setFieldErrors({ password: err.fieldErrors.new_password })
      } else {
        setError(err instanceof Error ? err.message : 'Reset failed')
      }
      setSubmitting(false)
    }
  }

  return (
    <form className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word" onSubmit={handleSubmit}>
      {error && (
        <div role="alert" className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]">
          {error}
        </div>
      )}

      <div className="mb-5">
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
          onChange={e => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors({}) }}
          aria-invalid={fieldErrors.password ? true : undefined}
        />
        {fieldErrors.password && <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>{fieldErrors.password}</p>}
      </div>

      <div className="mb-5">
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

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Resetting…' : 'Reset Password'}
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <div style={{ maxWidth: 400, margin: '60px auto' }}>
          <h1 className="text-center">Set New Password</h1>
          <Suspense fallback={<div className="text-center py-10 text-text-light">Loading…</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </main>
    </>
  )
}
