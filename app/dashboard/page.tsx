'use client'

import React, { useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/hooks/auth'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/Button'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import { ProjectList, statusBadgeClasses } from '@/components/ProjectCard'
import Tabs from '@/components/Tabs'
import type { InferRouterOutputs } from '@orpc/server'
import type { AppRouter } from '@/server/router'

type Interest = InferRouterOutputs<AppRouter>['dashboard']['get']['myInterests'][number]

type TabKey = 'owned' | 'interests' | 'proposed' | 'suggested' | 'notifications'

const TAB_LABELS: Record<TabKey, string> = {
  owned: 'Owned Projects',
  interests: 'Interested Projects',
  proposed: 'Proposed Projects',
  suggested: 'Suggested for You',
  notifications: 'Notifications',
}

export default function DashboardPage() {
  const { user, loading } = useRequireAuth()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'owned'
    const hash = window.location.hash
    if (hash.startsWith('#tab-')) return (hash.slice('#tab-'.length) as TabKey) || 'owned'
    return 'owned'
  })
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set())
  const [emailBannerDismissed, setEmailBannerDismissed] = useState(false)

  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash
      const tab: TabKey = hash.startsWith('#tab-')
        ? (hash.slice('#tab-'.length) as TabKey) || 'owned'
        : 'owned'
      setActiveTab(tab)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    document.title = `Catalyse | ${TAB_LABELS[activeTab]}`
    return () => {
      document.title = 'Catalyse | Dashboard'
    }
  }, [activeTab])

  const { data, isPending: loadingData } = useQuery({
    ...orpc.dashboard.get.queryOptions(),
    enabled: !!user,
  })

  const { data: starterTasksRaw = [] } = useQuery({
    ...orpc.my.starterTasks.queryOptions(),
    enabled: !!user,
  })
  const starterTasks = starterTasksRaw.filter(
    (t) => t.status === 'assigned' || t.status === 'submitted',
  )

  const { data: notifications = [] } = useQuery({
    ...orpc.notifications.list.queryOptions({ input: {} }),
    enabled: !!user && activeTab === 'notifications',
  })

  const submitTaskMutation = useMutation({
    ...orpc.starterTasks.submit.mutationOptions(),
    onSuccess: () => {
      showToast('Task submitted for review!', 'success')
      void queryClient.invalidateQueries({ queryKey: orpc.my.starterTasks.key() })
    },
    onError: (err: unknown) => {
      showToast(err instanceof Error ? err.message : 'Failed to submit task', 'error')
    },
  })

  const readAllMutation = useMutation({
    ...orpc.notifications.readAll.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.notifications.list.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.dashboard.get.key() })
    },
  })

  function toggleTask(id: number) {
    setExpandedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleTabClick(tab: TabKey) {
    setActiveTab(tab)
    if (tab === 'owned') {
      history.replaceState(null, '', '/dashboard')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    } else {
      window.location.hash = `tab-${tab}`
    }
  }

  if (loading || !user) return null

  if (loadingData) {
    return (
      <>
        <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
          <div className="text-center py-10 text-text-light">Loading dashboard…</div>
        </main>
      </>
    )
  }

  const unreadCount = data?.unreadNotificationCount ?? 0
  const showEmailBanner = !user.emailDigest && !emailBannerDismissed

  const tabs: { key: TabKey; label: React.ReactNode; 'data-tab'?: string }[] = [
    { key: 'owned', label: TAB_LABELS.owned },
    { key: 'interests', label: TAB_LABELS.interests },
    { key: 'proposed', label: TAB_LABELS.proposed },
    { key: 'suggested', label: TAB_LABELS.suggested },
    {
      key: 'notifications',
      'data-tab': 'notifications',
      label: (
        <>
          {TAB_LABELS.notifications}
          {unreadCount > 0 && (
            <span className="notification-badge bg-primary text-secondary-dark text-xs px-2 py-0.5 rounded-full ml-1">
              {unreadCount}
            </span>
          )}
        </>
      ),
    },
  ]

  return (
    <>
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <h1 role="heading">Welcome back, {user.name}!</h1>

        {/* Pending approval banner */}
        {user.approvalStatus === 'PENDING' && (
          <div className="flex items-center gap-3 p-4 rounded-lg mb-5 bg-[#FEF9C3] text-[#854D0E] border border-[#FDE047] dark:bg-[#422006] dark:text-[#FDE047] dark:border-[#854D0E]">
            <span>
              Your account is pending approval. You can browse the platform, but some actions are
              restricted until an admin reviews your application.
            </span>
          </div>
        )}

        {/* Email notification preference banner */}
        {showEmailBanner && (
          <div className="flex items-center justify-between gap-3 p-4 rounded-lg mb-5 bg-[#DBEAFE] text-[#1E40AF] border border-[#93C5FD] dark:bg-[#1E3A5F] dark:text-[#93C5FD] dark:border-[#2563EB]">
            <span>
              Stay in the loop — set your email notification preference in your{' '}
              <Link href="/profile" className="underline font-semibold">
                profile
              </Link>
              .
            </span>
            <Button
              variant="ghost"
              icon
              onClick={() => setEmailBannerDismissed(true)}
              aria-label="Dismiss"
            >
              ×
            </Button>
          </div>
        )}

        {/* Starter tasks */}
        {starterTasks.length > 0 && (
          <section aria-label="Starter Tasks" className="mb-8">
            <h2>Starter Tasks</h2>
            {starterTasks.map((task) => (
              <div
                key={task.id}
                role="article"
                className="bg-surface rounded-xl shadow p-6 mb-3 overflow-hidden wrap-break-word"
              >
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => toggleTask(task.id)}
                >
                  <div>
                    <strong>{task.title}</strong>
                    {task.skillName && (
                      <span className="ml-2 text-sm text-text-light">{task.skillName}</span>
                    )}
                  </div>
                  <span role="status" className={statusBadgeClasses(task.status)}>
                    {task.status}
                  </span>
                </div>
                {expandedTasks.has(task.id) && (
                  <div className="mt-3">
                    <p className="text-text-light text-sm mb-3">{task.description}</p>
                    {task.feedbackToVolunteer && (
                      <p className="text-sm mb-3">
                        <strong>Feedback:</strong> {task.feedbackToVolunteer}
                      </p>
                    )}
                    {task.status === 'assigned' && (
                      <Button
                        size="sm"
                        disabled={submitTaskMutation.isPending}
                        onClick={() => submitTaskMutation.mutate({ id: task.id })}
                      >
                        Mark as Complete
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-5 mb-8 max-[600px]:grid-cols-1">
          {/* [test hook] card, stat-number classes used as test selectors */}
          <div className="card bg-surface rounded-xl shadow p-6 text-center">
            <div className="stat-number text-4xl font-bold text-primary mb-1">
              {data?.ownedProjects.length ?? 0}
            </div>
            <div className="text-text-light text-sm">Owned Projects</div>
          </div>
          <div className="card bg-surface rounded-xl shadow p-6 text-center">
            <div className="stat-number text-4xl font-bold text-primary mb-1">
              {data?.myInterests.length ?? 0}
            </div>
            <div className="text-text-light text-sm">Active Interests</div>
          </div>
          <div className="card bg-surface rounded-xl shadow p-6 text-center">
            <div className="stat-number text-4xl font-bold text-primary mb-1">{unreadCount}</div>
            <div className="text-text-light text-sm">Unread Notifications</div>
          </div>
        </div>

        {/* Tabs */}
        {/* [test hook] active class added to active tab; notification-badge class used as test selector */}
        <Tabs tabs={tabs} activeTab={activeTab} onChange={handleTabClick} />

        {/* Tab content */}
        {activeTab === 'owned' && (
          <div>
            {!data?.ownedProjects.length ? (
              <p className="text-text-light">You don&apos;t own any projects yet.</p>
            ) : (
              <ProjectList projects={data.ownedProjects} />
            )}
          </div>
        )}

        {activeTab === 'interests' && (
          <div>
            {!data?.myInterests.length ? (
              <p className="text-text-light">
                You haven&apos;t expressed interest in any projects yet.
              </p>
            ) : (
              <ProjectList
                projects={data.myInterests as unknown as Interest[]}
                userSkillIds={new Set(user.skills?.map((s) => s.id) ?? [])}
              />
            )}
          </div>
        )}

        {activeTab === 'proposed' && (
          <div>
            {!data?.proposedProjects.length ? (
              <p className="text-text-light">You haven&apos;t proposed any projects yet.</p>
            ) : (
              <ProjectList projects={data.proposedProjects} />
            )}
          </div>
        )}

        {activeTab === 'suggested' && (
          <div>
            {!data?.suggestedProjects.length ? (
              <p className="text-text-light">
                No suggested projects matching your skills right now.
              </p>
            ) : (
              <>
                <p className="mb-4 text-text-light">
                  Based on your skills, these projects might be a good fit:
                </p>
                <ProjectList
                  projects={data.suggestedProjects}
                  userSkillIds={new Set(user.skills?.map((s) => s.id) ?? [])}
                />
              </>
            )}
          </div>
        )}

        {activeTab === 'notifications' && (
          <div>
            {unreadCount > 0 && (
              <Button className="mb-4" onClick={() => readAllMutation.mutate({})}>
                Mark all as read
              </Button>
            )}
            {!notifications.length ? (
              <p className="text-text-light">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`bg-surface rounded-xl shadow p-5 mb-3 wrap-break-word ${!n.readAt ? 'border-l-4 border-primary' : ''}`}
                >
                  <strong className={!n.readAt ? 'text-brand-text' : 'text-text-light'}>
                    {n.title}
                  </strong>
                  <p className="text-sm mt-1 mb-0">{n.body}</p>
                  {n.link && (
                    <Link href={n.link} className="text-sm underline mt-1 inline-block">
                      View
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </>
  )
}
