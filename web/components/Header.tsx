'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import BugReportDialog from './BugReportDialog'
import { ThemeToggle } from './ThemeToggle'
import Button from '@/components/Button'

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
      <header className="bg-surface border-b border-brand-border py-4 sticky top-0 z-[100]">
        <div className="container flex justify-between items-center flex-wrap gap-4">
          <Link href="/" className="font-[var(--font-display)] text-2xl font-black text-primary no-underline flex items-center gap-2">
            Catalyse
          </Link>

          <nav className="flex gap-2 flex-wrap">
            {navLinks.map(({ href, label }) => (
              <Button
                key={href}
                href={href}
                variant={pathname === href ? 'primary' : 'ghost'}
                size="sm"
              >
                {label}
              </Button>
            ))}
          </nav>

          <div className="flex gap-2 items-center">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => setBugDialogOpen(true)}>
              Report a bug or give feedback
            </Button>

            {!loading && (
              user ? (
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="bg-accent border border-brand-border"
                    onClick={() => setUserMenuOpen(o => !o)}
                  >
                    {user.name}
                    {unreadCount > 0 && (
                      <span className="bg-primary text-secondary-dark text-xs px-2 py-0.5 rounded-full ml-1">{unreadCount}</span>
                    )}
                  </Button>
                  {userMenuOpen && (
                    <div
                      className="absolute top-full right-0 mt-2 bg-surface rounded-[var(--radius)] border border-brand-border shadow-lg min-w-[180px] z-[101]"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Link href="/dashboard" className="block px-4 py-3 text-[var(--text)] no-underline">
                        Dashboard
                        {unreadCount > 0 && (
                          <span data-tab="notifications" className="bg-primary text-secondary-dark text-xs px-2 py-0.5 rounded-full ml-1">{unreadCount}</span>
                        )}
                      </Link>
                      <Link href="/profile" className="block px-4 py-3 text-[var(--text)] no-underline">Profile</Link>
                      <Link href="/settings" className="block px-4 py-3 text-[var(--text)] no-underline">Settings</Link>
                      {user.is_admin && (
                        <Link href="/admin/triage" className="block px-4 py-3 text-[var(--text)] no-underline">Admin</Link>
                      )}
                      <Button
                        variant="ghost"
                        onClick={logout}
                        className="w-full justify-start px-4 py-3"
                      >
                        Logout
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Button href="/login" variant="ghost" size="sm">Login</Button>
                  <Button href="/signup" size="sm">Sign Up</Button>
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
