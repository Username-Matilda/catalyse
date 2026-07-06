'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface FilterOption<T extends string = string> {
  value: T
  label: string
  indent?: boolean
  header?: boolean
}

export function useFilterOptions<const Options extends readonly FilterOption[]>(
  options: Options,
  initial: Options[number]['value'],
) {
  type Value = Options[number]['value']
  const [value, setValue] = useState<Value>(initial)
  const isValue = (v: string): v is Value => options.some((o) => o.value === v)
  return {
    value,
    onChange: (v: string) => {
      if (isValue(v)) setValue(v)
    },
    options,
  }
}

interface Props<T extends string = string> {
  id: string
  label: string
  ariaLabel: string
  value: T
  options: readonly FilterOption<T>[]
  onChange: (value: T) => void
  searchable?: boolean
}

export default function FilterDropdown<T extends string>({
  id,
  label,
  ariaLabel,
  value,
  options,
  onChange,
  searchable,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        ref.current &&
        !ref.current.contains(target) &&
        listboxRef.current &&
        !listboxRef.current.contains(target)
      ) {
        setOpen(false)
        setQuery('')
        setFocusedIndex(-1)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return
    function reposition() {
      const r = trigger!.getBoundingClientRect()
      setDropdownPos({
        top: r.bottom + window.scrollY,
        left: r.left + window.scrollX,
        width: r.width,
      })
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  useEffect(() => {
    if (open && searchable) inputRef.current?.focus()
  }, [open, searchable])

  useEffect(() => {
    if (focusedIndex >= 0 && listboxRef.current) {
      const el = listboxRef.current.children[focusedIndex] as HTMLElement
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIndex])

  const selectedLabel = options.find((o) => o.value === value)?.label ?? options[0]?.label

  const filtered =
    searchable && query
      ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
      : options

  function select(opt: FilterOption<T>) {
    if (opt.header) return
    onChange(opt.value)
    setOpen(false)
    setQuery('')
    setFocusedIndex(-1)
  }

  function nextSelectableIndex(from: number, direction: 1 | -1): number {
    let i = from + direction
    while (i >= 0 && i < filtered.length && filtered[i]?.header) i += direction
    return Math.max(0, Math.min(i, filtered.length - 1))
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
        setFocusedIndex((i) => nextSelectableIndex(i, 1))
        break
      case 'Tab':
        e.preventDefault()
        setFocusedIndex((i) => nextSelectableIndex(i, e.shiftKey ? -1 : 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex((i) => nextSelectableIndex(i, -1))
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

  const triggerClass =
    'w-full flex items-center justify-between p-3 bg-surface text-brand-text border-2 border-brand-border rounded-lg text-base font-body cursor-pointer focus:outline-none focus:border-secondary transition-colors'

  // min-w-[200px]: deliberate minimum to prevent dropdown from collapsing on short labels
  return (
    <div ref={ref} className="min-w-[200px]">
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-activedescendant={focusedIndex >= 0 ? `${id}-opt-${focusedIndex}` : undefined}
          onClick={() => {
            const rect = triggerRef.current!.getBoundingClientRect()
            setDropdownPos({
              top: rect.bottom + window.scrollY,
              left: rect.left + window.scrollX,
              width: rect.width,
            })
            setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          className={triggerClass}
          tabIndex={searchable && open ? -1 : 0}
        >
          <span className="flex-1 text-left">{selectedLabel}</span>
          <span className="ml-2 text-text-light">▾</span>
        </button>
        {searchable && open && (
          <input
            ref={inputRef}
            id={id}
            type="search"
            aria-label={ariaLabel}
            aria-haspopup="listbox"
            aria-activedescendant={focusedIndex >= 0 ? `${id}-opt-${focusedIndex}` : undefined}
            placeholder="Search…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setFocusedIndex(-1)
            }}
            onKeyDown={handleKeyDown}
            className="absolute inset-0 m-0"
          />
        )}
        {open &&
          createPortal(
            <div
              ref={listboxRef}
              role="listbox"
              style={{
                position: 'absolute',
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: dropdownPos.width,
                zIndex: 9999,
              }}
              className="mt-1 bg-surface border border-brand-border rounded-lg shadow-lg py-1 max-h-72 overflow-y-auto"
            >
              {filtered.map((opt, i) =>
                opt.header ? (
                  <div
                    key={opt.value}
                    role="presentation"
                    className="px-3 pt-2 pb-1 text-xs font-semibold text-text-light uppercase tracking-wide"
                  >
                    {opt.label}
                  </div>
                ) : (
                  <div
                    key={opt.value}
                    id={`${id}-opt-${i}`}
                    role="option"
                    aria-selected={value === opt.value}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => select(opt)}
                    className={`px-3 py-2 cursor-pointer rounded-md hover:bg-accent transition-colors text-sm ${value === opt.value || i === focusedIndex ? 'bg-accent' : ''} ${opt.indent ? 'pl-6' : ''}`}
                  >
                    {opt.label}
                  </div>
                ),
              )}
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-sm text-text-light">No results</div>
              )}
            </div>,
            document.body,
          )}
      </div>
    </div>
  )
}
