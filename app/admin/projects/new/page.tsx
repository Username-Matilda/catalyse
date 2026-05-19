'use client'

import { useRequireAdmin } from '@/lib/hooks/auth'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import ProjectForm from '@/components/ProjectForm'
import { orpc } from '@/lib/orpc'

export default function AdminCreateProjectPage() {
  const router = useRouter()
  const { user, loading } = useRequireAdmin()
  const createMutation = useMutation({ ...orpc.admin.projects.create.mutationOptions() })

  if (loading || !user) return null

  return (
    <>
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <h1 role="heading">Create Organisation Project</h1>
        <p className="text-text-light mb-6">
          Create a project on behalf of PauseAI UK. This skips the approval process.
        </p>
        <div className="max-w-4xl">
          <ProjectForm
            onSubmitForm={(data) => createMutation.mutateAsync(data)}
            submitLabel="Create Project"
            onSuccess={(id) => router.push(`/projects/${id}`)}
            onCancel={() => router.back()}
          />
        </div>
      </main>
    </>
  )
}
