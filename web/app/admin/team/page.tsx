'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface Admin {
  id: number
  name: string
  email: string
  created_at: string
}

interface Invite {
  id: number
  email: string
  status: string
  invited_by_name: string
  created_at: string
  expires_at: string
}

export default function AdminTeamPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [admins, setAdmins] = useState<Admin[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [activeTab, setActiveTab] = useState<'admins' | 'invites'>('admins')
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [alert, setAlert] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user?.is_admin) return
    loadData()
  }, [user])

  async function loadData() {
    setLoadingData(true)
    try {
      const [a, i] = await Promise.all([
        apiRequest<Admin[]>('/api/admin/admins'),
        apiRequest<Invite[]>('/api/admin/invites'),
      ])
      setAdmins(a)
      setInvites(i.filter(i => i.status === 'pending'))
    } catch {
      setAlert({ text: 'Failed to load team data', type: 'error' })
    } finally {
      setLoadingData(false)
    }
  }

  function openInviteDialog() {
    setInviteEmail('')
    setInviteSuccess('')
    setShowInviteDialog(true)
  }

  function closeInviteDialog() {
    setShowInviteDialog(false)
    setInviteSuccess('')
    setInviteEmail('')
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await apiRequest('/api/admin/admins/invite', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      setInviteSuccess(`Invite sent to ${inviteEmail}`)
      setInviteEmail('')
      await loadData()
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed to send invite', type: 'error' })
      closeInviteDialog()
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelInvite(id: number) {
    try {
      await apiRequest(`/api/admin/invites/${id}`, { method: 'DELETE' })
      setAlert({ text: 'Invite cancelled', type: 'success' })
      setInvites(prev => prev.filter(i => i.id !== id))
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed to cancel invite', type: 'error' })
    }
  }

  async function revokeAdmin(id: number, name: string) {
    if (!confirm(`Revoke admin access for ${name}?`)) return
    try {
      await apiRequest(`/api/admin/admins/${id}`, { method: 'DELETE' })
      setAlert({ text: 'Admin access revoked', type: 'success' })
      setAdmins(prev => prev.filter(a => a.id !== id))
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed to revoke admin', type: 'error' })
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="container page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1>Team Management</h1>
          <button className="btn btn-primary" onClick={openInviteDialog}>Invite Admin</button>
        </div>

        {alert && (
          <div role="alert" className={`message ${alert.type}`} style={{ marginBottom: 16 }}>
            {alert.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            className={`btn btn-small${activeTab === 'admins' ? ' btn-primary' : ' btn-secondary'}`}
            onClick={() => setActiveTab('admins')}
          >
            Current Admins
          </button>
          <button
            className={`btn btn-small${activeTab === 'invites' ? ' btn-primary' : ' btn-secondary'}`}
            onClick={() => setActiveTab('invites')}
          >
            Pending Invites
          </button>
        </div>

        {loadingData ? (
          <div className="loading">Loading…</div>
        ) : (
          <>
            {activeTab === 'admins' && (
              <div id="adminList">
                {admins.length === 0 ? (
                  <p style={{ color: 'var(--text-light)' }}>No admins found.</p>
                ) : (
                  admins.map(a => (
                    <div key={a.id} className="card" style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>{a.name}</strong>
                          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-light)' }}>{a.email}</p>
                        </div>
                        {a.id !== user.id && (
                          <button
                            className="btn btn-small"
                            style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
                            onClick={() => revokeAdmin(a.id, a.name)}
                          >
                            Revoke Access
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'invites' && (
              <div id="inviteList">
                {invites.length === 0 ? (
                  <p style={{ color: 'var(--text-light)' }}>No pending invites.</p>
                ) : (
                  invites.map(inv => (
                    <div key={inv.id} className="card" style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>{inv.email}</strong>
                          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-light)' }}>
                            Invited by {inv.invited_by_name} · Expires {new Date(inv.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          className="btn btn-small btn-secondary"
                          onClick={() => cancelInvite(inv.id)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {showInviteDialog && (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            }}
            onClick={e => { if (e.target === e.currentTarget) closeInviteDialog() }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Invite Admin"
              className="card"
              style={{ width: '100%', maxWidth: 480, padding: 24 }}
            >
              <h2 style={{ marginTop: 0 }}>Invite Admin</h2>

              {inviteSuccess ? (
                <p role="status" style={{ color: 'var(--success)' }}>{inviteSuccess}</p>
              ) : (
                <form onSubmit={sendInvite}>
                  <div className="form-group">
                    <label htmlFor="invite-email">Email Address</label>
                    <input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="admin@example.com"
                      required
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={closeInviteDialog}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                      {submitting ? 'Sending…' : 'Send Invite'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  )
}
