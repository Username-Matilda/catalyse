'use client'

import React, { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
import SkillPicker from '@/components/SkillPicker'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { useToast } from '@/lib/toast'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

interface ProjectData {
  id: number
  title: string
  description: string
  collaboration_link: string | null
  owner_id: number | null
  proposed_by_id: number | null
  skills: Array<{ id: number; name: string; is_required: boolean | null }>
}

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const router = useRouter()
  const { user, loading } = useAuth()
  const [project, setProject] = useState<ProjectData | null>(null)
  const [loadingProject, setLoadingProject] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [collaborationLink, setCollaborationLink] = useState('')
  const [skills, setSkills] = useState<SelectedSkill[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [permissionChecked, setPermissionChecked] = useState(false)
  const showToast = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    apiRequest<ProjectData>(`/api/projects/${idParam}`)
      .then((data) => {
        setProject(data)
        setTitle(data.title)
        setDescription(data.description)
        setCollaborationLink(data.collaboration_link ?? '')
        setSkills(
          (data.skills ?? []).map((s) => ({ skillId: s.id, proficiencyLevel: 'intermediate' })),
        )
        const isOwner = data.owner_id === user.id || data.proposed_by_id === user.id
        const isAdmin = user.is_admin
        setCanEdit(isOwner || isAdmin)
        setPermissionChecked(true)
      })
      .catch(() => {
        setPermissionChecked(true)
      })
      .finally(() => setLoadingProject(false))
  }, [user, idParam])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit) return
    setSubmitting(true)
    try {
      await apiRequest(`/api/projects/${idParam}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          collaboration_link: collaborationLink.trim() || null,
          skill_ids: skills.map((s) => s.skillId),
        }),
      })
      router.push(`/projects/${idParam}`)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to save changes', 'error')
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Are you sure you want to delete this project? This cannot be undone.'))
      return
    setDeleting(true)
    try {
      await apiRequest(`/api/projects/${idParam}`, { method: 'DELETE' })
      router.push('/')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to delete project', 'error')
      setDeleting(false)
    }
  }

  if (loading || !user) return null

  if (loadingProject) {
    return (
      <>
        <Header />
        <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
          <div className="text-center py-10 text-text-light">Loading project…</div>
        </main>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <h1 role="heading">Edit Project</h1>

        {permissionChecked && !canEdit && (
          <div
            role="alert"
            className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]"
          >
            You do not have permission to edit this project.
          </div>
        )}

        <form
          className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
          onSubmit={handleSubmit}
        >
          <div className="mb-5">
            <label htmlFor="edit-title">Project Title</label>
            <input
              id="edit-title"
              type="text"
              aria-label="Project Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              required
            />
          </div>

          <div className="mb-5">
            <label htmlFor="edit-description">Description</label>
            <textarea
              id="edit-description"
              aria-label="Description"
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="mb-5">
            <label htmlFor="edit-collab">Collaboration Doc / Link</label>
            <input
              id="edit-collab"
              type="url"
              aria-label="Collaboration Doc / Link"
              placeholder="https://…"
              value={collaborationLink}
              onChange={(e) => setCollaborationLink(e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="mb-5">
            <label>Skills needed</label>
            <SkillPicker value={skills} onChange={canEdit ? setSkills : () => {}} />
          </div>

          <div className="flex gap-3 flex-wrap">
            <Button type="submit" disabled={!canEdit || submitting}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </Button>

            {user.is_admin && project && (
              <Button type="button" variant="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Project'}
              </Button>
            )}
          </div>
        </form>
      </main>
    </>
  )
}
