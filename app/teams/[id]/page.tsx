'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRequireAuth } from '@/lib/hooks/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/Button'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const teamId = parseInt(idParam, 10)
  const { user, loading } = useRequireAuth()
  const showToast = useToast()
  const queryClient = useQueryClient()

  const { data: team, isLoading } = useQuery({
    ...orpc.teams.getById.queryOptions({ input: { id: teamId } }),
    enabled: !!user,
  })

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.teams.getById.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.teams.list.key() }),
    ])

  const applyMutation = useMutation({
    ...orpc.teams.apply.mutationOptions(),
    onSuccess: () => {
      showToast('Application submitted — a team leader will review it', 'success')
      void invalidate()
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to apply', 'error')
    },
  })

  const leaveMutation = useMutation({
    ...orpc.teams.leave.mutationOptions(),
    onSuccess: () => {
      showToast('Left team', 'success')
      void invalidate()
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to leave team', 'error')
    },
  })

  if (loading || !user) return null

  if (isLoading) {
    return (
      <main className="container py-5 pb-15">
        <div className="text-center py-10 text-text-light">Loading…</div>
      </main>
    )
  }

  if (!team) {
    return (
      <main className="container py-5 pb-15">
        <p className="text-text-light">Team not found.</p>
      </main>
    )
  }

  const isMember = team.viewerRole !== null

  return (
    <main className="container py-5 pb-15 max-w-2xl">
      <Link href="/teams" className="text-sm text-secondary-dark no-underline hover:text-primary">
        ← All Teams
      </Link>

      <div className="flex items-start justify-between gap-4 mt-3 mb-2">
        <h1 className="m-0">
          {team.name}
          {team.viewerRole === 'leader' && (
            <span className="text-xs px-2 py-0.5 ml-2 rounded-full font-medium bg-primary/10 text-primary align-middle">
              Leader
            </span>
          )}
        </h1>
        {user.isAdmin || team.viewerRole === 'leader' ? (
          <Link href={`/admin/teams/${team.id}`}>
            <Button size="sm" variant="secondary">
              Manage Members
            </Button>
          </Link>
        ) : isMember ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={leaveMutation.isPending}
            onClick={() => leaveMutation.mutate({ id: team.id })}
          >
            Leave
          </Button>
        ) : team.viewerRequestStatus === 'pending' ? (
          <Button size="sm" variant="secondary" disabled>
            Application Pending
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={applyMutation.isPending}
            onClick={() => applyMutation.mutate({ id: team.id })}
          >
            Apply to Join
          </Button>
        )}
      </div>

      {team.description && <p className="text-text-light mb-4">{team.description}</p>}

      <p className="text-sm text-text-light mb-4">
        {team.memberCount} member{team.memberCount === 1 ? '' : 's'}
        {team.leaders.length > 0 && ` · Led by ${team.leaders.map((l) => l.name).join(', ')}`}
      </p>

      {(team.lumaUrl || team.docUrl) && (
        <div className="flex gap-4 text-sm bg-surface rounded-xl shadow px-5 py-4">
          {team.lumaUrl && (
            <a
              href={team.lumaUrl}
              target="_blank"
              rel="noreferrer"
              className="text-secondary-dark no-underline hover:text-primary"
            >
              Meeting calendar
            </a>
          )}
          {team.docUrl && (
            <a
              href={team.docUrl}
              target="_blank"
              rel="noreferrer"
              className="text-secondary-dark no-underline hover:text-primary"
            >
              Team doc
            </a>
          )}
        </div>
      )}
    </main>
  )
}
