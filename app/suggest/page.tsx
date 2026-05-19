'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import ProjectForm from '@/components/ProjectForm'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/lib/toast'
import { orpc } from '@/lib/orpc'

export default function SuggestPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const toast = useToast()
  const createMutation = useMutation({ ...orpc.projects.create.mutationOptions() })

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  if (loading || !user) return null

  return (
    <>
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <h1 role="heading">Suggest a Project</h1>
        <p>
          Have an idea for something PauseAI UK should do? Propose it here! Our team will review it
          and, if approved, it&apos;ll be visible to all volunteers.
        </p>
        <div className="max-w-4xl">
          <ProjectForm
            onSubmitForm={(data) => createMutation.mutateAsync(data)}
            submitLabel="Submit Project Proposal"
            showReviewNotice
            requireTasks
            onSuccess={() => {
              toast("Project submitted for review! We'll be in touch.", 'success')
              setTimeout(() => router.push('/dashboard#tab-proposed'), 2000)
            }}
          />
        </div>
      </main>
    </>
  )
}
