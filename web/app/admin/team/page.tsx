'use client'

import { useEffect, useState } from 'react'
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
  const [inviteEmail, setInviteEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

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

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setAlert(null)
    try {
      await apiRequest('/api/admin/admins/invite', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      setAlert({ text: `Invite sent to ${inviteEmail}`, type: 'success' })
      setInviteEmail('')
      await loadData()
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed to send invite', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function revokeInvite(id: number) {
    try {
      await apiRequest(`/api/admin/invites/${id}`, { method: 'DELETE' })
      setAlert({ text: 'Invite revoked', type: 'success' })
      setInvites(prev => prev.filter(i => i.id !== id))
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed to revoke invite', type: 'error' })
    }
  }

  async function revokeAdmin(id: number, name: string) {
    if (!confirm(`Revoke admin access for ${name}?`)) return
    try {
      await apiRequest(`/api/admin/admins/${id}`, { method: 'DELETE' })
      setAlert({ text: `Admin access revoked for ${name}`, type: 'success' })
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
        <h1>Team Management</h1>

        {alert && (
          <div role="alert" className={`message ${alert.type}`} style={{ marginBottom: 16 }}>
            {alert.text}
          </div>
        )}

        <div className="card" style={{ marginBottom: 24 }}>
          <h2>Invite New Admin</h2>
          <form onSubmit={sendInvite} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label htmlFor="invite-email">Email address</label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="admin@example.com"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send Invite'}
            </button>
          </form>
        </div>

        {loadingData ? (
          <div className="loading">Loading…</div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 24 }}>
              <h2>Current Admins</h2>
              {admins.length === 0 ? (
                <p style={{ color: 'var(--text-light)' }}>No admins found.</p>
              ) : (
                admins.map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
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
                ))
              )}
            </div>

            {invites.length > 0 && (
              <div className="card">
                <h2>Pending Invites</h2>
                {invites.map(inv => (
                  <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <strong>{inv.email}</strong>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-light)' }}>
                        Invited by {inv.invited_by_name} · Expires {new Date(inv.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => revokeInvite(inv.id)}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}
