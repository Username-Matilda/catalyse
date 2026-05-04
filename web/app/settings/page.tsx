'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

export default function SettingsPage() {
  const router = useRouter()
  const { user, loading, logout } = useAuth()

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
      setTimeout(async () => {
        await logout()
      }, 1500)
    } catch (err: unknown) {
      setDeleteAlert({ type: 'error', message: err instanceof Error ? err.message : 'Account deletion failed' })
      setDeleting(false)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="container page">
        <h1>Settings</h1>

        <div className="card" style={{ marginBottom: 24 }}>
          <h2 role="heading">Change Password</h2>

          {passwordAlert && (
            <div role="alert" className={`message ${passwordAlert.type === 'success' ? 'success' : 'error'}`} style={{ marginBottom: 16 }}>
              {passwordAlert.message}
            </div>
          )}

          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label htmlFor="current_password">Current Password</label>
              <input
                type="password"
                id="current_password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="new_password">New Password</label>
              <input
                type="password"
                id="new_password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirm_password">Confirm New Password</label>
              <input
                type="password"
                id="confirm_password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={changingPassword}>
              {changingPassword ? 'Changing…' : 'Change Password'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Delete Account</h2>
          <p style={{ color: 'var(--text-light)', marginBottom: 16 }}>
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
          <button className="btn btn-danger" onClick={() => setShowDeleteModal(true)}>
            Delete My Account
          </button>
        </div>

        {showDeleteModal && (
          <div
            id="deleteModal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete Account"
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            }}
          >
            <div className="card" style={{ maxWidth: 480, width: '100%', margin: 16 }}>
              <h2>Delete Your Account</h2>
              <p style={{ color: 'var(--text-light)', marginBottom: 16 }}>
                This action is permanent. Please enter your password to confirm.
              </p>

              {deleteAlert && (
                <div role="alert" className={`message ${deleteAlert.type === 'success' ? 'success' : 'error'}`} style={{ marginBottom: 16 }}>
                  {deleteAlert.message}
                </div>
              )}

              <form onSubmit={handleDeleteAccount}>
                <div className="form-group">
                  <label htmlFor="delete_password">Enter your password</label>
                  <input
                    type="password"
                    id="delete_password"
                    value={deletePassword}
                    onChange={e => setDeletePassword(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="delete_confirm_password">Confirm your password</label>
                  <input
                    type="password"
                    id="delete_confirm_password"
                    value={deleteConfirmPassword}
                    onChange={e => setDeleteConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-danger" disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Permanently Delete Account'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => { setShowDeleteModal(false); setDeleteAlert(null); setDeletePassword(''); setDeleteConfirmPassword('') }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
