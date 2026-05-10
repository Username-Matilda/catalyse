import type { ComponentPropsWithoutRef, ReactNode } from 'react'

type CheckboxProps = Omit<ComponentPropsWithoutRef<'input'>, 'type'> & {
  children?: ReactNode
}

export default function Checkbox({ children, ...props }: CheckboxProps) {
  return (
    <label
      className="items-center gap-2 cursor-pointer"
      style={{ display: 'flex', fontWeight: 400, marginBottom: 0 }}
    >
      <span className="relative flex-shrink-0">
        <input type="checkbox" className="sr-only peer" {...props} />
        <span className="block w-5 h-5 rounded border-2 border-brand-border dark:border-secondary bg-surface peer-checked:bg-primary peer-checked:border-primary dark:peer-checked:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 transition-colors" />
        <span className="absolute inset-0 flex items-center justify-center text-white dark:text-[#111827] text-xs font-bold opacity-0 peer-checked:opacity-100 pointer-events-none select-none">
          ✓
        </span>
      </span>
      {children != null && <span>{children}</span>}
    </label>
  )
}
