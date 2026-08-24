'use client'

import { useRequireAdmin } from '@/lib/hooks/auth'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import Button from '@/components/Button'
import ProjectForm from '@/components/ProjectForm'
import { orpc } from '@/lib/orpc'

export default function AdminCreateProjectPage() {
  const router = useRouter()
  const { user, loading } = useRequireAdmin()
  const createMutation = useMutation({ ...orpc.admin.projects.create.mutationOptions() })

  const { data: drafts = [] } = useQuery({
    ...orpc.admin.projects.myDrafts.queryOptions(),
    enabled: !!user,
  })

  if (loading || !user) return null

  return (
    <>
      <main className="container py-5 pb-15">
        <h1 role="heading">Org Projects</h1>
        <p className="text-text-light mb-6">
          Create a project on behalf of PauseAI. This skips the approval process.
        </p>

        {drafts.length > 0 && (
          <div className="max-w-4xl bg-surface rounded-xl shadow p-6 mb-4">
            <h2 className="mt-0 mb-3">My Drafts</h2>
            <p className="text-sm text-text-light mt-0 mb-3">
              Publishing and deleting a draft are both done from its edit page.
            </p>
            <ul className="flex flex-col gap-2">
              {drafts.map((draft) => (
                <li
                  key={draft.id}
                  className="flex items-center justify-between gap-3 bg-brand-bg rounded-lg p-3 border border-brand-border"
                >
                  <span className="font-medium">{draft.title || 'Untitled draft'}</span>
                  <Button href={`/projects/${draft.id}/edit`} size="sm">
                    Edit
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="max-w-4xl">
          <ProjectForm
            onSubmitForm={(data) => createMutation.mutateAsync(data)}
            submitLabel="Publish"
            onSaveDraft={(data) => createMutation.mutateAsync({ ...data, saveAsDraft: true })}
            onSuccess={(id) => router.push(`/projects/${id}`)}
            onDraftSuccess={(id) => router.push(`/projects/${id}/edit`)}
            onCancel={() => router.back()}
          />
        </div>
      </main>
    </>
  )
}
