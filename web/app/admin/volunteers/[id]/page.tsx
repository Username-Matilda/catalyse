'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface Skill { id: number; name: string; category_name: string }
interface Endorsement {
  id: number; skill_id: number; skill_name: string; skill_category: string
  endorsed_by_name: string; rating: string; notes: string | null; created_at: string
}
interface AdminNote {
  id: number; content: string; category: string; author_name: string
  created_at: string; updated_at: string
}
interface StarterTask {
  id: number; title: string; status: string; skill_name: string | null; review_rating: string | null
}
interface ProjectHistory {
  id: number; title: string; status: string; owner_id: number | null; proposed_by_id: number | null
}
interface VolunteerDetail {
  id: number; name: string; email: string; bio: string | null
  location: string | null; local_group: string | null
  availability_hours_per_week: number | null
  discord_handle: string | null; signal_number: string | null; whatsapp_number: string | null
  profile_visible: boolean; consent_profile_visible: boolean
  is_admin: boolean; created_at: string
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
  const [vol, setVol] = useState<VolunteerDetail | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [flatSkills, setFlatSkills] = useState<Skill[]>([])
  const [alert, setAlert] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
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
    ]).then(([v, s]) => {
      setVol(v)
      setFlatSkills(s)
      setLoadingData(false)
    }).catch(() => setLoadingData(false))
  }, [user, id])

  function showAlert(text: string, type: 'success' | 'error') {
    setAlert({ text, type })
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await apiRequest(`/api/admin/volunteers/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: noteContent, category: noteCategory }),
      })
      showAlert('Note added.', 'success')
      setNoteContent('')
      setNoteCategory('general')
      const updated = await apiRequest<VolunteerDetail>(`/api/admin/volunteers/${id}`)
      setVol(updated)
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed', 'error')
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
      showAlert('Note updated.', 'success')
      setEditingNoteId(null)
      setEditingNoteContent('')
      const updated = await apiRequest<VolunteerDetail>(`/api/admin/volunteers/${id}`)
      setVol(updated)
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteNote(noteId: number) {
    if (!confirm('Delete this note?')) return
    try {
      await apiRequest(`/api/admin/notes/${noteId}`, { method: 'DELETE' })
      showAlert('Note deleted.', 'success')
      setVol(prev => prev ? { ...prev, admin_notes: prev.admin_notes.filter(n => n.id !== noteId) } : prev)
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed', 'error')
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
      showAlert('Skill endorsed!', 'success')
      setEndorseSkillId('')
      setEndorseRating('verified')
      setEndorseBasedOn('direct_observation')
      const updated = await apiRequest<VolunteerDetail>(`/api/admin/volunteers/${id}`)
      setVol(updated)
    } catch (err: unknown) {
      showAlert(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) return null

  if (loadingData) {
    return (
      <>
        <Header />
        <main className="container page"><div className="loading">Loading…</div></main>
      </>
    )
  }

  if (!vol) {
    return (
      <>
        <Header />
        <main className="container page">
          <p style={{ color: 'var(--error)' }}>Volunteer not found.</p>
          <Link href="/volunteers" className="btn btn-secondary" style={{ marginTop: 16 }}>Back</Link>
        </main>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="container page">
        <div style={{ marginBottom: 16 }}>
          <Link href="/volunteers" style={{ color: 'var(--text-light)' }}>&larr; Back to Volunteers</Link>
        </div>

        {alert && (
          <div role="alert" className={`message ${alert.type}`} style={{ marginBottom: 16 }}>
            {alert.text}
          </div>
        )}

        {/* Profile header */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <h1 style={{ margin: '0 0 4px' }}>{vol.name}</h1>
              <p style={{ margin: 0, color: 'var(--text-light)' }}>{vol.email}</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {vol.is_admin && <span style={{ padding: '2px 8px', borderRadius: 12, background: 'var(--primary-light, #e0f2fe)', fontSize: '0.8rem' }}>Admin</span>}
              {!vol.profile_visible && <span style={{ padding: '2px 8px', borderRadius: 12, background: 'var(--warning-bg, #fffbeb)', fontSize: '0.8rem' }}>Profile Hidden</span>}
            </div>
          </div>
          {vol.bio && <p style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{vol.bio}</p>}
        </div>

        {/* Skills and contact info */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h3>Skills (Self-Assessed)</h3>
          {vol.skills.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {vol.skills.map(s => <span key={s.id} className="skill-tag">{s.name}</span>)}
            </div>
          ) : (
            <p style={{ color: 'var(--text-light)', marginBottom: 16 }}>No skills listed.</p>
          )}

          <h3>Verified Skills (Endorsed)</h3>
          <div id="endorsements" style={{ marginBottom: 16 }}>
            {vol.endorsements.length > 0 ? vol.endorsements.map(e => (
              <div key={e.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                <strong>{e.skill_name}</strong> — {e.rating} · by {e.endorsed_by_name}
              </div>
            )) : (
              <p style={{ color: 'var(--text-light)' }}>No endorsements yet.</p>
            )}
          </div>

          <h3>Contact Info</h3>
          <div id="contactInfo" style={{ fontSize: '0.875rem' }}>
            <p style={{ margin: '4px 0' }}><strong>Email:</strong> {vol.email}</p>
            {vol.location && <p style={{ margin: '4px 0' }}><strong>Location:</strong> {vol.location}</p>}
            {vol.local_group && <p style={{ margin: '4px 0' }}><strong>Local Group:</strong> {vol.local_group}</p>}
            {vol.availability_hours_per_week && <p style={{ margin: '4px 0' }}><strong>Availability:</strong> {vol.availability_hours_per_week}h/week</p>}
            {vol.discord_handle && <p style={{ margin: '4px 0' }}><strong>Discord:</strong> {vol.discord_handle}</p>}
            {vol.signal_number && <p style={{ margin: '4px 0' }}><strong>Signal:</strong> {vol.signal_number}</p>}
            {vol.whatsapp_number && <p style={{ margin: '4px 0' }}><strong>WhatsApp:</strong> {vol.whatsapp_number}</p>}
          </div>
        </div>

        {/* Tabs */}
        <div className="card">
          <div role="tablist" style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
            {([
              { key: 'admin_notes', label: 'Admin Notes' },
              { key: 'starter_tasks', label: 'Starter Tasks' },
              { key: 'project_history', label: 'Project History' },
              { key: 'endorse_skill', label: 'Endorse Skill' },
            ] as { key: Tab; label: string }[]).map(tab => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
                  marginBottom: -2,
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-light)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Admin Notes tab */}
          {activeTab === 'admin_notes' && (
            <div>
              <div id="notesList">
                {vol.admin_notes.length === 0 && (
                  <p style={{ color: 'var(--text-light)', marginBottom: 16 }}>No notes yet.</p>
                )}
                {vol.admin_notes.map(n => (
                  <div key={n.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    {editingNoteId === n.id ? (
                      <div>
                        <label htmlFor={`edit-note-${n.id}`} style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem' }}>Edit note</label>
                        <textarea
                          id={`edit-note-${n.id}`}
                          rows={3}
                          value={editingNoteContent}
                          onChange={e => setEditingNoteContent(e.target.value)}
                          style={{ width: '100%', marginBottom: 8 }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-small btn-secondary" onClick={() => saveEditedNote(n.id)} disabled={submitting}>Save</button>
                          <button className="btn btn-small" onClick={() => { setEditingNoteId(null); setEditingNoteContent('') }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <span style={{ fontSize: '0.8rem', background: 'var(--bg-secondary, #f8fafc)', padding: '1px 6px', borderRadius: 8 }}>{n.category.replace(/_/g, ' ')}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginLeft: 8 }}>by {n.author_name}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="btn btn-small btn-secondary"
                              onClick={() => { setEditingNoteId(n.id); setEditingNoteContent(n.content) }}
                            >Edit</button>
                            <button
                              className="btn btn-small"
                              style={{ color: 'var(--error)' }}
                              onClick={() => deleteNote(n.id)}
                            >Delete</button>
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
                  <div className="form-group" style={{ margin: 0 }}>
                    <label htmlFor="note-category">Category</label>
                    <select id="note-category" value={noteCategory} onChange={e => setNoteCategory(e.target.value)} style={{ width: 160 }}>
                      {NOTE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="note-content">Note</label>
                  <textarea id="note-content" rows={3} value={noteContent} onChange={e => setNoteContent(e.target.value)} required placeholder="Add an admin note…" style={{ width: '100%' }} />
                </div>
                <button type="submit" className="btn btn-secondary" disabled={submitting}>Add Note</button>
              </form>
            </div>
          )}

          {/* Starter Tasks tab */}
          {activeTab === 'starter_tasks' && (
            <div>
              {vol.starter_tasks.length === 0 ? (
                <p style={{ color: 'var(--text-light)' }}>No starter tasks assigned yet.</p>
              ) : (
                vol.starter_tasks.map(t => (
                  <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                    <span>{t.title}{t.skill_name && ` (${t.skill_name})`}</span>
                    <span style={{ color: 'var(--text-light)' }}>
                      {t.status}{t.review_rating && ` · ${t.review_rating}`}
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
                <p style={{ color: 'var(--text-light)' }}>No project history.</p>
              ) : (
                vol.project_history.map(p => (
                  <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                    <Link href={`/projects/${p.id}`} style={{ fontWeight: 500 }}>{p.title}</Link>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
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
              <form onSubmit={addEndorsement} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="endorse-skill">Skill</label>
                  <select id="endorse-skill" value={endorseSkillId} onChange={e => setEndorseSkillId(e.target.value)} required style={{ width: '100%' }}>
                    <option value="">Select skill…</option>
                    {flatSkills.map(s => <option key={s.id} value={s.id}>{s.name} ({s.category_name})</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="endorse-rating">Rating</label>
                  <select id="endorse-rating" value={endorseRating} onChange={e => setEndorseRating(e.target.value)} style={{ width: '100%' }}>
                    {RATING_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="endorse-based-on">Based On</label>
                  <select id="endorse-based-on" value={endorseBasedOn} onChange={e => setEndorseBasedOn(e.target.value)} style={{ width: '100%' }}>
                    {BASED_ON_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                </div>
                <div>
                  <button type="submit" className="btn btn-secondary" disabled={submitting}>Endorse Skill</button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
