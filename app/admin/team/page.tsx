'use client'

import { useRef, useState } from 'react'
import { useRequireAdmin } from '@/lib/hooks/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/Button'
import Tabs from '@/components/Tabs'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import { InviteStatus } from '@/generated/prisma/enums'

export default function AdminTeamPage() {
  const { user, loading } = useRequireAdmin()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'admins' | 'invites'>('admins')
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)

  const { data: admins = [], isLoading: loadingAdmins } = useQuery({
    ...orpc.admin.admins.list.queryOptions(),
    enabled: !!user?.isAdmin,
  })

  const { data: allInvites = [], isLoading: loadingInvites } = useQuery({
    ...orpc.admin.admins.listInvites.queryOptions(),
    enabled: !!user?.isAdmin,
  })

  const invites = allInvites.filter((i) => i.status === InviteStatus.pending)
  const loadingData = loadingAdmins || loadingInvites

  const inviteMutation = useMutation({
    ...orpc.admin.admins.invite.mutationOptions(),
    onSuccess: () => {
      setInviteSuccess(`Invite sent to ${inviteEmail}`)
      setInviteEmail('')
      void queryClient.invalidateQueries({ queryKey: orpc.admin.admins.listInvites.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to send invite', 'error')
      closeInviteDialog()
    },
  })

  const revokeInviteMutation = useMutation({
    ...orpc.admin.admins.revokeInvite.mutationOptions(),
    onSuccess: () => {
      showToast('Invite cancelled', 'success')
      void queryClient.invalidateQueries({ queryKey: orpc.admin.admins.listInvites.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to cancel invite', 'error')
    },
  })

  const revokeAdminMutation = useMutation({
    ...orpc.admin.admins.revoke.mutationOptions(),
    onSuccess: () => {
      showToast('Admin access revoked', 'success')
      void queryClient.invalidateQueries({ queryKey: orpc.admin.admins.list.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to revoke admin', 'error')
    },
  })

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

  function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    inviteMutation.mutate({ email: inviteEmail.trim() })
  }

  function cancelInvite(id: number) {
    revokeInviteMutation.mutate({ id })
  }

  function revokeAdmin(id: number, name: string) {
    if (!confirm(`Revoke admin access for ${name}?`)) return
    revokeAdminMutation.mutate({ id })
  }

  if (loading || !user) return null

  return (
    <>
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <div className="flex justify-between items-center mb-6">
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
                  admins.map((a) => (
                    <div
                      key={a.id}
                      className="card bg-surface rounded-xl shadow p-6 mb-3 overflow-hidden wrap-break-word"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <strong>{a.name}</strong>
                          <p className="text-text-light text-sm m-0">{a.email}</p>
                        </div>
                        {a.id !== user.id && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => revokeAdmin(a.id, a.name)}
                          >
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
                  invites.map((inv) => (
                    <div
                      key={inv.id}
                      className="card bg-surface rounded-xl shadow p-6 mb-3 overflow-hidden wrap-break-word"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <strong>{inv.email}</strong>
                          <p className="text-text-light text-sm m-0">
                            Invited by {inv.invitedByName} · Expires{' '}
                            {new Date(inv.expiresAt).toLocaleDateString()}
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
            onClick={(e) => {
              if (e.target === e.currentTarget) closeInviteDialog()
            }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Invite Admin"
              className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
                <h2 className="mt-0">Invite Admin</h2>
              </div>
              <div className="p-6">
                {inviteSuccess ? (
                  <p role="status" className="text-success">
                    {inviteSuccess}
                  </p>
                ) : (
                  <form onSubmit={sendInvite}>
                    <div className="mb-5">
                      <label htmlFor="invite-email">Email Address</label>
                      <input
                        id="invite-email"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="admin@example.com"
                        required
                        autoFocus
                      />
                    </div>
                    <div className="px-0 py-4 border-t border-brand-border flex gap-3 justify-end">
                      <Button type="button" variant="secondary" onClick={closeInviteDialog}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={inviteMutation.isPending}>
                        {inviteMutation.isPending ? 'Sending…' : 'Send Invite'}
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
