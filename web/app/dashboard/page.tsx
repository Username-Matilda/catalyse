'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface Project {
  id: number
  title: string
  status: string
}

interface Interest {
  id: number
  project_id: number
  project_title: string
  project_status: string
  interest_type: string
  status: string
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

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [activeTab, setActiveTab] = useState<TabKey>('owned')
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingData, setLoadingData] = useState(true)
  const [starterTasks, setStarterTasks] = useState<StarterTask[]>([])
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set())
  const [taskAlert, setTaskAlert] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [submittingTask, setSubmittingTask] = useState(false)

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
        <main className="container page">
          <div className="loading">Loading dashboard…</div>
        </main>
      </>
    )
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'owned', label: 'My Projects' },
    { key: 'interests', label: 'My Interests' },
    { key: 'proposed', label: 'Proposed Projects' },
    { key: 'suggested', label: 'Suggested for You' },
  ]

  return (
    <>
      <Header />
      <main className="container page">
        <h1 role="heading">Welcome back, {user.name}!</h1>

        {starterTasks.length > 0 && (
          <section aria-label="Starter Tasks" style={{ marginBottom: 32 }}>
            <h2>Starter Tasks</h2>
            {taskAlert && (
              <div role="alert" className={`message ${taskAlert.type}`} style={{ marginBottom: 16 }}>
                {taskAlert.text}
              </div>
            )}
            {starterTasks.map(task => (
              <div key={task.id} className="card" style={{ marginBottom: 16 }}>
                <div
                  className="card-header"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => toggleTask(task.id)}
                >
                  <div>
                    <strong>{task.title}</strong>
                    {task.skill_name && <span style={{ marginLeft: 8, fontSize: '0.875rem', color: 'var(--text-light)' }}>{task.skill_name}</span>}
                  </div>
                  <span className="status-badge" style={{ padding: '2px 8px', borderRadius: 12, fontSize: '0.8rem', background: 'var(--bg-secondary, #f8fafc)' }}>
                    {task.status}
                  </span>
                </div>
                {expandedTasks.has(task.id) && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ margin: '0 0 12px', color: 'var(--text-light)', fontSize: '0.875rem' }}>{task.description}</p>
                    {task.feedback_to_volunteer && (
                      <p style={{ margin: '0 0 12px', fontSize: '0.875rem' }}><strong>Feedback:</strong> {task.feedback_to_volunteer}</p>
                    )}
                    {task.status === 'assigned' && (
                      <button
                        className="btn btn-primary btn-small"
                        disabled={submittingTask}
                        onClick={() => submitTask(task.id)}
                      >
                        Mark as Complete
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        <div className="grid grid-3 stats-grid" style={{ marginBottom: 32 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="stat-number">{data?.owned_projects.length ?? 0}</div>
            <div>Owned projects</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="stat-number">{data?.my_interests.length ?? 0}</div>
            <div>Active Interests</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="stat-number">{unreadCount}</div>
            <div>Unread Notifications</div>
          </div>
        </div>

        <div className="tabs-wrapper">
          <div className="tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                className={`tab${activeTab === tab.key ? ' active' : ''}`}
                onClick={() => handleTabClick(tab.key)}
              >
                {tab.label}
              </button>
            ))}
            <button
              data-tab="notifications"
              className={`tab${activeTab === 'notifications' ? ' active' : ''}`}
              onClick={() => handleTabClick('notifications')}
            >
              Notifications
              {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
            </button>
          </div>
        </div>

        <div className="tab-content">
          {activeTab === 'owned' && (
            <div>
              {!data?.owned_projects.length ? (
                <p>You don&apos;t own any projects yet.</p>
              ) : (
                data.owned_projects.map(p => (
                  <div key={p.id} className="card">
                    <Link href={`/projects/${p.id}`}>{p.title}</Link>
                    <span style={{ marginLeft: 8, color: 'var(--text-light)' }}>{p.status}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'interests' && (
            <div>
              {!data?.my_interests.length ? (
                <p>You haven&apos;t expressed interest in any projects yet.</p>
              ) : (
                data.my_interests.map(i => (
                  <div key={i.id} className="card">
                    <Link href={`/projects/${i.project_id}`}>{i.project_title}</Link>
                    <span style={{ marginLeft: 8, color: 'var(--text-light)' }}>{i.status}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'proposed' && (
            <div>
              {!data?.proposed_projects.length ? (
                <p>You haven&apos;t proposed any projects yet.</p>
              ) : (
                data.proposed_projects.map(p => (
                  <div key={p.id} className="card">
                    <Link href={`/projects/${p.id}`}>{p.title}</Link>
                    <span style={{ marginLeft: 8, color: 'var(--text-light)' }}>{p.status}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'suggested' && (
            <div>
              {!data?.suggested_projects.length ? (
                <p>No suggested projects right now.</p>
              ) : (
                data.suggested_projects.map(p => (
                  <div key={p.id} className="card">
                    <Link href={`/projects/${p.id}`}>{p.title}</Link>
                    <span style={{ marginLeft: 8, color: 'var(--text-light)' }}>{p.status}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div>
              {unreadCount > 0 && (
                <button className="btn btn-primary" onClick={markAllRead} style={{ marginBottom: 16 }}>
                  Mark all as read
                </button>
              )}
              {!notifications.length ? (
                <p>No notifications.</p>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className="card">
                    <strong>{n.title}</strong>
                    <p style={{ margin: '4px 0 0' }}>{n.body}</p>
                    {n.link && <Link href={n.link} style={{ fontSize: '0.875rem' }}>View</Link>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
