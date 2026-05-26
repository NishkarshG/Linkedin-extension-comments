import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-1.5 rounded font-semibold text-sm leading-none ' +
  'h-9 px-3 transition-colors focus-visible:outline focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 ' +
  'disabled:cursor-not-allowed select-none'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary:
    'bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark border border-line ' +
    'dark:border-line-dark hover:border-accent dark:hover:border-accent',
  ghost: 'text-muted dark:text-muted-dark hover:text-ink dark:hover:text-ink-dark',
  danger: 'text-danger border border-line dark:border-line-dark hover:bg-danger/10',
}

export function Button({ variant = 'secondary', className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}
