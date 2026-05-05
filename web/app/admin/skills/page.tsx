'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

interface Skill {
  id: number
  name: string
  description: string | null
  sort_order: number
  category_id: number
  category_name: string
}

interface Category {
  id: number
  name: string
  description: string | null
  sort_order: number
  skill_count: number
  skills: Skill[]
}

type ModalType =
  | { type: 'add-category' }
  | { type: 'add-skill'; categoryId: number; categoryName: string }
  | { type: 'edit-skill'; skill: Skill }
  | { type: 'delete-category'; id: number; name: string }
  | { type: 'delete-skill'; id: number; name: string }

export default function AdminSkillsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [modal, setModal] = useState<ModalType | null>(null)
  const [inputName, setInputName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.is_admin) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user?.is_admin) return
    loadData()
  }, [user])

  async function loadData() {
    setLoadingData(true)
    try {
      const [cats, skills] = await Promise.all([
        apiRequest<Category[]>('/api/admin/skill-categories'),
        apiRequest<Skill[]>('/api/skills/flat'),
      ])
      const catMap = new Map(cats.map(c => ({ ...c, skills: [] as Skill[] })).map(c => [c.id, c]))
      for (const s of skills) {
        catMap.get(s.category_id)?.skills.push(s)
      }
      setCategories(Array.from(catMap.values()))
    } catch {
      setAlert({ text: 'Failed to load data', type: 'error' })
    } finally {
      setLoadingData(false)
    }
  }

  function openModal(m: ModalType) {
    setModal(m)
    setInputName(m.type === 'edit-skill' ? m.skill.name : '')
    setAlert(null)
  }

  function closeModal() {
    setModal(null)
    setInputName('')
  }

  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await apiRequest('/api/admin/skill-categories', {
        method: 'POST',
        body: JSON.stringify({ name: inputName.trim() }),
      })
      setAlert({ text: 'Category created!', type: 'success' })
      closeModal()
      await loadData()
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed to create category', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveSkill(e: React.FormEvent) {
    e.preventDefault()
    if (!modal) return
    setSubmitting(true)
    try {
      if (modal.type === 'add-skill') {
        await apiRequest('/api/admin/skills', {
          method: 'POST',
          body: JSON.stringify({ name: inputName.trim(), category_id: modal.categoryId }),
        })
        setAlert({ text: 'Skill created!', type: 'success' })
      } else if (modal.type === 'edit-skill') {
        await apiRequest(`/api/admin/skills/${modal.skill.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: inputName.trim() }),
        })
        setAlert({ text: 'Skill updated!', type: 'success' })
      }
      closeModal()
      await loadData()
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed to save skill', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!modal) return
    setSubmitting(true)
    try {
      if (modal.type === 'delete-category') {
        await apiRequest(`/api/admin/skill-categories/${modal.id}`, { method: 'DELETE' })
        setAlert({ text: 'Category deleted!', type: 'success' })
      } else if (modal.type === 'delete-skill') {
        await apiRequest(`/api/admin/skills/${modal.id}`, { method: 'DELETE' })
        setAlert({ text: 'Skill deleted!', type: 'success' })
      }
      closeModal()
      await loadData()
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed to delete', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="container page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1>Skill Management</h1>
          <button role="button" className="btn btn-primary" onClick={() => openModal({ type: 'add-category' })}>
            + Add Category
          </button>
        </div>

        {alert && (
          <div role="alert" className={`message ${alert.type}`} style={{ marginBottom: 16 }}>
            {alert.text}
          </div>
        )}

        {loadingData ? (
          <div className="loading">Loading…</div>
        ) : (
          categories.map(cat => (
            <div key={cat.id} className="category-card card" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 role="heading">{cat.name}</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    role="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => openModal({ type: 'add-skill', categoryId: cat.id, categoryName: cat.name })}
                  >
                    + Add Skill
                  </button>
                  <button
                    role="button"
                    className="btn btn-small"
                    style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
                    onClick={() => openModal({ type: 'delete-category', id: cat.id, name: cat.name })}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {cat.skills.length === 0 ? (
                <p style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>No skills yet.</p>
              ) : (
                cat.skills.map(skill => (
                  <div key={skill.id} className="skill-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <h4 role="heading" style={{ margin: 0 }}>{skill.name}</h4>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        role="button"
                        className="btn btn-small btn-secondary"
                        onClick={() => openModal({ type: 'edit-skill', skill })}
                      >
                        Edit
                      </button>
                      <button
                        role="button"
                        className="btn btn-small"
                        style={{ color: 'var(--error)', borderColor: 'var(--error)' }}
                        onClick={() => openModal({ type: 'delete-skill', id: skill.id, name: skill.name })}
                      >
                        Del
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ))
        )}
      </main>

      {/* Add Category Modal */}
      {modal?.type === 'add-category' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={{ background: 'var(--card-bg, white)', borderRadius: 12, padding: 32, maxWidth: 480, width: '90%' }}>
            <h2 role="heading" style={{ marginBottom: 16 }}>Add Category</h2>
            <form onSubmit={handleSaveCategory}>
              <div className="form-group">
                <label htmlFor="cat-name">Category Name</label>
                <input id="cat-name" aria-label="Category Name" type="text" value={inputName} onChange={e => setInputName(e.target.value)} required autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>Save Category</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Skill Modal */}
      {(modal?.type === 'add-skill' || modal?.type === 'edit-skill') && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={{ background: 'var(--card-bg, white)', borderRadius: 12, padding: 32, maxWidth: 480, width: '90%' }}>
            <h2 role="heading" style={{ marginBottom: 16 }}>
              {modal.type === 'add-skill' ? 'Add Skill' : 'Edit Skill'}
            </h2>
            {modal.type === 'add-skill' && (
              <p style={{ color: 'var(--text-light)', marginBottom: 16 }}>Category: {modal.categoryName}</p>
            )}
            <form onSubmit={handleSaveSkill}>
              <div className="form-group">
                <label htmlFor="skill-name">Skill Name</label>
                <input id="skill-name" aria-label="Skill Name" type="text" value={inputName} onChange={e => setInputName(e.target.value)} required autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>Save Skill</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {(modal?.type === 'delete-category' || modal?.type === 'delete-skill') && (
        <div id="deleteModal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={{ background: 'var(--card-bg, white)', borderRadius: 12, padding: 32, maxWidth: 400, width: '90%' }}>
            <h2 role="heading" style={{ marginBottom: 8 }}>Confirm Delete</h2>
            <p style={{ marginBottom: 24, color: 'var(--text-light)' }}>
              Delete &ldquo;{modal.name}&rdquo;? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button
                type="button"
                className="btn"
                style={{ background: 'var(--error)', color: 'white' }}
                onClick={handleDelete}
                disabled={submitting}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
