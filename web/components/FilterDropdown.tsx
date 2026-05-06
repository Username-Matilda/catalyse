'use client'

import { useEffect, useRef, useState } from 'react'
import Button from '@/components/Button'

export interface FilterOption {
  value: string
  label: string
  indent?: boolean
}

interface Props {
  id: string
  label: string
  ariaLabel: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}


export default function FilterDropdown({ id, label, ariaLabel, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selectedLabel = options.find(o => o.value === value)?.label ?? options[0]?.label

  return (
    <div ref={ref} style={{ minWidth: 150 }}>
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <Button
          id={id}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen(o => !o)}
          variant="outline"
          size="sm"
          style={{ width: '100%' }}
        >
          <span className="flex-1 text-left">{selectedLabel}</span>
          {' ▾'}
        </Button>
        {open && (
          <div
            role="listbox"
            className="absolute top-full left-0 mt-1 bg-surface border border-brand-border rounded-lg shadow-lg z-10 min-w-full py-1 max-h-72 overflow-y-auto"
          >
            {options.map(opt => (
              <div
                key={opt.value}
                role="option"
                aria-selected={value === opt.value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`px-3 py-2 cursor-pointer rounded-md hover:bg-accent transition-colors text-sm ${value === opt.value ? 'bg-accent' : ''} ${opt.indent ? 'pl-6' : ''}`}
              >
                {opt.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
