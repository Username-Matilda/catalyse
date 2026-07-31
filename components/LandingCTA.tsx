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
  const { user } = useAuth()

  // Deliberately no `loading` branch. `AuthProvider` seeds `loading` from
  // localStorage, so it is false on the server and true on the client whenever a
  // token exists — branching on it here would hydrate differently to the
  // prerendered HTML. `user` is null in both renders, so the signed-out CTA is a
  // stable match; signed-in visitors swap over once auth resolves. Both branches
  // are the same height, so nothing shifts.
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
