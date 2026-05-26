interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  id?: string
}

export function Toggle({ checked, onChange, label, id }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill transition-colors
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-accent ${checked ? 'bg-accent' : 'bg-line dark:bg-line-dark'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-pill bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
