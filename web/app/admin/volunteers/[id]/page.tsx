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

const NOTE_CATEGORIES = ['general', 'skill_feedback', 'reliability', 'fit']

export default function AdminVolunteerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user, loading } = useAuth()
  const [vol, setVol] = useState<VolunteerDetail | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [flatSkills, setFlatSkills] = useState<Skill[]>([])
  const [alert, setAlert] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Note form
  const [noteContent, setNoteContent] = useState('')
  const [noteCategory, setNoteCategory] = useState('general')
  const [editingNote, setEditingNote] = useState<AdminNote | null>(null)

  // Endorsement form
  const [endorseSkillId, setEndorseSkillId] = useState('')
  const [endorseRating, setEndorseRating] = useState('verified')

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

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (editingNote) {
        await apiRequest(`/api/admin/notes/${editingNote.id}`, {
          method: 'PUT',
          body: JSON.stringify({ content: noteContent, category: noteCategory }),
        })
        setAlert({ text: 'Note updated', type: 'success' })
        setEditingNote(null)
      } else {
        await apiRequest(`/api/admin/volunteers/${id}/notes`, {
          method: 'POST',
          body: JSON.stringify({ content: noteContent, category: noteCategory }),
        })
        setAlert({ text: 'Note added', type: 'success' })
      }
      setNoteContent(''); setNoteCategory('general')
      const updated = await apiRequest<VolunteerDetail>(`/api/admin/volunteers/${id}`)
      setVol(updated)
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteNote(noteId: number) {
    if (!confirm('Delete this note?')) return
    try {
      await apiRequest(`/api/admin/notes/${noteId}`, { method: 'DELETE' })
      setAlert({ text: 'Note deleted', type: 'success' })
      setVol(prev => prev ? { ...prev, admin_notes: prev.admin_notes.filter(n => n.id !== noteId) } : prev)
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed', type: 'error' })
    }
  }

  async function addEndorsement(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await apiRequest(`/api/admin/volunteers/${id}/endorsements`, {
        method: 'POST',
        body: JSON.stringify({ skill_id: parseInt(endorseSkillId), rating: endorseRating }),
      })
      setAlert({ text: 'Endorsement added', type: 'success' })
      setEndorseSkillId(''); setEndorseRating('verified')
      const updated = await apiRequest<VolunteerDetail>(`/api/admin/volunteers/${id}`)
      setVol(updated)
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed', type: 'error' })
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

        {/* Profile */}
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

          {vol.bio && <p style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{vol.bio}</p>}

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.875rem', color: 'var(--text-light)', marginBottom: 12 }}>
            {vol.location && <span>📍 {vol.location}</span>}
            {vol.local_group && <span>👥 {vol.local_group}</span>}
            {vol.availability_hours_per_week && <span>⏱ {vol.availability_hours_per_week}h/week</span>}
            {vol.discord_handle && <span>Discord: {vol.discord_handle}</span>}
          </div>

          {vol.skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {vol.skills.map(s => <span key={s.id} className="skill-tag">{s.name}</span>)}
            </div>
          )}
        </div>

        {/* Endorsements */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2>Skill Endorsements</h2>
          {vol.endorsements.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              {vol.endorsements.map(e => (
                <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                  <strong>{e.skill_name}</strong> — {e.rating} · by {e.endorsed_by_name}
                  {e.notes && <p style={{ margin: '2px 0 0', color: 'var(--text-light)', fontStyle: 'italic' }}>{e.notes}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-light)', marginBottom: 16 }}>No endorsements yet.</p>
          )}
          <form onSubmit={addEndorsement} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, margin: 0, minWidth: 180 }}>
              <label htmlFor="endorse-skill">Skill</label>
              <select id="endorse-skill" value={endorseSkillId} onChange={e => setEndorseSkillId(e.target.value)} required style={{ width: '100%' }}>
                <option value="">Select skill…</option>
                {flatSkills.map(s => <option key={s.id} value={s.id}>{s.name} ({s.category_name})</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="endorse-rating">Rating</label>
              <select id="endorse-rating" value={endorseRating} onChange={e => setEndorseRating(e.target.value)} style={{ width: 140 }}>
                <option value="verified">Verified</option>
                <option value="strong">Strong</option>
              </select>
            </div>
            <button type="submit" className="btn btn-secondary" disabled={submitting}>Add Endorsement</button>
          </form>
        </div>

        {/* Admin Notes */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2>Admin Notes</h2>
          {vol.admin_notes.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              {vol.admin_notes.map(n => (
                <div key={n.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '0.8rem', background: 'var(--bg-secondary, #f8fafc)', padding: '1px 6px', borderRadius: 8 }}>{n.category}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginLeft: 8 }}>by {n.author_name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-small btn-secondary" onClick={() => { setEditingNote(n); setNoteContent(n.content); setNoteCategory(n.category) }}>Edit</button>
                      <button className="btn btn-small" style={{ color: 'var(--error)' }} onClick={() => deleteNote(n.id)}>Delete</button>
                    </div>
                  </div>
                  <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{n.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-light)', marginBottom: 16 }}>No notes yet.</p>
          )}

          <form onSubmit={addNote}>
            {editingNote && (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginBottom: 8 }}>
                Editing note from {editingNote.author_name}{' '}
                <button type="button" onClick={() => { setEditingNote(null); setNoteContent(''); setNoteCategory('general') }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}>Cancel</button>
              </p>
            )}
            <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="note-category">Category</label>
                <select id="note-category" value={noteCategory} onChange={e => setNoteCategory(e.target.value)} style={{ width: 160 }}>
                  {NOTE_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="note-content">Note</label>
              <textarea id="note-content" rows={3} value={noteContent} onChange={e => setNoteContent(e.target.value)} required placeholder="Add an admin note…" style={{ width: '100%' }} />
            </div>
            <button type="submit" className="btn btn-secondary" disabled={submitting}>
              {editingNote ? 'Update Note' : 'Add Note'}
            </button>
          </form>
        </div>

        {/* Starter Tasks */}
        {vol.starter_tasks.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h2>Starter Tasks</h2>
            {vol.starter_tasks.map(t => (
              <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span>{t.title}{t.skill_name && ` (${t.skill_name})`}</span>
                <span style={{ color: 'var(--text-light)' }}>
                  {t.status}{t.review_rating && ` · ${t.review_rating}`}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Project History */}
        {vol.project_history.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h2>Project History</h2>
            {vol.project_history.map(p => (
              <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <Link href={`/projects/${p.id}`} style={{ fontWeight: 500 }}>{p.title}</Link>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                  {p.owner_id === vol.id ? 'owner' : 'proposer'} · {p.status.replace(/_/g, ' ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
