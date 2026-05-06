'use client'

import { useEffect, useRef, useState } from 'react'

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
  searchable?: boolean
}

export default function FilterDropdown({ id, label, ariaLabel, value, options, onChange, searchable }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
        setFocusedIndex(-1)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (open && searchable) inputRef.current?.focus()
  }, [open, searchable])

  useEffect(() => {
    setFocusedIndex(-1)
  }, [query])

  useEffect(() => {
    if (focusedIndex >= 0 && listboxRef.current) {
      const el = listboxRef.current.children[focusedIndex] as HTMLElement
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIndex])

  const selectedLabel = options.find(o => o.value === value)?.label ?? options[0]?.label

  const filtered = searchable && query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  function select(opt: FilterOption) {
    onChange(opt.value)
    setOpen(false)
    setQuery('')
    setFocusedIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(i => Math.min(i + 1, filtered.length - 1))
        break
      case 'Tab':
        e.preventDefault()
        if (e.shiftKey) {
          setFocusedIndex(i => Math.max(i - 1, 0))
        } else {
          setFocusedIndex(i => Math.min(i + 1, filtered.length - 1))
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (focusedIndex >= 0 && filtered[focusedIndex]) select(filtered[focusedIndex])
        break
      case 'Escape':
        setOpen(false)
        setQuery('')
        setFocusedIndex(-1)
        break
      case 'Backspace':
        if (searchable && query === '') {
          setOpen(false)
          setFocusedIndex(-1)
        }
        break
    }
  }

  const triggerClass = "w-full flex items-center justify-between p-3 bg-[var(--surface)] text-[var(--text)] border-2 border-[var(--border)] rounded-[var(--radius)] text-base font-[var(--font-body)] cursor-pointer focus:outline-none focus:border-[var(--secondary)] transition-colors"

  return (
    <div ref={ref} style={{ minWidth: 200 }}>
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <button
          type="button"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-activedescendant={focusedIndex >= 0 ? `${id}-opt-${focusedIndex}` : undefined}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={triggerClass}
          tabIndex={searchable && open ? -1 : 0}
        >
          <span className="flex-1 text-left">{selectedLabel}</span>
          <span className="ml-2 text-[var(--text-light)]">▾</span>
        </button>
        {searchable && open && (
          <input
            ref={inputRef}
            id={id}
            type="search"
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-activedescendant={focusedIndex >= 0 ? `${id}-opt-${focusedIndex}` : undefined}
            placeholder="Search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="absolute inset-0 m-0"
          />
        )}
        {open && (
          <div
            ref={listboxRef}
            role="listbox"
            className="absolute top-full left-0 mt-1 bg-surface border border-brand-border rounded-lg shadow-lg z-10 min-w-full py-1 max-h-72 overflow-y-auto"
          >
            {filtered.map((opt, i) => (
              <div
                key={opt.value}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={value === opt.value}
                onMouseDown={e => e.preventDefault()}
                onClick={() => select(opt)}
                className={`px-3 py-2 cursor-pointer rounded-md hover:bg-accent transition-colors text-sm ${value === opt.value || i === focusedIndex ? 'bg-accent' : ''} ${opt.indent ? 'pl-6' : ''}`}
              >
                {opt.label}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-text-light">No results</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
