'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { useToast } from '@/lib/toast'

export default function SettingsPage() {
  const router = useRouter()
  const { user, loading, logout } = useAuth()
  const showToast = useToast()

  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [changingEmail, setChangingEmail] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  async function handleChangeEmail(e: FormEvent) {
    e.preventDefault()
    setChangingEmail(true)
    try {
      const data = await apiRequest<{ message: string }>('/api/auth/change-email', {
        method: 'POST',
        body: JSON.stringify({ new_email: newEmail, password: emailPassword }),
      })
      showToast(data.message, 'success')
      setNewEmail('')
      setEmailPassword('')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Email change failed', 'error')
    } finally {
      setChangingEmail(false)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error')
      return
    }
    setChangingPassword(true)
    try {
      const data = await apiRequest<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      showToast(data.message, 'success')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Password change failed', 'error')
    } finally {
      setChangingPassword(false)
    }
  }

  async function handleDeleteAccount(e: FormEvent) {
    e.preventDefault()
    if (deletePassword !== deleteConfirmPassword) {
      showToast('Passwords do not match', 'error')
      return
    }
    setDeleting(true)
    try {
      const data = await apiRequest<{ message: string }>('/api/auth/delete-account', {
        method: 'POST',
        body: JSON.stringify({ password: deletePassword }),
      })
      showToast(data.message, 'success')
      setTimeout(async () => {
        await logout()
      }, 1500)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Account deletion failed', 'error')
      setDeleting(false)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <h1>Settings</h1>

        {/* Change Email */}
        <div className="bg-surface rounded-xl shadow p-6 mb-6 overflow-hidden wrap-break-word">
          <h2 role="heading">Change Email</h2>
          <p className="text-sm text-text-light mb-4">
            Current email: <strong>{user.email}</strong>
          </p>

          <form onSubmit={handleChangeEmail}>
            <div className="mb-5">
              <label htmlFor="new_email">New Email Address</label>
              <input
                type="email"
                id="new_email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div className="mb-5">
              <label htmlFor="email_password">Your Password</label>
              <input
                type="password"
                id="email_password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
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

          <form onSubmit={handleChangePassword}>
            <div className="mb-5">
              <label htmlFor="current_password">Current Password</label>
              <input
                type="password"
                id="current_password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="mb-5">
              <label htmlFor="new_password">New Password</label>
              <input
                type="password"
                id="new_password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="mb-5">
              <label htmlFor="confirm_password">Confirm New Password</label>
              <input
                type="password"
                id="confirm_password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                  This action is permanent and cannot be undone. Please enter your password twice to
                  confirm.
                </p>

                <form onSubmit={handleDeleteAccount}>
                  <div className="mb-5">
                    <label htmlFor="delete_password">Enter your password</label>
                    <input
                      type="password"
                      id="delete_password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-5">
                    <label htmlFor="delete_confirm_password">Confirm your password</label>
                    <input
                      type="password"
                      id="delete_confirm_password"
                      value={deleteConfirmPassword}
                      onChange={(e) => setDeleteConfirmPassword(e.target.value)}
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
                      onClick={() => {
                        setShowDeleteModal(false)
                        setDeletePassword('')
                        setDeleteConfirmPassword('')
                      }}
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
