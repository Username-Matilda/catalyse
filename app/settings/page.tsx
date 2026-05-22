'use client'

import { useState, FormEvent } from 'react'
import { useRequireAuth } from '@/lib/hooks/auth'
import { useMutation } from '@tanstack/react-query'
import Button from '@/components/Button'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'

export default function SettingsPage() {
  const { user, loading, logout } = useRequireAuth()
  const showToast = useToast()

  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState('')

  const changeEmailMutation = useMutation({
    ...orpc.auth.changeEmail.mutationOptions(),
    onSuccess: (data) => {
      showToast(data.message, 'success')
      setNewEmail('')
      setEmailPassword('')
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Email change failed', 'error')
    },
  })

  const changePasswordMutation = useMutation({
    ...orpc.auth.changePassword.mutationOptions(),
    onSuccess: (data) => {
      showToast(data.message, 'success')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Password change failed', 'error')
    },
  })

  const deleteAccountMutation = useMutation({
    ...orpc.auth.deleteAccount.mutationOptions(),
    onSuccess: (data) => {
      showToast(data.message, 'success')
      setTimeout(async () => {
        await logout()
      }, 1500)
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Account deletion failed', 'error')
    },
  })

  function handleChangeEmail(e: FormEvent) {
    e.preventDefault()
    changeEmailMutation.mutate({ newEmail, password: emailPassword })
  }

  function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error')
      return
    }
    changePasswordMutation.mutate({ currentPassword, newPassword })
  }

  function handleDeleteAccount(e: FormEvent) {
    e.preventDefault()
    if (user?.hasPassword) {
      if (deletePassword !== deleteConfirmPassword) {
        showToast('Passwords do not match', 'error')
        return
      }
    } else {
      if (deletePassword !== 'DELETE') {
        showToast('Please type DELETE to confirm', 'error')
        return
      }
    }
    deleteAccountMutation.mutate(user?.hasPassword ? { password: deletePassword } : {})
  }

  if (loading || !user) return null

  return (
    <>
      <main className="container py-5 pb-15">
        <h1>Settings</h1>

        {/* Change Email */}
        <div className="bg-surface rounded-xl shadow p-6 mb-6 overflow-hidden wrap-break-word">
          <h2 role="heading">Change Email</h2>
          <p className="text-sm text-text-light mb-4">
            Current email: <strong>{user.email}</strong>
          </p>

          <form onSubmit={handleChangeEmail}>
            <div className="mb-5">
              <label htmlFor="newEmail">New Email Address</label>
              <input
                type="email"
                id="newEmail"
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
            <Button type="submit" disabled={changeEmailMutation.isPending}>
              {changeEmailMutation.isPending ? 'Changing…' : 'Change Email'}
            </Button>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-surface rounded-xl shadow p-6 mb-6 overflow-hidden wrap-break-word">
          <h2 role="heading">Change Password</h2>

          <form onSubmit={handleChangePassword}>
            <div className="mb-5">
              <label htmlFor="currentPassword">Current Password</label>
              <input
                type="password"
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="mb-5">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
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
            <Button type="submit" disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending ? 'Changing…' : 'Change Password'}
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
                <h2 className="m-0 text-xl">Delete Your Account</h2>
              </div>
              <div className="p-6">
                {user.hasPassword && (
                  <p className="text-text-light mb-4">
                    This action is permanent and cannot be undone. Please enter your password twice
                    to confirm.
                  </p>
                )}

                <form onSubmit={handleDeleteAccount}>
                  {user.hasPassword ? (
                    <>
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
                    </>
                  ) : (
                    <>
                      <p className="text-text-light mb-4">
                        This action is permanent and cannot be undone.
                      </p>
                      <p className="text-text-light mb-4">
                        Type <strong>DELETE</strong> to confirm.
                      </p>
                      <div className="mb-5">
                        <input
                          type="text"
                          value={deletePassword}
                          onChange={(e) => setDeletePassword(e.target.value)}
                          placeholder="DELETE"
                          required
                        />
                      </div>
                    </>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      variant="danger"
                      disabled={deleteAccountMutation.isPending}
                    >
                      {deleteAccountMutation.isPending ? 'Deleting…' : 'Permanently Delete Account'}
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
