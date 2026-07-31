'use client'

import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'

/**
 * Auth-aware call to action for the public landing page.
 *
 * The landing page itself is a server component so it renders instantly for
 * logged-out visitors; only these buttons need to know who is looking.
 */
export default function LandingCTA({ size = 'lg' }: { size?: 'md' | 'lg' }) {
  const { user, loading } = useAuth()

  // Reserve the row height while auth resolves so the hero doesn't jump.
  if (loading) return <div className={size === 'lg' ? 'h-12' : 'h-10'} aria-hidden="true" />

  if (user) {
    return (
      <div className="flex flex-wrap gap-3">
        <Button href="/projects" size={size}>
          Browse projects
        </Button>
        <Button href="/dashboard" variant="outline" size={size}>
          Go to my dashboard
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button href="/signup" size={size}>
        Apply to join
      </Button>
      <Button href="/login" variant="outline" size={size}>
        Log in
      </Button>
    </div>
  )
}
