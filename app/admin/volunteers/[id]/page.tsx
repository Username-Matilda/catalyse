'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import Tabs from '@/components/Tabs'
import { useAuth } from '@/lib/auth-context'
import { client } from '@/lib/client'
import { useToast } from '@/lib/toast'

interface Skill {
  id: number
  name: string
  categoryName: string
}
interface Endorsement {
  id: number
  skillId: number
  skillName: string
  skillCategory: string
  endorsedByName: string
  rating: string
  notes: string | null
  createdAt: string
}
interface AdminNote {
  id: number
  content: string
  category: string
  authorName: string
  createdAt: string
  updatedAt: string
}
interface StarterTask {
  id: number
  title: string
  status: string
  skillName: string | null
  reviewRating: string | null
}
interface ProjectHistory {
  id: number
  title: string
  status: string
  ownerId: number | null
  proposedById: number | null
}
interface VolunteerDetail {
  id: number
  name: string
  email: string
  bio: string | null
  location: string | null
  localGroup: string | null
  availabilityHoursPerWeek: number | null
  discordHandle: string | null
  signalNumber: string | null
  whatsappNumber: string | null
  consentMakeProfileVisibleInDirectory: boolean
  isAdmin: boolean
  createdAt: string
  skills: Skill[]
  endorsements: Endorsement[]
  adminNotes: AdminNote[]
  starterTasks: StarterTask[]
  projectHistory: ProjectHistory[]
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
    if (!loading && user && !user.isAdmin) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user?.isAdmin) return
    Promise.all([
      client.admin.volunteers.getById({ id: Number(id) }) as unknown as Promise<VolunteerDetail>,
      client.skills.flat() as unknown as Promise<Skill[]>,
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
      await client.admin.notes.create({
        volunteerId: Number(id),
        content: noteContent,
        category: noteCategory,
      })
      showToast('Note added.', 'success')
      setNoteContent('')
      setNoteCategory('general')
      const updated = (await client.admin.volunteers.getById({
        id: Number(id),
      })) as unknown as VolunteerDetail
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
      await client.admin.notes.update({ id: noteId, content: editingNoteContent })
      showToast('Note updated.', 'success')
      setEditingNoteId(null)
      setEditingNoteContent('')
      const updated = (await client.admin.volunteers.getById({
        id: Number(id),
      })) as unknown as VolunteerDetail
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
      await client.admin.notes.delete({ id: noteId })
      showToast('Note deleted.', 'success')
      setVol((prev) =>
        prev ? { ...prev, adminNotes: prev.adminNotes.filter((n) => n.id !== noteId) } : prev,
      )
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error')
    }
  }

  async function addEndorsement(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await client.admin.volunteers.addEndorsement({
        volunteerId: Number(id),
        skillId: parseInt(endorseSkillId),
        rating: endorseRating,
        source: endorseBasedOn,
      })
      showToast('Skill endorsed!', 'success')
      setEndorseSkillId('')
      setEndorseRating('verified')
      setEndorseBasedOn('direct_observation')
      const updated = (await client.admin.volunteers.getById({
        id: Number(id),
      })) as unknown as VolunteerDetail
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
        <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
          <div className="text-center py-10 text-text-light">Loading…</div>
        </main>
      </>
    )
  }

  if (!vol) {
    return (
      <>
        <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
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
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
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
              {vol.isAdmin && (
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
              {!vol.consentMakeProfileVisibleInDirectory && (
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
                  <strong>{e.skillName}</strong> — {e.rating} · by {e.endorsedByName}
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
            {vol.localGroup && (
              <p style={{ margin: '4px 0' }}>
                <strong>Local Group:</strong> {vol.localGroup}
              </p>
            )}
            {vol.availabilityHoursPerWeek && (
              <p style={{ margin: '4px 0' }}>
                <strong>Availability:</strong> {vol.availabilityHoursPerWeek}h/week
              </p>
            )}
            {vol.discordHandle && (
              <p style={{ margin: '4px 0' }}>
                <strong>Discord:</strong> {vol.discordHandle}
              </p>
            )}
            {vol.signalNumber && (
              <p style={{ margin: '4px 0' }}>
                <strong>Signal:</strong> {vol.signalNumber}
              </p>
            )}
            {vol.whatsappNumber && (
              <p style={{ margin: '4px 0' }}>
                <strong>WhatsApp:</strong> {vol.whatsappNumber}
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
                {vol.adminNotes.length === 0 && (
                  <p className="text-text-light" style={{ marginBottom: 16 }}>
                    No notes yet.
                  </p>
                )}
                {vol.adminNotes.map((n) => (
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
                              by {n.authorName}
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
                    <FilterDropdown
                      id="note-category"
                      label="Category"
                      ariaLabel="Category"
                      value={noteCategory}
                      options={NOTE_CATEGORIES}
                      onChange={(v) => setNoteCategory(v)}
                    />
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
              {vol.starterTasks.length === 0 ? (
                <p className="text-text-light">No starter tasks assigned yet.</p>
              ) : (
                vol.starterTasks.map((t) => (
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
                      {t.skillName && ` (${t.skillName})`}
                    </span>
                    <span className="text-text-light">
                      {t.status}
                      {t.reviewRating && ` · ${t.reviewRating}`}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Project History tab */}
          {activeTab === 'project_history' && (
            <div>
              {vol.projectHistory.length === 0 ? (
                <p className="text-text-light">No project history.</p>
              ) : (
                vol.projectHistory.map((p) => (
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
                      {p.ownerId === vol.id ? 'owner' : 'proposer'} · {p.status.replace(/_/g, ' ')}
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
                  <FilterDropdown
                    id="endorse-skill"
                    label="Skill"
                    ariaLabel="Skill"
                    value={endorseSkillId}
                    options={[
                      { value: '', label: 'Select skill…' },
                      ...flatSkills.map((s) => ({
                        value: String(s.id),
                        label: `${s.name} (${s.categoryName})`,
                      })),
                    ]}
                    onChange={(v) => setEndorseSkillId(v)}
                    searchable
                  />
                </div>
                <div className="mb-5" style={{ margin: 0 }}>
                  <FilterDropdown
                    id="endorse-rating"
                    label="Rating"
                    ariaLabel="Rating"
                    value={endorseRating}
                    options={RATING_OPTIONS}
                    onChange={(v) => setEndorseRating(v)}
                  />
                </div>
                <div className="mb-5" style={{ margin: 0 }}>
                  <FilterDropdown
                    id="endorse-based-on"
                    label="Based On"
                    ariaLabel="Based On"
                    value={endorseBasedOn}
                    options={BASED_ON_OPTIONS}
                    onChange={(v) => setEndorseBasedOn(v)}
                  />
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
