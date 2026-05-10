import React from 'react'

export interface TabItem<T extends string = string> {
  key: T
  label: React.ReactNode
  'data-tab'?: string
  'aria-selected'?: boolean
}

interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[]
  activeTab: T
  onChange: (key: T) => void
  role?: string
  className?: string
}

export default function Tabs<T extends string = string>({ tabs, activeTab, onChange, role, className = 'mb-6' }: TabsProps<T>) {
  return (
    <div role={role} className={`flex border-b border-brand-border ${className}`}>
      {tabs.map(({ key, label, 'data-tab': dataTab }) => (
        <button
          key={key}
          role="tab"
          aria-selected={activeTab === key}
          data-tab={dataTab}
          className={`px-5 py-3 font-medium border-b-2 -mb-px cursor-pointer transition-colors ${
            activeTab === key
              ? 'active text-primary border-primary'
              : 'text-text-light border-transparent hover:text-brand-text'
          }`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
