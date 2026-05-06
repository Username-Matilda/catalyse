'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface Project {
  id: number
  title: string
  status: string
  description: string
  updated_at: string
  pending_interest_count: number
  skills?: { name: string }[]
  match?: { required_match_percent: number }
}

interface Interest {
  id: number
  project_id: number
  project_title: string
  project_status: string
  interest_type: string
  status: string
  created_at: string
  message: string | null
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


function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 30) return `${diffDays} days ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  return `${Math.floor(diffDays / 365)} years ago`
}

function formatStatus(status: string) {
  return status.replace(/_/g, ' ')
}

function formatInterestType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

function statusBadgeClasses(status: string) {
  const map: Record<string, string> = {
    seeking_owner: 'bg-[#FED7AA] text-[#92400E] dark:bg-[#78350F] dark:text-[#FED7AA]',
    seeking_help: 'bg-[#FED7AA] text-[#92400E] dark:bg-[#78350F] dark:text-[#FED7AA]',
    needs_tasks: 'bg-[#FEF9C3] text-[#713F12] dark:bg-[#78350F] dark:text-[#FDE68A]',
    in_progress: 'bg-[#DBEAFE] text-[#1E40AF] dark:bg-[#1E3A5F] dark:text-[#93C5FD]',
    on_hold: 'bg-[#F3F4F6] text-[#374151] dark:bg-[#374151] dark:text-[#9CA3AF]',
    completed: 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]',
    pending_review: 'bg-[#FEF3C7] text-[#92400E] dark:bg-[#78350F] dark:text-[#FDE68A]',
    accepted: 'bg-[#D1FAE5] text-[#065F46] dark:bg-[#064E3B] dark:text-[#6EE7B7]',
    declined: 'bg-[#F3F4F6] text-[#374151] dark:bg-[#374151] dark:text-[#9CA3AF]',
    withdrawn: 'bg-[#F3F4F6] text-[#374151] dark:bg-[#374151] dark:text-[#9CA3AF]',
  }
  // [test hook] status-badge class used as test selector
  return `status-badge inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${map[status] ?? 'bg-[#F3F4F6] text-[#374151]'}`
}

function ProjectCard({ project: p, showMatch }: { project: Project; showMatch?: boolean }) {
  return (
    <div className="card bg-surface rounded-xl shadow p-5 mb-3 wrap-break-word">
      <div className="card-header flex justify-between items-start gap-3 mb-2">
        <h3 className="text-base font-semibold m-0">
          <Link href={`/projects/${p.id}`} className="no-underline hover:underline">{p.title}</Link>
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          {showMatch && p.match && (
            <span className="text-xs font-semibold text-primary">{p.match.required_match_percent}% match</span>
          )}
          <span className={statusBadgeClasses(p.status)}>{formatStatus(p.status)}</span>
        </div>
      </div>
      {p.description && (
        <p className="text-sm text-text-light mb-2">{truncate(p.description, 150)}</p>
      )}
      {p.skills && p.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {p.skills.map(s => (
            <span key={s.name} className="skill-tag bg-[#DBEAFE] text-[#1E40AF] dark:bg-[#1E3A5F] dark:text-[#93C5FD] text-xs px-2 py-0.5 rounded-full">{s.name}</span>
          ))}
        </div>
      )}
      {p.pending_interest_count > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg mb-2 bg-[#DBEAFE] text-[#1E40AF] dark:bg-[#1E3A5F] dark:text-[#93C5FD] text-sm">
          {p.pending_interest_count} volunteer{p.pending_interest_count > 1 ? 's' : ''} interested!
        </div>
      )}
      <div className="flex justify-between items-center mt-3">
        <span className="text-xs text-text-light">Updated {formatDate(p.updated_at)}</span>
        <Link href={`/projects/${p.id}`}><Button variant="outline" size="sm">View</Button></Link>
      </div>
    </div>
  )
}

export default function DashboardPage() {
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
              data.owned_projects.map(p => (
                <ProjectCard key={p.id} project={p} />
              ))
            )}
          </div>
        )}

        {activeTab === 'interests' && (
          <div>
            {!data?.my_interests.length ? (
              <p className="text-text-light">You haven&apos;t expressed interest in any projects yet.</p>
            ) : (
              data.my_interests.map(i => (
                <div key={i.id} className="card bg-surface rounded-xl shadow p-5 mb-3 wrap-break-word">
                  <div className="card-header flex justify-between items-start gap-3 mb-2">
                    <h3 className="text-base font-semibold m-0">
                      <Link href={`/projects/${i.project_id}`} className="no-underline hover:underline">{i.project_title}</Link>
                    </h3>
                    <span className={statusBadgeClasses(i.status)}>{i.status}</span>
                  </div>
                  <p className="text-sm text-text-light mb-2">
                    {formatInterestType(i.interest_type)} · Submitted {formatDate(i.created_at)}
                  </p>
                  {i.message && (
                    <p className="text-sm italic mb-2">&ldquo;{i.message}&rdquo;</p>
                  )}
                  <div className="flex justify-between items-center mt-3">
                    <span className="text-sm">Project: <span className={statusBadgeClasses(i.project_status)}>{formatStatus(i.project_status)}</span></span>
                    <Link href={`/projects/${i.project_id}`}><Button variant="outline" size="sm">View Project</Button></Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'proposed' && (
          <div>
            {!data?.proposed_projects.length ? (
              <p className="text-text-light">You haven&apos;t proposed any projects yet.</p>
            ) : (
              data.proposed_projects.map(p => (
                <ProjectCard key={p.id} project={p} />
              ))
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
                {data.suggested_projects.map(p => (
                  <ProjectCard key={p.id} project={p} showMatch />
                ))}
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
