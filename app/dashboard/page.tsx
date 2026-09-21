'use client'

import React, { useEffect, useState } from 'react'
import { useRequireAuth } from '@/lib/hooks/auth'
import { useOneTimeNotice } from '@/lib/hooks/useOneTimeNotice'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import Button from '@/components/Button'
import CommentThread from '@/components/CommentThread'
import { orpc } from '@/lib/orpc'
import { ProjectList, statusBadgeClasses } from '@/components/ProjectCard'
import {
  INTEREST_STATUS_LABELS,
  QUICK_TASK_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from '@/lib/status-labels'
import { Badge } from '@/components/Badge'
import { daysQuiet } from '@/lib/staleness'
import Linkify from '@/components/Linkify'
import SubmitForReviewButton from '@/components/SubmitForReviewButton'
import Tabs from '@/components/Tabs'
import Modal from '@/components/ui/Modal'
import { ApprovalStatus, InterestStatus, QuickTaskStatus } from '@/generated/prisma/enums'
import { ApprovalStepper } from '@/components/ApprovalStepper'
import { friendlyDate } from '@/lib/format-date'
import Skeleton from '@/components/Skeleton'

function QuietNote({ updatedAt }: { updatedAt: string | Date | null }) {
  const days = daysQuiet(updatedAt)
  if (days === null) return null
  return <div className="text-sm text-warning-text mt-1">No update for {days} days</div>
}

const NOTIFICATIONS_PAGE_SIZE = 20
type NotificationFilter = 'all' | 'unread' | 'read'

// Current work first, discovery last.
const TAB_ORDER = ['projects', 'applications', 'notifications', 'suggested'] as const
type TabKey = (typeof TAB_ORDER)[number]

const TAB_LABELS: Record<TabKey, string> = {
  projects: 'My projects',
  applications: 'Applications',
  notifications: 'Notifications',
  suggested: 'Suggested for You',
}

/** The tab a `#tab-<key>` hash asks for, or null when it names none. */
function tabFromHash(hash: string): TabKey | null {
  const key = hash.startsWith('#tab-') ? hash.slice('#tab-'.length) : ''
  return TAB_ORDER.find((t) => t === key) ?? null
}

// [test hook] card, stat-number classes used as test selectors
function StatTile({
  count,
  href,
  children,
}: {
  count: number
  href: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className="card block bg-surface rounded-xl shadow p-6 text-center no-underline hover:shadow-md transition-shadow"
    >
      <div className="stat-number text-4xl font-bold text-primary mb-1">{count}</div>
      <div className="text-text-light text-sm">{children}</div>
    </a>
  )
}

function TabCount({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="bg-accent text-secondary-dark text-xs px-2 py-0.5 rounded-full ml-1 dark:bg-gray-700 dark:text-gray-300">
      {count}
    </span>
  )
}

export default function DashboardPage() {
  const { user, loading } = useRequireAuth()
  const queryClient = useQueryClient()
  // The tab the hash names; without one the page picks a default from what the volunteer has.
  const [requestedTab, setRequestedTab] = useState<TabKey | null>(() =>
    typeof window === 'undefined' ? null : tabFromHash(window.location.hash),
  )
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set())
  const [emailBannerDismissed, setEmailBannerDismissed] = useState(false)
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>('all')
  const [notificationPage, setNotificationPage] = useState(1)
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  // Set when a page that needs approval sent the volunteer here (PENDING_NOTICE_URL).
  const [pendingNotice] = useOneTimeNotice('pending')

  function setNotificationFilterAndResetPage(filter: NotificationFilter) {
    setNotificationFilter(filter)
    setNotificationPage(1)
  }

  useEffect(() => {
    function syncFromHash() {
      setRequestedTab(tabFromHash(window.location.hash))
    }
    // Re-read the hash on mount too: Next.js client-side navigation does not
    // reliably reflect the new hash in window.location.hash by the time this
    // page's useState initializer runs, so the initial value can be stale.
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  const { data, isPending: loadingData } = useQuery({
    ...orpc.dashboard.get.queryOptions(),
    enabled: !!user,
  })

  const unreadCount = data?.unreadNotificationCount ?? 0
  const ownedProjects = data?.ownedProjects ?? []
  const ownedIds = new Set(ownedProjects.map((p) => p.id))
  const interests = data?.myInterests ?? []
  const myProjects = [
    ...ownedProjects,
    ...interests.filter((i) => i.interestStatus === InterestStatus.accepted && !ownedIds.has(i.id)),
  ]
  const proposedProjects = data?.proposedProjects ?? []
  const applications = interests.filter((i) => i.interestStatus !== InterestStatus.accepted)
  const suggestedProjects = data?.suggestedProjects ?? []
  const waitingCount = applications.filter(
    (i) => i.interestStatus === InterestStatus.pending,
  ).length
  // Until approved there are no projects to join or propose, so only notifications show.
  const isMember = Boolean(
    user && (user.approvalStatus === ApprovalStatus.approved || user.isAdmin),
  )
  const visibleTabs: readonly TabKey[] = isMember ? TAB_ORDER : ['notifications']
  const defaultTab: TabKey = !isMember
    ? 'notifications'
    : myProjects.length + proposedProjects.length > 0
      ? 'projects'
      : applications.length > 0
        ? 'applications'
        : unreadCount > 0
          ? 'notifications'
          : 'suggested'
  const activeTab = requestedTab && visibleTabs.includes(requestedTab) ? requestedTab : defaultTab

  useEffect(() => {
    document.title = `Catalyse | ${TAB_LABELS[activeTab]}`
    return () => {
      document.title = 'Catalyse | Dashboard'
    }
  }, [activeTab])

  const { data: quickTasksRaw = [] } = useQuery({
    ...orpc.my.quickTasks.queryOptions(),
    enabled: !!user,
  })
  const quickTasks = quickTasksRaw.filter(
    (t) => t.status === QuickTaskStatus.in_progress || t.status === QuickTaskStatus.under_review,
  )
  const { data: projectTasks = [] } = useQuery({
    ...orpc.my.projectTasks.queryOptions(),
    enabled: !!user,
  })
  const tasksInProgress =
    projectTasks.length + quickTasks.filter((t) => t.status === QuickTaskStatus.in_progress).length

  const { data: notificationsData } = useQuery({
    ...orpc.notifications.list.queryOptions({
      input: {
        filter: notificationFilter,
        limit: NOTIFICATIONS_PAGE_SIZE,
        offset: (notificationPage - 1) * NOTIFICATIONS_PAGE_SIZE,
      },
    }),
    enabled: !!user && activeTab === 'notifications',
    placeholderData: keepPreviousData,
  })
  const notifications = notificationsData?.notifications ?? []
  const notificationsTotal = notificationsData?.total ?? 0
  const notificationsTotalPages = Math.max(
    1,
    Math.ceil(notificationsTotal / NOTIFICATIONS_PAGE_SIZE),
  )

  const readAllMutation = useMutation({
    ...orpc.notifications.readAll.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.notifications.list.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.dashboard.get.key() })
    },
  })

  const markReadMutation = useMutation({
    ...orpc.notifications.markRead.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.notifications.list.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.dashboard.get.key() })
    },
  })

  const markUnreadMutation = useMutation({
    ...orpc.notifications.markUnread.mutationOptions(),
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
    setRequestedTab(tab)
    window.location.hash = `tab-${tab}`
  }

  if (loading || !user) return null

  if (loadingData) {
    return (
      <>
        <main className="container py-5 pb-15">
          <Skeleton label="Loading dashboard…" />
        </main>
      </>
    )
  }

  const welcome = welcomeDismissed ? null : (data?.approvalWelcome ?? null)

  function dismissWelcome(notificationId: number) {
    setWelcomeDismissed(true)
    // Clear the cached welcome now, so coming back to the dashboard before the read has
    // been confirmed does not show it again.
    queryClient.setQueryData(orpc.dashboard.get.queryOptions().queryKey, (old) =>
      old ? { ...old, approvalWelcome: null } : old,
    )
    markReadMutation.mutate({ id: notificationId })
  }

  const showEmailBanner = !user.emailDigest && !emailBannerDismissed

  const tabs: { key: TabKey; label: React.ReactNode; 'data-tab'?: string }[] = [
    {
      key: 'projects',
      label: (
        <>
          {TAB_LABELS.projects}
          <TabCount count={myProjects.length + proposedProjects.length} />
        </>
      ),
    },
    {
      key: 'applications',
      label: (
        <>
          {TAB_LABELS.applications}
          <TabCount count={applications.length} />
        </>
      ),
    },
    {
      key: 'notifications',
      'data-tab': 'notifications',
      label: (
        <>
          {TAB_LABELS.notifications}
          {unreadCount > 0 && (
            <span className="notification-badge bg-primary text-gray-900 text-xs px-2 py-0.5 rounded-full ml-1">
              {unreadCount}
            </span>
          )}
        </>
      ),
    },
    {
      key: 'suggested',
      label: (
        <>
          {TAB_LABELS.suggested}
          <TabCount count={suggestedProjects.length} />
        </>
      ),
    },
  ]

  return (
    <>
      {welcome && (
        <Modal
          id="approval-welcome"
          title="You're approved. Welcome to Catalyse!"
          isOpen
          onClose={() => dismissWelcome(welcome.notificationId)}
        >
          <p>
            {welcome.emailConfirmed
              ? 'Your application has been approved. Browse projects to find something you can help with, or pick up a Quick Task to get started.'
              : 'Your application has been approved. One last step: confirm your email address, then you can browse projects and pick a first task.'}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => dismissWelcome(welcome.notificationId)}>
              Not now
            </Button>
            <Button
              href={welcome.emailConfirmed ? '/projects' : '/verify-email'}
              onClick={() => dismissWelcome(welcome.notificationId)}
            >
              {welcome.emailConfirmed ? 'Browse projects' : 'Confirm your email'}
            </Button>
          </div>
        </Modal>
      )}
      <main className="container py-5 pb-15">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 role="heading">Welcome back, {user.name}!</h1>
          {isMember && <Button href="/suggest">Propose a project</Button>}
        </div>

        {pendingNotice && (
          <div
            role="status"
            className="p-4 rounded-lg mb-5 bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-600"
          >
            Your application is being reviewed. You&apos;ll be able to browse projects once
            it&apos;s approved.
          </div>
        )}

        {/* Pending approval banner */}
        {(user.approvalStatus === ApprovalStatus.pending ||
          user.approvalStatus === ApprovalStatus.under_review) && (
          <div className="flex flex-col gap-3 p-4 rounded-lg mb-5 bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800">
            <span>
              Your account is pending approval. You&apos;ll be able to browse and join projects once
              an admin reviews your application.
            </span>
            <ApprovalStepper status={user.approvalStatus} />
          </div>
        )}

        {/* Needs info banner */}
        {user.approvalStatus === ApprovalStatus.needs_info && (
          <div className="flex items-center justify-between gap-3 p-4 rounded-lg mb-5 bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
            <span>We need a bit more information before we can review your application.</span>
            <Button href="/settings" size="sm">
              Update Application
            </Button>
          </div>
        )}

        {/* Email notification preference banner */}
        {showEmailBanner && (
          <div className="flex items-center justify-between gap-3 p-4 rounded-lg mb-5 bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-600">
            <span>
              Stay in the loop: set your email notification preference in your{' '}
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

        {/* Quick Tasks and claimed project tasks */}
        {quickTasks.length + projectTasks.length > 0 && (
          <section id="your-tasks" aria-label="Your tasks" className="mb-8">
            <h2>Your tasks</h2>
            {projectTasks.map((task) => (
              <div
                key={`project-${task.id}`}
                role="article"
                className="bg-surface rounded-xl shadow p-6 mb-3 overflow-hidden wrap-break-word"
              >
                <div className="flex justify-between items-center gap-3">
                  <div>
                    <Link href={`/projects/${task.projectId}/tasks/${task.id}`}>
                      <strong>{task.title}</strong>
                    </Link>
                    <span className="ml-2 text-sm text-text-light">
                      in <Link href={`/projects/${task.projectId}`}>{task.projectTitle}</Link>
                    </span>
                    <QuietNote updatedAt={task.updatedAt} />
                  </div>
                  <span role="status" className={statusBadgeClasses(task.status)}>
                    {TASK_STATUS_LABELS[task.status] ?? task.status}
                  </span>
                </div>
              </div>
            ))}
            {quickTasks.map((task) => (
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
                    <QuietNote updatedAt={task.updatedAt} />
                  </div>
                  <span role="status" className={statusBadgeClasses(task.status)}>
                    {QUICK_TASK_STATUS_LABELS[task.status] ?? task.status}
                  </span>
                </div>
                {expandedTasks.has(task.id) && (
                  <div className="mt-3">
                    <p className="text-text-light text-sm mb-3 whitespace-pre-wrap">
                      <Linkify text={task.description} />
                    </p>
                    {task.status === QuickTaskStatus.in_progress && (
                      <SubmitForReviewButton taskId={task.id} size="sm" />
                    )}
                    <div className="mt-3">
                      <strong className="text-sm">Comments</strong>
                      <CommentThread workItemId={task.id} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Quick stats */}
        {isMember && (
          <div className="grid grid-cols-4 gap-5 mb-8 max-[900px]:grid-cols-2 max-[600px]:grid-cols-1">
            <StatTile count={myProjects.length + proposedProjects.length} href="#tab-projects">
              My projects
            </StatTile>
            <StatTile count={waitingCount} href="#tab-applications">
              Applications waiting
            </StatTile>
            <StatTile count={unreadCount} href="#tab-notifications">
              Unread notifications
            </StatTile>
            <StatTile count={tasksInProgress} href="#your-tasks">
              Tasks in progress
            </StatTile>
          </div>
        )}

        {/* Tabs */}
        {/* [test hook] active class added to active tab; notification-badge class used as test selector */}
        <Tabs
          tabs={tabs.filter((t) => visibleTabs.includes(t.key))}
          activeTab={activeTab}
          onChange={handleTabClick}
        />

        {/* Tab content */}
        {activeTab === 'projects' && (
          <div>
            {myProjects.length === 0 ? (
              <p className="text-text-light">
                You don&apos;t own or help on any projects yet.{' '}
                <Link href="/projects">Browse projects that match your skills →</Link>
              </p>
            ) : (
              <ProjectList projects={myProjects} />
            )}
            {proposedProjects.length > 0 && (
              <section aria-labelledby="proposed-projects" className="mt-8">
                <h2 id="proposed-projects" className="text-lg">
                  Projects you proposed
                </h2>
                <ProjectList projects={proposedProjects} />
              </section>
            )}
          </div>
        )}

        {activeTab === 'applications' && (
          <div>
            {applications.length === 0 ? (
              <p className="text-text-light">
                You haven&apos;t applied to any projects yet.{' '}
                <Link href="/projects">Browse projects →</Link>
              </p>
            ) : (
              <ProjectList
                projects={applications}
                userSkillIds={new Set(user.skills?.map((s) => s.id) ?? [])}
                badgeFor={(a) => (
                  <Badge variant="info">
                    {INTEREST_STATUS_LABELS[a.interestStatus] ?? a.interestStatus}
                  </Badge>
                )}
              />
            )}
          </div>
        )}

        {activeTab === 'suggested' && (
          <div>
            {!user.skills?.length ? (
              <p className="text-text-light">
                Add skills to your profile to get suggestions.{' '}
                <Link href="/settings">Add skills →</Link>
              </p>
            ) : suggestedProjects.length === 0 ? (
              <p className="text-text-light">
                No suggested projects matching your skills right now.{' '}
                <Link href="/quick-tasks">Browse Quick Tasks →</Link>
              </p>
            ) : (
              <>
                <p className="mb-4 text-text-light">
                  Based on your skills, these projects might be a good fit:
                </p>
                <ProjectList
                  projects={suggestedProjects}
                  userSkillIds={new Set(user.skills?.map((s) => s.id) ?? [])}
                />
              </>
            )}
          </div>
        )}

        {activeTab === 'notifications' && (
          <div>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="flex gap-2">
                <Button
                  variant={notificationFilter === 'unread' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() =>
                    setNotificationFilterAndResetPage(
                      notificationFilter === 'unread' ? 'all' : 'unread',
                    )
                  }
                >
                  Unread
                </Button>
                <Button
                  variant={notificationFilter === 'read' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() =>
                    setNotificationFilterAndResetPage(
                      notificationFilter === 'read' ? 'all' : 'read',
                    )
                  }
                >
                  Read
                </Button>
              </div>
              {unreadCount > 0 && (
                <Button size="sm" onClick={() => readAllMutation.mutate({})}>
                  Mark all as read
                </Button>
              )}
            </div>
            {!notifications.length ? (
              <p className="text-text-light">
                No notifications
                {notificationFilter !== 'all' ? ` marked ${notificationFilter}` : ''}.
              </p>
            ) : (
              <>
                {notifications.map((n, i) => (
                  <React.Fragment key={n.id}>
                    {notificationFilter === 'all' && i === 0 && !n.readAt && (
                      <h3 className="text-sm text-text-light mb-2 mt-0">Unread</h3>
                    )}
                    {notificationFilter === 'all' &&
                      n.readAt &&
                      i > 0 &&
                      !notifications[i - 1].readAt && (
                        <h3 className="text-sm text-text-light mb-2 mt-4">Earlier</h3>
                      )}
                    <div
                      className={`bg-surface rounded-xl shadow p-5 mb-3 wrap-break-word ${!n.readAt ? 'border-l-4 border-primary' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <strong className={!n.readAt ? 'text-brand-text' : 'text-text-light'}>
                          {n.title}
                        </strong>
                        <span className="text-xs text-text-light whitespace-nowrap">
                          {n.createdAt ? friendlyDate(n.createdAt) : ''}
                        </span>
                      </div>
                      <p className="text-sm mt-1 mb-0">{n.body}</p>
                      <div className="flex items-center gap-3 mt-2">
                        {n.link && (
                          <Link
                            href={n.link}
                            className="text-sm underline"
                            onClick={() => {
                              if (!n.readAt) markReadMutation.mutate({ id: n.id })
                            }}
                          >
                            View
                          </Link>
                        )}
                        {n.readAt ? (
                          <button
                            type="button"
                            className="text-sm underline text-text-light cursor-pointer bg-transparent border-0 p-0"
                            onClick={() => markUnreadMutation.mutate({ id: n.id })}
                          >
                            Mark as unread
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-sm underline text-text-light cursor-pointer bg-transparent border-0 p-0"
                            onClick={() => markReadMutation.mutate({ id: n.id })}
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                ))}
                {notificationsTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 mt-6">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={notificationPage <= 1}
                      onClick={() => setNotificationPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-text-light">
                      Page {notificationPage} of {notificationsTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={notificationPage >= notificationsTotalPages}
                      onClick={() => setNotificationPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </>
  )
}
