'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { type Project, ProjectList, statusBadgeClasses } from '@/components/ProjectCard'

interface Interest extends Project {
  interest_id: number
  interest_type: string
  interest_status: string
  interest_message: string | null
  interest_created_at: string
  interest_response_message: string | null
  interest_responded_at: string | null
}

interface Notification {
  id: number
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}

interface DashboardData {
  owned_projects: Project[]
  proposed_projects: Project[]
  my_interests: Interest[]
  suggested_projects: Project[]
  unread_notification_count: number
}

interface StarterTask {
  id: number
  title: string
  description: string
  skill_name: string | null
  estimated_hours: number | null
  status: string
  feedback_to_volunteer: string | null
}

type TabKey = 'owned' | 'interests' | 'proposed' | 'suggested' | 'notifications'



function DashboardPageInner() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabKey>((searchParams.get('tab') as TabKey) || 'owned')
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingData, setLoadingData] = useState(true)
  const [starterTasks, setStarterTasks] = useState<StarterTask[]>([])
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set())
  const [taskAlert, setTaskAlert] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [submittingTask, setSubmittingTask] = useState(false)
  const [emailBannerDismissed, setEmailBannerDismissed] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    apiRequest<DashboardData>('/api/dashboard')
      .then(d => {
        setData(d)
        setUnreadCount(d.unread_notification_count)
      })
      .catch(() => {})
      .finally(() => setLoadingData(false))
    apiRequest<StarterTask[]>('/api/my/starter-tasks')
      .then(t => setStarterTasks(t.filter(t => t.status === 'assigned' || t.status === 'submitted')))
      .catch(() => {})
  }, [user])

  function toggleTask(id: number) {
    setExpandedTasks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submitTask(taskId: number) {
    setSubmittingTask(true)
    try {
      await apiRequest(`/api/starter-tasks/${taskId}/submit`, { method: 'PUT' })
      setTaskAlert({ text: 'Task submitted for review!', type: 'success' })
      setStarterTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'submitted' } : t))
    } catch (err: unknown) {
      setTaskAlert({ text: err instanceof Error ? err.message : 'Failed to submit task', type: 'error' })
    } finally {
      setSubmittingTask(false)
    }
  }

  async function handleTabClick(tab: TabKey) {
    setActiveTab(tab)
    if (tab === 'notifications') {
      try {
        const notifs = await apiRequest<Notification[]>('/api/notifications')
        setNotifications(notifs)
      } catch {}
    }
  }

  async function markAllRead() {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'PUT' })
      setUnreadCount(0)
      setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })))
    } catch {}
  }

  if (loading || !user) return null

  if (loadingData) {
    return (
      <>
        <Header />
        <main className="max-w-350 mx-auto px-6 py-5 pb-15">
          <div className="text-center py-10 text-text-light">Loading dashboard…</div>
        </main>
      </>
    )
  }

  const showEmailBanner = !user.email_digest && !emailBannerDismissed

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'owned', label: 'My Projects' },
    { key: 'interests', label: 'My Interests' },
    { key: 'proposed', label: 'Proposed Projects' },
    { key: 'suggested', label: 'Suggested for You' },
  ]

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <h1 role="heading">Welcome back, {user.name}!</h1>

        {/* Email notification preference banner */}
        {showEmailBanner && (
          <div className="flex items-center justify-between gap-3 p-4 rounded-lg mb-5 bg-[#DBEAFE] text-[#1E40AF] border border-[#93C5FD] dark:bg-[#1E3A5F] dark:text-[#93C5FD] dark:border-[#2563EB]">
            <span>Stay in the loop — set your email notification preference in your <Link href="/profile" className="underline font-semibold">profile</Link>.</span>
            <Button variant="ghost" icon onClick={() => setEmailBannerDismissed(true)} aria-label="Dismiss">×</Button>
          </div>
        )}

        {/* Starter tasks */}
        {starterTasks.length > 0 && (
          <section aria-label="Starter Tasks" className="mb-8">
            <h2>Starter Tasks</h2>
            {taskAlert && (
              <div role="alert" className={`flex items-center gap-3 p-4 rounded-lg mb-4 ${
                taskAlert.type === 'success'
                  ? 'bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] dark:bg-[#064E3B] dark:text-[#6EE7B7] dark:border-[#059669]'
                  : 'bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]'
              }`}>
                {taskAlert.text}
              </div>
            )}
            {/* [test hook] card, card-header classes used as test selectors */}
            {starterTasks.map(task => (
              <div key={task.id} className="card bg-surface rounded-xl shadow p-6 mb-3 overflow-hidden wrap-break-word">
                <div
                  className="card-header flex justify-between items-center cursor-pointer"
                  onClick={() => toggleTask(task.id)}
                >
                  <div>
                    <strong>{task.title}</strong>
                    {task.skill_name && (
                      <span className="ml-2 text-sm text-text-light">{task.skill_name}</span>
                    )}
                  </div>
                  <span className={statusBadgeClasses(task.status)}>
                    {task.status}
                  </span>
                </div>
                {expandedTasks.has(task.id) && (
                  <div className="mt-3">
                    <p className="text-text-light text-sm mb-3">{task.description}</p>
                    {task.feedback_to_volunteer && (
                      <p className="text-sm mb-3"><strong>Feedback:</strong> {task.feedback_to_volunteer}</p>
                    )}
                    {task.status === 'assigned' && (
                      <Button size="sm" disabled={submittingTask} onClick={() => submitTask(task.id)}>
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
            <div className="stat-number text-4xl font-bold text-primary mb-1">{data?.owned_projects.length ?? 0}</div>
            <div className="text-text-light text-sm">Owned Projects</div>
          </div>
          <div className="card bg-surface rounded-xl shadow p-6 text-center">
            <div className="stat-number text-4xl font-bold text-primary mb-1">{data?.my_interests.length ?? 0}</div>
            <div className="text-text-light text-sm">Active Interests</div>
          </div>
          <div className="card bg-surface rounded-xl shadow p-6 text-center">
            <div className="stat-number text-4xl font-bold text-primary mb-1">{unreadCount}</div>
            <div className="text-text-light text-sm">Unread Notifications</div>
          </div>
        </div>

        {/* Tabs */}
        {/* [test hook] active class added to active tab; notification-badge class used as test selector */}
        <div className="flex border-b border-brand-border mb-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`px-4 py-2 font-medium border-b-2 -mb-px cursor-pointer transition-colors ${
                activeTab === tab.key
                  ? 'active text-primary border-primary'
                  : 'text-text-light border-transparent hover:text-brand-text'
              }`}
              onClick={() => handleTabClick(tab.key)}
            >
              {tab.label}
            </button>
          ))}
          <button
            data-tab="notifications"
            className={`px-4 py-2 font-medium border-b-2 -mb-px cursor-pointer transition-colors ${
              activeTab === 'notifications'
                ? 'active text-primary border-primary'
                : 'text-text-light border-transparent hover:text-brand-text'
            }`}
            onClick={() => handleTabClick('notifications')}
          >
            Notifications
            {unreadCount > 0 && (
              <span className="notification-badge bg-primary text-secondary-dark text-xs px-2 py-0.5 rounded-full ml-1">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'owned' && (
          <div>
            {!data?.owned_projects.length ? (
              <p className="text-text-light">You don&apos;t own any projects yet.</p>
            ) : (
              <ProjectList projects={data.owned_projects} />
            )}
          </div>
        )}

        {activeTab === 'interests' && (
          <div>
            {!data?.my_interests.length ? (
              <p className="text-text-light">You haven&apos;t expressed interest in any projects yet.</p>
            ) : (
              <ProjectList projects={data.my_interests} userSkillIds={new Set(user.skills?.map(s => s.id) ?? [])} />
            )}
          </div>
        )}

        {activeTab === 'proposed' && (
          <div>
            {!data?.proposed_projects.length ? (
              <p className="text-text-light">You haven&apos;t proposed any projects yet.</p>
            ) : (
              <ProjectList projects={data.proposed_projects} />
            )}
          </div>
        )}

        {activeTab === 'suggested' && (
          <div>
            {!data?.suggested_projects.length ? (
              <p className="text-text-light">No suggested projects matching your skills right now.</p>
            ) : (
              <>
                <p className="mb-4 text-text-light">Based on your skills, these projects might be a good fit:</p>
                <ProjectList projects={data.suggested_projects} userSkillIds={new Set(user.skills?.map(s => s.id) ?? [])} />
              </>
            )}
          </div>
        )}

        {activeTab === 'notifications' && (
          <div>
            {unreadCount > 0 && (
              <Button className="mb-4" onClick={markAllRead}>
                Mark all as read
              </Button>
            )}
            {!notifications.length ? (
              <p className="text-text-light">No notifications yet.</p>
            ) : (
              notifications.map(n => (
                <div key={n.id} className={`bg-surface rounded-xl shadow p-5 mb-3 wrap-break-word ${!n.read_at ? 'border-l-4 border-primary' : ''}`}>
                  <strong className={!n.read_at ? 'text-brand-text' : 'text-text-light'}>{n.title}</strong>
                  <p className="text-sm mt-1 mb-0">{n.body}</p>
                  {n.link && <Link href={n.link} className="text-sm underline mt-1 inline-block">View</Link>}
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </>
  )
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardPageInner />
    </Suspense>
  )
}
