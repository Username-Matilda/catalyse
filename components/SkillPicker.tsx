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

export default function SkillPicker({
  value,
  onChange,
  showProficiency = false,
}: SkillPickerProps) {
  const [categories, setCategories] = useState<SkillCategory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiRequest<SkillCategory[]>('/api/skills')
      .then(setCategories)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function toggle(skillId: number) {
    const existing = value.find((s) => s.skillId === skillId)
    if (existing) {
      onChange(value.filter((s) => s.skillId !== skillId))
    } else {
      onChange([...value, { skillId, proficiencyLevel: 'intermediate' }])
    }
  }

  function setProficiency(skillId: number, level: string) {
    onChange(value.map((s) => (s.skillId === skillId ? { ...s, proficiencyLevel: level } : s)))
  }

  if (loading) return <div className="loading">Loading skills…</div>

  return (
    <div>
      {categories.map((cat) => (
        <div key={cat.id} className="mb-4">
          <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--secondary-dark)' }}>
            {cat.name}
          </div>
          <div className="flex flex-wrap gap-2">
            {cat.skills.map((skill) => {
              const selected = value.find((s) => s.skillId === skill.id)
              return (
                <div key={skill.id} className="flex flex-col gap-1">
                  {/* [test hook] skill-option class used as test selector */}
                  <label
                    className={`skill-option relative inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-bg border-2 border-transparent rounded-full cursor-pointer transition-all text-sm select-none hover:bg-accent${selected ? ' bg-secondary! text-white! border-secondary-dark!' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={!!selected}
                      onChange={() => toggle(skill.id)}
                      className="absolute opacity-0 w-0 h-0 pointer-events-none"
                    />
                    {skill.name}
                  </label>
                  {showProficiency && selected && (
                    <select
                      value={selected.proficiencyLevel}
                      onChange={(e) => setProficiency(skill.id, e.target.value)}
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
