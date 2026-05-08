'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  | { type: 'edit-category'; category: Category }
  | { type: 'add-skill'; categoryId: number; categoryName: string }
  | { type: 'edit-skill'; skill: Skill }
  | { type: 'delete-category'; id: number; name: string }
  | { type: 'delete-skill'; id: number; name: string }

function SortableSkill({
  skill,
  onEdit,
  onDelete,
}: {
  skill: Skill
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: skill.id })
  return (
    <div
      ref={setNodeRef}
      role="listitem"
      className="skill-item"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        background: 'var(--background)',
        borderRadius: 'var(--radius)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      <span {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--text-light)', flexShrink: 0, marginTop: 2, lineHeight: 1 }} title="Drag to reorder">⠿</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 role="heading" style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 700 }}>{skill.name}</h4>
        {skill.description && (
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-light)' }}>{skill.description}</p>
        )}
      </div>
      <div className="flex gap-1" style={{ flexShrink: 0 }}>
        <Button variant="secondary" size="sm" onClick={onEdit}>Edit</Button>
        <Button variant="danger" size="sm" onClick={onDelete}>Del</Button>
      </div>
    </div>
  )
}

function SortableCategory({
  cat,
  onEdit,
  onDelete,
  onAddSkill,
  onEditSkill,
  onDeleteSkill,
  onSkillsReorder,
}: {
  cat: Category
  onEdit: () => void
  onDelete: () => void
  onAddSkill: () => void
  onEditSkill: (skill: Skill) => void
  onDeleteSkill: (skill: Skill) => void
  onSkillsReorder: (categoryId: number, newSkills: Skill[]) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleSkillDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = cat.skills.findIndex(s => s.id === active.id)
    const newIndex = cat.skills.findIndex(s => s.id === over.id)
    const reordered = arrayMove(cat.skills, oldIndex, newIndex)
    onSkillsReorder(cat.id, reordered)
    apiRequest('/api/admin/skills/reorder', {
      method: 'PATCH',
      body: JSON.stringify(reordered.map((s, i) => ({ id: s.id, sort_order: i + 1 }))),
    }).catch(() => {})
  }

  return (
    <div
      ref={setNodeRef}
      className="category-card bg-surface rounded-xl shadow p-6 overflow-hidden wrap-break-word"
      style={{ marginBottom: 24, transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--text-light)', flexShrink: 0, marginTop: 4, lineHeight: 1, fontSize: '1.25rem' }} title="Drag to reorder">⠿</span>
          <div>
            <h3 role="heading">{cat.name}</h3>
            {cat.description && (
              <p className="text-text-light text-sm mt-1">{cat.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onEdit}>Edit</Button>
          <Button variant="danger" size="sm" onClick={onDelete}>Delete</Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSkillDragEnd}>
        <SortableContext items={cat.skills.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cat.skills.map(skill => (
              <SortableSkill
                key={skill.id}
                skill={skill}
                onEdit={() => onEditSkill(skill)}
                onDelete={() => onDeleteSkill(skill)}
              />
            ))}
            <button
              onClick={onAddSkill}
              style={{ border: '2px dashed var(--border)', background: 'transparent', borderRadius: 'var(--radius)', padding: '12px 16px', color: 'var(--text-light)', cursor: 'pointer', textAlign: 'center' }}
              className="hover:border-primary hover:text-primary hover:bg-accent transition-all"
            >
              + Add Skill
            </button>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

export default function AdminSkillsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [modal, setModal] = useState<ModalType | null>(null)
  const [inputName, setInputName] = useState('')
  const [inputDescription, setInputDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [alert, setAlert] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

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
    setInputName(m.type === 'edit-skill' ? m.skill.name : m.type === 'edit-category' ? m.category.name : '')
    setInputDescription(m.type === 'edit-skill' ? (m.skill.description ?? '') : m.type === 'edit-category' ? (m.category.description ?? '') : '')
    setAlert(null)
  }

  function closeModal() {
    setModal(null)
    setInputName('')
    setInputDescription('')
  }

  function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = categories.findIndex(c => c.id === active.id)
    const newIndex = categories.findIndex(c => c.id === over.id)
    const reordered = arrayMove(categories, oldIndex, newIndex)
    setCategories(reordered)
    apiRequest('/api/admin/skill-categories/reorder', {
      method: 'PATCH',
      body: JSON.stringify(reordered.map((c, i) => ({ id: c.id, sort_order: i + 1 }))),
    }).catch(() => {})
  }

  function handleSkillsReorder(categoryId: number, newSkills: Skill[]) {
    setCategories(cats =>
      cats.map(c => c.id === categoryId ? { ...c, skills: newSkills } : c)
    )
  }

  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!modal) return
    setSubmitting(true)
    try {
      const body = {
        name: inputName.trim(),
        description: inputDescription.trim() || null,
      }
      if (modal.type === 'edit-category') {
        await apiRequest(`/api/admin/skill-categories/${modal.category.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
        setAlert({ text: 'Category updated!', type: 'success' })
      } else {
        await apiRequest('/api/admin/skill-categories', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        setAlert({ text: 'Category created!', type: 'success' })
      }
      closeModal()
      await loadData()
    } catch (err: unknown) {
      setAlert({ text: err instanceof Error ? err.message : 'Failed to save category', type: 'error' })
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
          body: JSON.stringify({ name: inputName.trim(), description: inputDescription.trim() || null, category_id: modal.categoryId }),
        })
        setAlert({ text: 'Skill created!', type: 'success' })
      } else if (modal.type === 'edit-skill') {
        await apiRequest(`/api/admin/skills/${modal.skill.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: inputName.trim(), description: inputDescription.trim() || null }),
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1>Manage Skills</h1>
          <Button onClick={() => openModal({ type: 'add-category' })}>
            + Add Category
          </Button>
        </div>

        <p className="text-text-light mb-6">
          Manage skill categories and individual skills. These are used for volunteer profiles and project requirements.
        </p>

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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
            <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {/* [test hook] category-card class used as test selector */}
              {categories.map(cat => (
                <SortableCategory
                  key={cat.id}
                  cat={cat}
                  onEdit={() => openModal({ type: 'edit-category', category: cat })}
                  onDelete={() => openModal({ type: 'delete-category', id: cat.id, name: cat.name })}
                  onAddSkill={() => openModal({ type: 'add-skill', categoryId: cat.id, categoryName: cat.name })}
                  onEditSkill={skill => openModal({ type: 'edit-skill', skill })}
                  onDeleteSkill={skill => openModal({ type: 'delete-skill', id: skill.id, name: skill.name })}
                  onSkillsReorder={handleSkillsReorder}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </main>

      {/* Add/Edit Category Modal */}
      {(modal?.type === 'add-category' || modal?.type === 'edit-category') && (
        <div
          className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
              <h2 role="heading">{modal.type === 'edit-category' ? 'Edit Category' : 'Add Category'}</h2>
            </div>
            <div className="p-6">
              <form onSubmit={handleSaveCategory}>
                <div className="mb-5">
                  <label htmlFor="cat-name">Category Name</label>
                  <input id="cat-name" aria-label="Category Name" type="text" value={inputName} onChange={e => setInputName(e.target.value)} required autoFocus />
                </div>
                <div className="mb-5">
                  <label htmlFor="cat-description">Description</label>
                  <textarea id="cat-description" aria-label="Description" value={inputDescription} onChange={e => setInputDescription(e.target.value)} rows={3} />
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
                <div className="mb-5">
                  <label htmlFor="skill-description">Description</label>
                  <textarea id="skill-description" aria-label="Description" value={inputDescription} onChange={e => setInputDescription(e.target.value)} placeholder="What does this skill involve?" rows={3} />
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
