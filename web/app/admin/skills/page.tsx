'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
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
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1>Skill Management</h1>
          <Button onClick={() => openModal({ type: 'add-category' })}>
            + Add Category
          </Button>
        </div>

        {alert && (
          <div role="alert" className={alert.type === 'success'
            ? 'flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] dark:bg-[#064E3B] dark:text-[#6EE7B7] dark:border-[#059669]'
            : 'flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]'}>
            {alert.text}
          </div>
        )}

        {loadingData ? (
          <div className="text-center py-10 text-text-light">Loading…</div>
        ) : (
          /* [test hook] category-card class used as test selector */
          categories.map(cat => (
            <div key={cat.id} className="category-card bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 role="heading">{cat.name}</h3>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openModal({ type: 'add-skill', categoryId: cat.id, categoryName: cat.name })}>
                    + Add Skill
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => openModal({ type: 'delete-category', id: cat.id, name: cat.name })}>
                    Delete
                  </Button>
                </div>
              </div>

              {cat.skills.length === 0 ? (
                <p className="text-text-light text-sm">No skills yet.</p>
              ) : (
                /* [test hook] role="listitem" allows getByRole('listitem') selection; skill-item class used as test selector */
                cat.skills.map(skill => (
                  <div key={skill.id} role="listitem" className="skill-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <h4 role="heading" style={{ margin: 0 }}>{skill.name}</h4>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openModal({ type: 'edit-skill', skill })}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => openModal({ type: 'delete-skill', id: skill.id, name: skill.name })}>
                        Del
                      </Button>
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
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 role="heading">Add Category</h2>
            </div>
            <div className="p-6">
              <form onSubmit={handleSaveCategory}>
                <div className="mb-5">
                  <label htmlFor="cat-name">Category Name</label>
                  <input id="cat-name" aria-label="Category Name" type="text" value={inputName} onChange={e => setInputName(e.target.value)} required autoFocus />
                </div>
                <div className="px-0 py-4 border-t border-brand-border flex gap-3 justify-end">
                  <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
                  <Button type="submit" disabled={submitting}>Save Category</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Skill Modal */}
      {(modal?.type === 'add-skill' || modal?.type === 'edit-skill') && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 role="heading">
                {modal.type === 'add-skill' ? 'Add Skill' : 'Edit Skill'}
              </h2>
            </div>
            <div className="p-6">
              {modal.type === 'add-skill' && (
                <p className="text-text-light mb-4">Category: {modal.categoryName}</p>
              )}
              <form onSubmit={handleSaveSkill}>
                <div className="mb-5">
                  <label htmlFor="skill-name">Skill Name</label>
                  <input id="skill-name" aria-label="Skill Name" type="text" value={inputName} onChange={e => setInputName(e.target.value)} required autoFocus />
                </div>
                <div className="px-0 py-4 border-t border-brand-border flex gap-3 justify-end">
                  <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
                  <Button type="submit" disabled={submitting}>Save Skill</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {(modal?.type === 'delete-category' || modal?.type === 'delete-skill') && (
        <div
          id="deleteModal"
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 role="heading">Confirm Delete</h2>
            </div>
            <div className="p-6">
              <p className="text-text-light mb-6">
                Delete &ldquo;{modal.name}&rdquo;? This cannot be undone.
              </p>
              <div className="px-0 py-4 border-t border-brand-border flex gap-3 justify-end">
                <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
                <Button type="button" variant="danger" onClick={handleDelete} disabled={submitting}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
