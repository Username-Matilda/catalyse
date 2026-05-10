'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import Tabs from '@/components/Tabs'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import { useToast } from '@/lib/toast'

interface Skill {
  id: number
  name: string
  category_name: string
}
interface Endorsement {
  id: number
  skill_id: number
  skill_name: string
  skill_category: string
  endorsed_by_name: string
  rating: string
  notes: string | null
  created_at: string
}
interface AdminNote {
  id: number
  content: string
  category: string
  author_name: string
  created_at: string
  updated_at: string
}
interface StarterTask {
  id: number
  title: string
  status: string
  skill_name: string | null
  review_rating: string | null
}
interface ProjectHistory {
  id: number
  title: string
  status: string
  owner_id: number | null
  proposed_by_id: number | null
}
interface VolunteerDetail {
  id: number
  name: string
  email: string
  bio: string | null
  location: string | null
  local_group: string | null
  availability_hours_per_week: number | null
  discord_handle: string | null
  signal_number: string | null
  whatsapp_number: string | null
  consent_make_profile_visible_in_directory: boolean
  is_admin: boolean
  created_at: string
  skills: Skill[]
  endorsements: Endorsement[]
  admin_notes: AdminNote[]
  starter_tasks: StarterTask[]
  project_history: ProjectHistory[]
}

const NOTE_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'skill_feedback', label: 'Skill Feedback' },
  { value: 'reliability', label: 'Reliability' },
  { value: 'fit', label: 'Fit' },
]

const RATING_OPTIONS = [
  { value: 'verified', label: 'Verified - Can deliver' },
  { value: 'strong', label: 'Strong - Highly skilled' },
]

const BASED_ON_OPTIONS = [
  { value: 'direct_observation', label: 'Direct Observation' },
  { value: 'project_work', label: 'Project Work' },
  { value: 'interview', label: 'Interview' },
  { value: 'reference', label: 'Reference' },
]

type Tab = 'admin_notes' | 'starter_tasks' | 'project_history' | 'endorse_skill'

export default function AdminVolunteerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user, loading } = useAuth()
  const showToast = useToast()
  const [vol, setVol] = useState<VolunteerDetail | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [flatSkills, setFlatSkills] = useState<Skill[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('admin_notes')

  // Note add form
  const [noteContent, setNoteContent] = useState('')
  const [noteCategory, setNoteCategory] = useState('general')

  // Note inline edit
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
  const [editingNoteContent, setEditingNoteContent] = useState('')

  // Endorsement form
  const [endorseSkillId, setEndorseSkillId] = useState('')
  const [endorseRating, setEndorseRating] = useState('verified')
  const [endorseBasedOn, setEndorseBasedOn] = useState('direct_observation')

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user?.is_admin) return
    Promise.all([
      apiRequest<VolunteerDetail>(`/api/admin/volunteers/${id}`),
      apiRequest<Skill[]>('/api/skills/flat'),
    ])
      .then(([v, s]) => {
        setVol(v)
        setFlatSkills(s)
        setLoadingData(false)
      })
      .catch(() => setLoadingData(false))
  }, [user, id])

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await apiRequest(`/api/admin/volunteers/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: noteContent, category: noteCategory }),
      })
      showToast('Note added.', 'success')
      setNoteContent('')
      setNoteCategory('general')
      const updated = await apiRequest<VolunteerDetail>(`/api/admin/volunteers/${id}`)
      setVol(updated)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function saveEditedNote(noteId: number) {
    setSubmitting(true)
    try {
      await apiRequest(`/api/admin/notes/${noteId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editingNoteContent }),
      })
      showToast('Note updated.', 'success')
      setEditingNoteId(null)
      setEditingNoteContent('')
      const updated = await apiRequest<VolunteerDetail>(`/api/admin/volunteers/${id}`)
      setVol(updated)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteNote(noteId: number) {
    if (!confirm('Delete this note?')) return
    try {
      await apiRequest(`/api/admin/notes/${noteId}`, { method: 'DELETE' })
      showToast('Note deleted.', 'success')
      setVol((prev) =>
        prev ? { ...prev, admin_notes: prev.admin_notes.filter((n) => n.id !== noteId) } : prev,
      )
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    }
  }

  async function addEndorsement(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await apiRequest(`/api/admin/volunteers/${id}/endorsements`, {
        method: 'POST',
        body: JSON.stringify({
          skill_id: parseInt(endorseSkillId),
          rating: endorseRating,
          source: endorseBasedOn,
        }),
      })
      showToast('Skill endorsed!', 'success')
      setEndorseSkillId('')
      setEndorseRating('verified')
      setEndorseBasedOn('direct_observation')
      const updated = await apiRequest<VolunteerDetail>(`/api/admin/volunteers/${id}`)
      setVol(updated)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) return null

  if (loadingData) {
    return (
      <>
        <Header />
        <main className="max-w-350 mx-auto px-6 py-5 pb-15">
          <div className="text-center py-10 text-text-light">Loading…</div>
        </main>
      </>
    )
  }

  if (!vol) {
    return (
      <>
        <Header />
        <main className="max-w-350 mx-auto px-6 py-5 pb-15">
          <p style={{ color: 'var(--error)' }}>Volunteer not found.</p>
          <Button href="/volunteers" variant="secondary" style={{ marginTop: 16 }}>
            Back
          </Button>
        </main>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <div className="mb-4">
          <Link href="/volunteers" className="text-text-light">
            &larr; Back to Volunteers
          </Link>
        </div>

        {/* Profile header */}
        <div
          className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
          style={{ marginBottom: 24 }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 12,
            }}
          >
            <div>
              <h1 style={{ margin: '0 0 4px' }}>{vol.name}</h1>
              <p className="text-text-light" style={{ margin: 0 }}>
                {vol.email}
              </p>
            </div>
            <div className="flex gap-2">
              {vol.is_admin && (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: 'var(--primary-light, #e0f2fe)',
                    fontSize: '0.8rem',
                  }}
                >
                  Admin
                </span>
              )}
              {!vol.consent_make_profile_visible_in_directory && (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: 'var(--warning-bg, #fffbeb)',
                    fontSize: '0.8rem',
                  }}
                >
                  Profile Hidden
                </span>
              )}
            </div>
          </div>
          {vol.bio && <p style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{vol.bio}</p>}
        </div>

        {/* Skills and contact info */}
        <div
          className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
          style={{ marginBottom: 24 }}
        >
          <h3>Skills (Self-Assessed)</h3>
          {vol.skills.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {vol.skills.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center px-3 py-1 bg-accent text-secondary-dark rounded-full text-sm font-medium dark:bg-[#374151] dark:text-[#D1D5DB]"
                >
                  {s.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-text-light" style={{ marginBottom: 16 }}>
              No skills listed.
            </p>
          )}

          <h3>Verified Skills (Endorsed)</h3>
          <div id="endorsements" style={{ marginBottom: 16 }}>
            {vol.endorsements.length > 0 ? (
              vol.endorsements.map((e) => (
                <div
                  key={e.id}
                  style={{
                    padding: '6px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '0.875rem',
                  }}
                >
                  <strong>{e.skill_name}</strong> — {e.rating} · by {e.endorsed_by_name}
                </div>
              ))
            ) : (
              <p className="text-text-light">No endorsements yet.</p>
            )}
          </div>

          <h3>Contact Info</h3>
          <div id="contactInfo" className="text-sm">
            <p style={{ margin: '4px 0' }}>
              <strong>Email:</strong> {vol.email}
            </p>
            {vol.location && (
              <p style={{ margin: '4px 0' }}>
                <strong>Location:</strong> {vol.location}
              </p>
            )}
            {vol.local_group && (
              <p style={{ margin: '4px 0' }}>
                <strong>Local Group:</strong> {vol.local_group}
              </p>
            )}
            {vol.availability_hours_per_week && (
              <p style={{ margin: '4px 0' }}>
                <strong>Availability:</strong> {vol.availability_hours_per_week}h/week
              </p>
            )}
            {vol.discord_handle && (
              <p style={{ margin: '4px 0' }}>
                <strong>Discord:</strong> {vol.discord_handle}
              </p>
            )}
            {vol.signal_number && (
              <p style={{ margin: '4px 0' }}>
                <strong>Signal:</strong> {vol.signal_number}
              </p>
            )}
            {vol.whatsapp_number && (
              <p style={{ margin: '4px 0' }}>
                <strong>WhatsApp:</strong> {vol.whatsapp_number}
              </p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word">
          <Tabs
            role="tablist"
            tabs={
              [
                { key: 'admin_notes', label: 'Admin Notes' },
                { key: 'starter_tasks', label: 'Starter Tasks' },
                { key: 'project_history', label: 'Project History' },
                { key: 'endorse_skill', label: 'Endorse Skill' },
              ] as { key: Tab; label: string }[]
            }
            activeTab={activeTab}
            onChange={setActiveTab}
          />

          {/* Admin Notes tab */}
          {activeTab === 'admin_notes' && (
            <div>
              <div id="notesList">
                {vol.admin_notes.length === 0 && (
                  <p className="text-text-light" style={{ marginBottom: 16 }}>
                    No notes yet.
                  </p>
                )}
                {vol.admin_notes.map((n) => (
                  <div
                    key={n.id}
                    style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}
                  >
                    {editingNoteId === n.id ? (
                      <div>
                        <label
                          htmlFor={`edit-note-${n.id}`}
                          className="text-sm"
                          style={{ display: 'block', marginBottom: 4 }}
                        >
                          Edit note
                        </label>
                        <textarea
                          id={`edit-note-${n.id}`}
                          rows={3}
                          value={editingNoteContent}
                          onChange={(e) => setEditingNoteContent(e.target.value)}
                          style={{ width: '100%', marginBottom: 8 }}
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => saveEditedNote(n.id)}
                            disabled={submitting}
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingNoteId(null)
                              setEditingNoteContent('')
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                          }}
                        >
                          <div>
                            <span
                              style={{
                                fontSize: '0.8rem',
                                background: 'var(--bg-secondary, #f8fafc)',
                                padding: '1px 6px',
                                borderRadius: 8,
                              }}
                            >
                              {n.category.replace(/_/g, ' ')}
                            </span>
                            <span
                              className="text-text-light"
                              style={{ fontSize: '0.8rem', marginLeft: 8 }}
                            >
                              by {n.author_name}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setEditingNoteId(n.id)
                                setEditingNoteContent(n.content)
                              }}
                            >
                              Edit
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => deleteNote(n.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                        <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{n.content}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={addNote} style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                  <div className="mb-5" style={{ margin: 0 }}>
                    <label htmlFor="note-category">Category</label>
                    <select
                      id="note-category"
                      value={noteCategory}
                      onChange={(e) => setNoteCategory(e.target.value)}
                      style={{ width: 160 }}
                    >
                      {NOTE_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mb-5">
                  <label htmlFor="note-content">Note</label>
                  <textarea
                    id="note-content"
                    rows={3}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    required
                    placeholder="Add an admin note…"
                    style={{ width: '100%' }}
                  />
                </div>
                <Button type="submit" variant="secondary" disabled={submitting}>
                  Add Note
                </Button>
              </form>
            </div>
          )}

          {/* Starter Tasks tab */}
          {activeTab === 'starter_tasks' && (
            <div>
              {vol.starter_tasks.length === 0 ? (
                <p className="text-text-light">No starter tasks assigned yet.</p>
              ) : (
                vol.starter_tasks.map((t) => (
                  <div
                    key={t.id}
                    className="text-sm"
                    style={{
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>
                      {t.title}
                      {t.skill_name && ` (${t.skill_name})`}
                    </span>
                    <span className="text-text-light">
                      {t.status}
                      {t.review_rating && ` · ${t.review_rating}`}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Project History tab */}
          {activeTab === 'project_history' && (
            <div>
              {vol.project_history.length === 0 ? (
                <p className="text-text-light">No project history.</p>
              ) : (
                vol.project_history.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Link href={`/projects/${p.id}`} style={{ fontWeight: 500 }}>
                      {p.title}
                    </Link>
                    <div className="text-sm text-text-light">
                      {p.owner_id === vol.id ? 'owner' : 'proposer'} · {p.status.replace(/_/g, ' ')}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Endorse Skill tab */}
          {activeTab === 'endorse_skill' && (
            <div>
              <h3>Endorse a Skill</h3>
              <form
                onSubmit={addEndorsement}
                style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}
              >
                <div className="mb-5" style={{ margin: 0 }}>
                  <label htmlFor="endorse-skill">Skill</label>
                  <select
                    id="endorse-skill"
                    value={endorseSkillId}
                    onChange={(e) => setEndorseSkillId(e.target.value)}
                    required
                    style={{ width: '100%' }}
                  >
                    <option value="">Select skill…</option>
                    {flatSkills.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.category_name})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-5" style={{ margin: 0 }}>
                  <label htmlFor="endorse-rating">Rating</label>
                  <select
                    id="endorse-rating"
                    value={endorseRating}
                    onChange={(e) => setEndorseRating(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {RATING_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-5" style={{ margin: 0 }}>
                  <label htmlFor="endorse-based-on">Based On</label>
                  <select
                    id="endorse-based-on"
                    value={endorseBasedOn}
                    onChange={(e) => setEndorseBasedOn(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {BASED_ON_OPTIONS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Button type="submit" variant="secondary" disabled={submitting}>
                    Endorse Skill
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
