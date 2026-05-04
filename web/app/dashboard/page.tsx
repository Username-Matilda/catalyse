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

type TabKey = 'owned' | 'interests' | 'proposed' | 'suggested' | 'notifications'

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [activeTab, setActiveTab] = useState<TabKey>('owned')
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingData, setLoadingData] = useState(true)

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
  }, [user])

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
