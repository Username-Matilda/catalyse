'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import ProjectForm from '@/components/ProjectForm'
import { useAuth } from '@/lib/auth-context'

export default function AdminCreateProjectPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-5 pb-15">
        <h1 role="heading">Create Organisation Project</h1>
        <p className="text-text-light mb-6">
          Create a project on behalf of PauseAI UK. This skips the approval process.
        </p>
        {/* TODO: add a "Save as draft" option so org projects can be created without immediately going live */}
        <ProjectForm
          action="/api/admin/projects"
          submitLabel="Create Project"
          onSuccess={(id) => router.push(`/projects/${id}`)}
          onCancel={() => router.back()}
        />
      </main>
    </>
  )
}
