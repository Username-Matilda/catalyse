'use client'

import { useEffect, useState } from 'react'
import { apiRequest } from '@/lib/api'

interface Skill {
  id: number
  name: string
}

interface SkillCategory {
  id: number
  name: string
  skills: Skill[]
}

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

interface SkillPickerProps {
  value: SelectedSkill[]
  onChange: (skills: SelectedSkill[]) => void
  showProficiency?: boolean
}

export default function SkillPicker({ value, onChange, showProficiency = false }: SkillPickerProps) {
  const [categories, setCategories] = useState<SkillCategory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiRequest<SkillCategory[]>('/api/skills')
      .then(setCategories)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function toggle(skillId: number) {
    const existing = value.find(s => s.skillId === skillId)
    if (existing) {
      onChange(value.filter(s => s.skillId !== skillId))
    } else {
      onChange([...value, { skillId, proficiencyLevel: 'intermediate' }])
    }
  }

  function setProficiency(skillId: number, level: string) {
    onChange(value.map(s => s.skillId === skillId ? { ...s, proficiencyLevel: level } : s))
  }

  if (loading) return <div className="loading">Loading skills…</div>

  return (
    <div>
      {categories.map(cat => (
        <div key={cat.id} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--secondary-dark)' }}>{cat.name}</div>
          <div className="skill-options">
            {cat.skills.map(skill => {
              const selected = value.find(s => s.skillId === skill.id)
              return (
                <div key={skill.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className={`skill-option${selected ? ' selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={!!selected}
                      onChange={() => toggle(skill.id)}
                    />
                    {skill.name}
                  </label>
                  {showProficiency && selected && (
                    <select
                      value={selected.proficiencyLevel}
                      onChange={e => setProficiency(skill.id, e.target.value)}
                      style={{ fontSize: '0.75rem', padding: '2px 6px' }}
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="expert">Expert</option>
                    </select>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
