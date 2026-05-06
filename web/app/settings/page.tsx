'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'


function Alert({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div role="alert" className={`flex items-center gap-3 p-4 rounded-lg mb-4 ${
      type === 'success'
        ? 'bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] dark:bg-[#064E3B] dark:text-[#6EE7B7] dark:border-[#059669]'
        : 'bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]'
    }`}>
      {message}
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, loading, logout } = useAuth()

  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailAlert, setEmailAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [changingEmail, setChangingEmail] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordAlert, setPasswordAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [changingPassword, setChangingPassword] = useState(false)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState('')
  const [deleteAlert, setDeleteAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  async function handleChangeEmail(e: FormEvent) {
    e.preventDefault()
    setEmailAlert(null)
    setChangingEmail(true)
    try {
      const data = await apiRequest<{ message: string }>('/api/auth/change-email', {
        method: 'POST',
        body: JSON.stringify({ new_email: newEmail, password: emailPassword }),
      })
      setEmailAlert({ type: 'success', message: data.message })
      setNewEmail('')
      setEmailPassword('')
    } catch (err: unknown) {
      setEmailAlert({ type: 'error', message: err instanceof Error ? err.message : 'Email change failed' })
    } finally {
      setChangingEmail(false)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setPasswordAlert(null)
    if (newPassword !== confirmPassword) {
      setPasswordAlert({ type: 'error', message: 'New passwords do not match' })
      return
    }
    setChangingPassword(true)
    try {
      const data = await apiRequest<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      setPasswordAlert({ type: 'success', message: data.message })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      setPasswordAlert({ type: 'error', message: err instanceof Error ? err.message : 'Password change failed' })
    } finally {
      setChangingPassword(false)
    }
  }

  async function handleDeleteAccount(e: FormEvent) {
    e.preventDefault()
    if (deletePassword !== deleteConfirmPassword) {
      setDeleteAlert({ type: 'error', message: 'Passwords do not match' })
      return
    }
    setDeleting(true)
    try {
      const data = await apiRequest<{ message: string }>('/api/auth/delete-account', {
        method: 'POST',
        body: JSON.stringify({ password: deletePassword }),
      })
      setDeleteAlert({ type: 'success', message: data.message })
      setTimeout(async () => { await logout() }, 1500)
    } catch (err: unknown) {
      setDeleteAlert({ type: 'error', message: err instanceof Error ? err.message : 'Account deletion failed' })
      setDeleting(false)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <h1>Settings</h1>

        {/* Change Email */}
        <div className="bg-surface rounded-xl shadow p-6 mb-6 overflow-hidden wrap-break-word">
          <h2 role="heading">Change Email</h2>
          <p className="text-sm text-text-light mb-4">
            Current email: <strong>{user.email}</strong>
          </p>

          {emailAlert && <Alert {...emailAlert} />}

          <form onSubmit={handleChangeEmail}>
            <div className="mb-5">
              <label htmlFor="new_email">New Email Address</label>
              <input
                type="email"
                id="new_email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div className="mb-5">
              <label htmlFor="email_password">Your Password</label>
              <input
                type="password"
                id="email_password"
                value={emailPassword}
                onChange={e => setEmailPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={changingEmail}>
              {changingEmail ? 'Changing…' : 'Change Email'}
            </Button>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-surface rounded-xl shadow p-6 mb-6 overflow-hidden wrap-break-word">
          <h2 role="heading">Change Password</h2>

          {passwordAlert && <Alert {...passwordAlert} />}

          <form onSubmit={handleChangePassword}>
            <div className="mb-5">
              <label htmlFor="current_password">Current Password</label>
              <input
                type="password"
                id="current_password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="mb-5">
              <label htmlFor="new_password">New Password</label>
              <input
                type="password"
                id="new_password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="mb-5">
              <label htmlFor="confirm_password">Confirm New Password</label>
              <input
                type="password"
                id="confirm_password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={changingPassword}>
              {changingPassword ? 'Changing…' : 'Change Password'}
            </Button>
          </form>
        </div>

        {/* Danger Zone */}
        <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word">
          <h2>Danger Zone</h2>
          <p className="text-text-light mb-4">
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
          <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
            Delete My Account
          </Button>
        </div>

        {showDeleteModal && (
          <div
            id="deleteModal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete Account"
            className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          >
            <div className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Delete Your Account</h2>
              </div>
              <div className="p-6">
                <p className="text-text-light mb-4">
                  This action is permanent and cannot be undone. Please enter your password twice to confirm.
                </p>

                {deleteAlert && <Alert {...deleteAlert} />}

                <form onSubmit={handleDeleteAccount}>
                  <div className="mb-5">
                    <label htmlFor="delete_password">Enter your password</label>
                    <input
                      type="password"
                      id="delete_password"
                      value={deletePassword}
                      onChange={e => setDeletePassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-5">
                    <label htmlFor="delete_confirm_password">Confirm your password</label>
                    <input
                      type="password"
                      id="delete_confirm_password"
                      value={deleteConfirmPassword}
                      onChange={e => setDeleteConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" variant="danger" disabled={deleting}>
                      {deleting ? 'Deleting…' : 'Permanently Delete Account'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => { setShowDeleteModal(false); setDeleteAlert(null); setDeletePassword(''); setDeleteConfirmPassword('') }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
