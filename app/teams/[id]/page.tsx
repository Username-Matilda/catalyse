'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRequireAuth } from '@/lib/hooks/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/Button'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import { teamApplicationSentMessage } from '@/lib/action-messages'
import { useCooldown } from '@/lib/hooks/useCooldown'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import NotFoundCard from '@/components/NotFoundCard'

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
      showToast(teamApplicationSentMessage(team?.name ?? 'this team'), 'success')
      void invalidate()
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to apply', 'error')
    },
  })

  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const { isCooling, start: startCooldown } = useCooldown()

  const leaveMutation = useMutation({
    ...orpc.teams.leave.mutationOptions(),
    onSuccess: (_data, variables) => {
      showToast('Left team', 'success')
      startCooldown(variables.id)
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
      <NotFoundCard
        title="Team not found"
        message="This team doesn't exist, or it has been removed."
      />
    )
  }

  const isMember = team.viewerRole !== null

  return (
    <main className="container py-5 pb-15 max-w-2xl">
      <Link href="/teams" className="text-sm text-brand-text no-underline hover:text-primary">
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
            variant="warning"
            disabled={leaveMutation.isPending}
            onClick={() => setConfirmingLeave(true)}
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
            variant={isCooling(team.id) ? 'secondary' : 'primary'}
            disabled={applyMutation.isPending || isCooling(team.id)}
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
              className="text-brand-text no-underline hover:text-primary"
            >
              Meeting calendar
            </a>
          )}
          {team.docUrl && (
            <a
              href={team.docUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand-text no-underline hover:text-primary"
            >
              Team doc
            </a>
          )}
        </div>
      )}

      {confirmingLeave && (
        <ConfirmDialog
          id="confirm-leave-team"
          isOpen
          title={`Leave ${team.name}?`}
          body="You'll need to apply again and be approved to rejoin."
          confirmLabel="Leave"
          busyLabel="Leaving…"
          danger
          busy={leaveMutation.isPending}
          onConfirm={() => {
            leaveMutation.mutate({ id: team.id })
            setConfirmingLeave(false)
          }}
          onClose={() => setConfirmingLeave(false)}
        />
      )}
    </main>
  )
}
