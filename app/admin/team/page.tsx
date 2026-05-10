'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
import Tabs from '@/components/Tabs'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { useToast } from '@/lib/toast'

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
  const showToast = useToast()
  const [admins, setAdmins] = useState<Admin[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [activeTab, setActiveTab] = useState<'admins' | 'invites'>('admins')
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState('')
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
      showToast('Failed to load team data', 'error')
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
      showToast(err instanceof Error ? err.message : 'Failed to send invite', 'error')
      closeInviteDialog()
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelInvite(id: number) {
    try {
      await apiRequest(`/api/admin/invites/${id}`, { method: 'DELETE' })
      showToast('Invite cancelled', 'success')
      setInvites(prev => prev.filter(i => i.id !== id))
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to cancel invite', 'error')
    }
  }

  async function revokeAdmin(id: number, name: string) {
    if (!confirm(`Revoke admin access for ${name}?`)) return
    try {
      await apiRequest(`/api/admin/admins/${id}`, { method: 'DELETE' })
      showToast('Admin access revoked', 'success')
      setAdmins(prev => prev.filter(a => a.id !== id))
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to revoke admin', 'error')
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1>Team Management</h1>
          <Button onClick={openInviteDialog}>Invite Admin</Button>
        </div>

        <Tabs
          tabs={[
            { key: 'admins', label: 'Current Admins' },
            { key: 'invites', label: 'Pending Invites' },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {loadingData ? (
          <div className="text-center py-10 text-text-light">Loading…</div>
        ) : (
          <>
            {activeTab === 'admins' && (
              <div id="adminList">
                {admins.length === 0 ? (
                  <p className="text-text-light">No admins found.</p>
                ) : (
                  /* [test hook] card class used as test selector */
                  admins.map(a => (
                    <div key={a.id} className="card bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word" style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>{a.name}</strong>
                          <p className="text-text-light text-sm" style={{ margin: 0 }}>{a.email}</p>
                        </div>
                        {a.id !== user.id && (
                          <Button variant="danger" size="sm" onClick={() => revokeAdmin(a.id, a.name)}>
                            Revoke Access
                          </Button>
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
                  <p className="text-text-light">No pending invites.</p>
                ) : (
                  /* [test hook] card class used as test selector */
                  invites.map(inv => (
                    <div key={inv.id} className="card bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word" style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong>{inv.email}</strong>
                          <p className="text-text-light text-sm" style={{ margin: 0 }}>
                            Invited by {inv.invited_by_name} · Expires {new Date(inv.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => cancelInvite(inv.id)}>
                          Cancel
                        </Button>
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
            className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
            onClick={e => { if (e.target === e.currentTarget) closeInviteDialog() }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Invite Admin"
              className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
                <h2 style={{ marginTop: 0 }}>Invite Admin</h2>
              </div>
              <div className="p-6">
                {inviteSuccess ? (
                  <p role="status" style={{ color: 'var(--success)' }}>{inviteSuccess}</p>
                ) : (
                  <form onSubmit={sendInvite}>
                    <div className="mb-5">
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
                    <div className="px-0 py-4 border-t border-brand-border flex gap-3 justify-end">
                      <Button type="button" variant="secondary" onClick={closeInviteDialog}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={submitting}>
                        {submitting ? 'Sending…' : 'Send Invite'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
