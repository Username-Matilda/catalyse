'use client'

import { useRequireAuth } from '@/lib/hooks/auth'
import ProjectEditor from '@/components/ProjectEditor'

export default function SuggestNewProjectPage() {
  const { user, loading } = useRequireAuth()

  if (loading || !user) return null

  return (
    <main className="container py-5 pb-15">
      <h1 role="heading">Suggest a Project</h1>
      <p>
        Have an idea for something PauseAI should do? Propose it here! Our team will review it and,
        if approved, it&apos;ll be visible to all volunteers.
      </p>

      <div className="max-w-4xl">
        <ProjectEditor variant="volunteer" />
      </div>
    </main>
  )
}
