'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import Button from '@/components/Button'
import { ThemeToggle } from './ThemeToggle'
import BugReportDialog from './BugReportDialog'

function MobileNavLink({
  href,
  children,
  active,
}: {
  href: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <Link
      href={href}
      className={`block px-5 py-4 text-[var(--text)] no-underline font-medium text-base border-b border-brand-border transition-colors hover:bg-[var(--background)] ${active ? 'text-primary bg-accent' : ''}`}
    >
      {children}
    </Link>
  )
}

function MobileNavSection({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  return (
    <div
      className={`px-5 py-2 text-[0.65rem] font-bold uppercase tracking-widest bg-[var(--background)] border-b border-brand-border ${admin ? 'text-primary' : 'text-[var(--text-light)]'}`}
    >
      {children}
    </div>
  )
}

function DashboardNavButtons({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname()
  const [hash, setHash] = useState(() =>
    typeof window !== 'undefined' ? window.location.hash : '',
  )

  useEffect(() => {
    function onHashChange() {
      setHash(window.location.hash)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Sync hash when pathname changes (navigating to/from dashboard)
  useEffect(() => {
    setHash(typeof window !== 'undefined' ? window.location.hash : '')
  }, [pathname])

  const onDashboard = pathname === '/dashboard'
  const activeTab = onDashboard && hash.startsWith('#tab-') ? hash.slice('#tab-'.length) : ''

  function goToTab(tab: string) {
    if (tab) {
      window.location.hash = `tab-${tab}`
    } else {
      history.pushState(null, '', '/dashboard')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    }
  }

  return (
    <>
      <Button
        href="/dashboard"
        variant={onDashboard && activeTab !== 'notifications' ? 'primary' : 'ghost'}
        size="sm"
        onClick={(e) => {
          if (onDashboard) {
            e.preventDefault()
            goToTab('')
          }
        }}
      >
        My Projects
      </Button>
      <Button
        href="/dashboard#tab-notifications"
        variant={activeTab === 'notifications' ? 'primary' : 'ghost'}
        size="sm"
        onClick={(e) => {
          if (onDashboard) {
            e.preventDefault()
            goToTab('notifications')
          }
        }}
      >
        Notifications
        {unreadCount > 0 && (
          <span className="bg-primary text-secondary-dark text-xs px-2 py-0.5 rounded-full ml-1">
            {unreadCount}
          </span>
        )}
      </Button>
    </>
  )
}

export default function Header() {
  const { user, loading, logout } = useAuth()
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [bugDialogOpen, setBugDialogOpen] = useState(false)

  const fetchNotifications = useCallback(async () => {
    if (!user) return
    try {
      const data = await apiRequest<{ notifications: { read_at: string | null }[] }>(
        '/api/notifications',
      )
      const unread = data.notifications.filter((n) => !n.read_at).length
      setUnreadCount(unread)
    } catch {}
  }, [user])

  useEffect(() => {
    // False positive: fetchNotifications is async; setUnreadCount only runs after
    // await apiRequest(), never synchronously. Rule traces call graph without async boundaries.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications()
  }, [fetchNotifications, pathname])

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileMenuOpen])

  // Close mobile menu on navigation. Intentional derived-state reset pattern;
  // threading a callback through all MobileNavLink usages would be worse.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileMenuOpen(false)
  }, [pathname])

  const navLinks = [
    { href: '/', label: 'Projects' },
    { href: '/volunteers', label: 'Volunteers' },
    { href: '/suggest', label: 'Suggest' },
    { href: '/starter-tasks', label: 'Starter Tasks' },
  ]

  const isAdminPage = pathname.startsWith('/admin')

  return (
    <>
      <header className="bg-surface border-b border-brand-border py-4 sticky top-0 z-[100]">
        <div className="container flex justify-between items-center gap-2 flex-nowrap xl:gap-4">
          <Link
            href="/"
            className="font-[var(--font-display)] text-2xl font-black text-primary no-underline flex items-center gap-2"
          >
            Catalyse
          </Link>

          <nav className="hidden xl:flex gap-2 flex-wrap">
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
            {!loading && user && <DashboardNavButtons unreadCount={unreadCount} />}
          </nav>

          <div className="hidden xl:flex gap-2 items-center">
            {!loading &&
              (user ? (
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="bg-accent border border-brand-border"
                    onClick={() => setUserMenuOpen((o) => !o)}
                  >
                    {user.name}
                    {unreadCount > 0 && (
                      <span className="bg-primary text-secondary-dark text-xs px-2 py-0.5 rounded-full ml-1">
                        {unreadCount}
                      </span>
                    )}
                  </Button>
                  {userMenuOpen && (
                    <div
                      className="absolute top-full right-0 mt-2 bg-surface rounded-[var(--radius)] border border-brand-border shadow-lg w-max z-[101]"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Link
                        href="/profile"
                        className="block px-4 py-3 text-[var(--text)] no-underline"
                      >
                        My Profile
                      </Link>
                      <Link
                        href="/settings"
                        className="block px-4 py-3 text-[var(--text)] no-underline"
                      >
                        Account Settings
                      </Link>
                      <Link
                        href="/privacy"
                        className="block px-4 py-3 text-[var(--text)] no-underline"
                      >
                        Privacy &amp; Data
                      </Link>
                      {user.is_admin && (
                        <>
                          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-light)] border-t border-brand-border mt-1">
                            Admin
                          </div>
                          <Link
                            href="/admin/triage"
                            className="block px-4 py-3 text-[var(--text)] no-underline"
                          >
                            Triage Queue
                          </Link>
                          <Link
                            href="/admin/projects/new"
                            className="block px-4 py-3 text-[var(--text)] no-underline"
                          >
                            Create Org Project
                          </Link>
                          <Link
                            href="/admin/starter-tasks"
                            className="block px-4 py-3 text-[var(--text)] no-underline"
                          >
                            Manage Starter Tasks
                          </Link>
                          <Link
                            href="/admin/skills"
                            className="block px-4 py-3 text-[var(--text)] no-underline"
                          >
                            Manage Skills
                          </Link>
                          <Link
                            href="/admin/bugs"
                            className="block px-4 py-3 text-[var(--text)] no-underline"
                          >
                            Bug Reports
                          </Link>
                          <Link
                            href="/admin/team"
                            className="block px-4 py-3 text-[var(--text)] no-underline"
                          >
                            Admin Team
                          </Link>
                          <Link
                            href="/admin/stats"
                            className="block px-4 py-3 text-[var(--text)] no-underline"
                          >
                            Platform Stats
                          </Link>
                          <Link
                            href="/admin/local-groups"
                            className="block px-4 py-3 text-[var(--text)] no-underline"
                          >
                            Manage local groups
                          </Link>
                        </>
                      )}
                      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-light)] border-t border-brand-border mt-1">
                        Session
                      </div>
                      <Button
                        variant="ghost"
                        onClick={logout}
                        className="w-full justify-start px-4 py-3"
                      >
                        Sign Out
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Button href="/login" variant="ghost" size="sm">
                    Login
                  </Button>
                  <Button href="/signup" size="sm">
                    Sign Up
                  </Button>
                </>
              ))}
          </div>

          {/* Mobile action buttons + hamburger — visible below xl breakpoint */}
          <div className="xl:hidden flex items-center gap-2 shrink-0">
            <ThemeToggle size="md" />
            <Button
              variant="ghost"
              size="md"
              icon
              className="border border-brand-border"
              aria-label="Report a bug or give feedback"
              onClick={() => setBugDialogOpen(true)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="md"
              icon
              className="border border-brand-border"
              aria-label="Open menu"
              onClick={() => setMobileMenuOpen(true)}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile nav panel — full-screen overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-surface z-[1500] flex flex-col">
          {/* Panel header */}
          <div className="border-b border-brand-border bg-surface shrink-0">
            <div className="container flex items-center justify-between py-4">
              <Link
                href="/"
                className="font-[var(--font-display)] text-2xl font-black text-primary no-underline"
              >
                Catalyse
              </Link>
              <Button
                variant="ghost"
                size="md"
                icon
                className="border border-brand-border"
                aria-label="Close menu"
                onClick={() => setMobileMenuOpen(false)}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </Button>
            </div>
          </div>

          {/* Nav links */}
          <div className="flex-1 overflow-y-auto">
            {user &&
              navLinks.map(({ href, label }) => (
                <MobileNavLink key={href} href={href} active={pathname === href}>
                  {label}
                </MobileNavLink>
              ))}

            {!loading &&
              (user ? (
                <>
                  <MobileNavSection>Account</MobileNavSection>
                  <MobileNavLink href="/dashboard">
                    Dashboard
                    {unreadCount > 0 && (
                      <span className="bg-primary text-secondary-dark text-xs px-2 py-0.5 rounded-full ml-1">
                        {unreadCount}
                      </span>
                    )}
                  </MobileNavLink>
                  <MobileNavLink href="/profile">My Profile</MobileNavLink>
                  <MobileNavLink href="/settings">Account Settings</MobileNavLink>

                  {user.is_admin && !isAdminPage && (
                    <>
                      <MobileNavSection admin>Admin</MobileNavSection>
                      <MobileNavLink href="/admin/triage">Triage Queue</MobileNavLink>
                      <MobileNavLink href="/admin/projects/new">Create Org Project</MobileNavLink>
                      <MobileNavLink href="/admin/starter-tasks">
                        Manage Starter Tasks
                      </MobileNavLink>
                      <MobileNavLink href="/admin/skills">Manage Skills</MobileNavLink>
                      <MobileNavLink href="/admin/bugs">Bug Reports</MobileNavLink>
                      <MobileNavLink href="/admin/team">Admin Team</MobileNavLink>
                      <MobileNavLink href="/admin/stats">Platform Stats</MobileNavLink>
                      <MobileNavLink href="/admin/local-groups">Manage local groups</MobileNavLink>
                    </>
                  )}

                  <MobileNavSection>Session</MobileNavSection>
                  <button
                    onClick={() => {
                      logout()
                      setMobileMenuOpen(false)
                    }}
                    className="block w-full text-left px-5 py-4 text-[var(--text)] font-medium text-base border-b border-brand-border hover:bg-[var(--background)] cursor-pointer bg-transparent"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <MobileNavSection>Account</MobileNavSection>
                  <MobileNavLink href="/login">Login</MobileNavLink>
                  <MobileNavLink href="/signup">Sign Up</MobileNavLink>
                </>
              ))}

          </div>

          {/* Pinned bottom bar */}
          <div className="shrink-0 border-t border-brand-border bg-surface">
            <div className="flex items-center overflow-hidden w-full">
              <ThemeToggle icon={false} size="md" className="rounded-none flex-1 justify-center self-stretch" />
              <button
                onClick={() => {
                  setBugDialogOpen(true)
                  setMobileMenuOpen(false)
                }}
                className="flex items-center justify-center gap-2 flex-1 px-4 py-2 text-[var(--text)] font-medium text-base border-l border-brand-border hover:bg-[var(--background)] cursor-pointer bg-transparent whitespace-nowrap"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
                Report bug/feedback
              </button>
            </div>
          </div>
        </div>
      )}

      <BugReportDialog isOpen={bugDialogOpen} onClose={() => setBugDialogOpen(false)} />
    </>
  )
}
