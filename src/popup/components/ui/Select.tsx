import type { SelectHTMLAttributes } from 'react'

interface Option {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Option[]
}

const base =
  'w-full h-9 pl-3 pr-8 rounded bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark ' +
  'border border-line dark:border-line-dark text-sm focus:outline-none focus:border-accent ' +
  'dark:focus:border-accent transition-colors appearance-none cursor-pointer ' +
  "bg-[url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236F6F68' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")] " +
  'bg-no-repeat bg-[right_0.5rem_center]'

export function Select({ options, className = '', ...props }: SelectProps) {
  return (
    <select className={`${base} ${className}`} {...props}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
