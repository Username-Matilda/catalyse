'use client'

import { useRequireAuth } from '@/lib/hooks/auth'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import Button from '@/components/Button'
import ProjectForm from '@/components/ProjectForm'
import { useToast } from '@/lib/toast'
import { orpc } from '@/lib/orpc'

export default function SuggestPage() {
  const router = useRouter()
  const { user, loading } = useRequireAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const createMutation = useMutation({ ...orpc.projects.create.mutationOptions() })

  const { data: drafts = [] } = useQuery({
    ...orpc.projects.myDrafts.queryOptions(),
    enabled: !!user,
  })

  const publishMutation = useMutation({
    ...orpc.projects.publishDraft.mutationOptions(),
    onSuccess: () => {
      toast('Draft submitted for review!', 'success')
      queryClient.invalidateQueries({ queryKey: orpc.projects.myDrafts.key() })
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : 'Failed to publish draft', 'error')
    },
  })

  const deleteMutation = useMutation({
    ...orpc.projects.deleteDraft.mutationOptions(),
    onSuccess: () => {
      toast('Draft deleted', 'success')
      queryClient.invalidateQueries({ queryKey: orpc.projects.myDrafts.key() })
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : 'Failed to delete draft', 'error')
    },
  })

  if (loading || !user) return null

  return (
    <>
      <main className="container py-5 pb-15">
        <h1 role="heading">Suggest a Project</h1>
        <p>
          Have an idea for something PauseAI should do? Propose it here! Our team will review it
          and, if approved, it&apos;ll be visible to all volunteers.
        </p>

        {drafts.length > 0 && (
          <div className="max-w-4xl bg-surface rounded-xl shadow p-6 mb-4">
            <h2 className="mt-0 mb-3">My Drafts</h2>
            <p className="text-sm text-text-light mt-0 mb-3">
              Open a draft to add tasks. It needs at least one before it can be published.
            </p>
            <ul className="flex flex-col gap-2">
              {drafts.map((draft) => (
                <li
                  key={draft.id}
                  className="flex items-center justify-between gap-3 bg-brand-bg rounded-lg p-3 border border-brand-border"
                >
                  <Link href={`/projects/${draft.id}`} className="font-medium underline">
                    {draft.title || 'Untitled draft'}
                  </Link>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={publishMutation.isPending}
                      onClick={() => publishMutation.mutate({ id: draft.id })}
                    >
                      Publish
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm('Delete this draft? This cannot be undone.')) {
                          deleteMutation.mutate({ id: draft.id })
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="max-w-4xl">
          <ProjectForm
            onSubmitForm={(data) => createMutation.mutateAsync(data)}
            submitLabel="Submit Project Proposal"
            showReviewNotice
            onSuccess={() => {
              toast("Project submitted for review! We'll be in touch.", 'success')
              setTimeout(() => router.push('/dashboard#tab-proposed'), 2000)
            }}
            onSaveDraft={(data) => createMutation.mutateAsync({ ...data, saveAsDraft: true })}
            onDraftSuccess={() => {
              toast('Draft saved.', 'success')
              queryClient.invalidateQueries({ queryKey: orpc.projects.myDrafts.key() })
            }}
          />
        </div>
      </main>
    </>
  )
}
