'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import BugReportDialog from './BugReportDialog'
import { ThemeToggle } from './ThemeToggle'

export default function Header() {
  const { user, loading, logout } = useAuth()
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)
  const [bugDialogOpen, setBugDialogOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const fetchNotifications = useCallback(async () => {
    if (!user) return
    try {
      const data = await apiRequest<{ notifications: { read_at: string | null }[] }>('/api/notifications')
      const unread = data.notifications.filter(n => !n.read_at).length
      setUnreadCount(unread)
    } catch {}
  }, [user])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications, pathname])

  const navLinks = [
    { href: '/', label: 'Projects' },
    { href: '/volunteers', label: 'Volunteers' },
    { href: '/suggest', label: 'Suggest' },
    { href: '/starter-tasks', label: 'Starter Tasks' },
  ]

  return (
    <>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '16px 0', position: 'sticky', top: 0, zIndex: 100 }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <Link href="/" className="logo" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 900, color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            Catalyse
          </Link>

          <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                style={{
                  padding: '8px 10px',
                  color: pathname === href ? '#111827' : 'var(--text)',
                  textDecoration: 'none',
                  borderRadius: 'var(--radius)',
                  fontWeight: 500,
                  background: pathname === href ? 'var(--primary)' : undefined,
                } as React.CSSProperties}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ThemeToggle />
            <button
              role="button"
              onClick={() => setBugDialogOpen(true)}
              className="btn btn-ghost btn-small"
            >
              Report a bug or give feedback
            </button>

            {!loading && (
              user ? (
                <div style={{ position: 'relative' }}>
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() => setUserMenuOpen(o => !o)}
                    style={{ background: 'var(--accent)', border: '1px solid var(--border)' }}
                  >
                    {user.name}
                    {unreadCount > 0 && (
                      <span className="notification-badge">{unreadCount}</span>
                    )}
                  </button>
                  {userMenuOpen && (
                    <div
                      style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', minWidth: 180, zIndex: 101 }}
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Link href="/dashboard" style={{ display: 'block', padding: '12px 16px', color: 'var(--text)', textDecoration: 'none' }}>
                        Dashboard
                        {unreadCount > 0 && (
                          <span data-tab="notifications" className="notification-badge">{unreadCount}</span>
                        )}
                      </Link>
                      <Link href="/profile" style={{ display: 'block', padding: '12px 16px', color: 'var(--text)', textDecoration: 'none' }}>Profile</Link>
                      <Link href="/settings" style={{ display: 'block', padding: '12px 16px', color: 'var(--text)', textDecoration: 'none' }}>Settings</Link>
                      {user.is_admin && (
                        <Link href="/admin/triage" style={{ display: 'block', padding: '12px 16px', color: 'var(--text)', textDecoration: 'none' }}>Admin</Link>
                      )}
                      <button
                        onClick={logout}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontFamily: 'var(--font-body)' }}
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Link href="/login" className="btn btn-ghost btn-small">Login</Link>
                  <Link href="/signup" className="btn btn-primary btn-small">Sign Up</Link>
                </>
              )
            )}
          </div>
        </div>
      </header>

      <BugReportDialog isOpen={bugDialogOpen} onClose={() => setBugDialogOpen(false)} />
    </>
  )
}
