import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean
}

const base =
  'w-full h-9 px-3 rounded bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark ' +
  'border border-line dark:border-line-dark text-sm placeholder:text-muted ' +
  'dark:placeholder:text-muted-dark focus:outline-none focus:border-accent ' +
  'dark:focus:border-accent transition-colors'

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { mono = false, className = '', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`${base} ${mono ? 'font-mono tracking-tight' : ''} ${className}`}
      {...props}
    />
  )
})
