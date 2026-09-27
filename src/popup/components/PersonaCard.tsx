import type { Persona } from '@/llm/types'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Input } from './ui/Input'

interface Props {
  persona: Persona
  onChange: (patch: Partial<Persona>) => void
  /** Start expanded (the full settings page), collapsed in the small popup. */
  defaultOpen?: boolean
}

const FIELDS: Array<{
  key: keyof Persona
  label: string
  placeholder: string
  textarea?: boolean
  rows?: number
  hint?: string
}> = [
  { key: 'name', label: 'Name', placeholder: 'Optional' },
  { key: 'role', label: 'Role', placeholder: 'e.g. Product Designer' },
  { key: 'expertise', label: 'Expertise', placeholder: 'One sentence on what you know best' },
  { key: 'industry', label: 'Industry', placeholder: 'Optional, e.g. fintech' },
  {
    key: 'voiceNotes',
    label: 'Voice notes',
    placeholder: 'e.g. British, dry humour, allergic to corporate jargon',
    textarea: true,
  },
  {
    key: 'voiceSamples',
    label: 'Voice samples',
    placeholder: 'Paste 3 to 5 comments you wrote yourself, one per line',
    textarea: true,
    rows: 4,
    hint: 'The AI copies how you write (length, tone, emoji), never what you said.',
  },
]

export function PersonaCard({ persona, onChange, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const filled = Object.values(persona).filter((v) => v.trim().length > 0).length

  return (
    <div className="rounded-card border border-line dark:border-line-dark overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
      >
        <span className="text-sm font-semibold text-ink dark:text-ink-dark">
          Persona{' '}
          <span className="font-normal text-muted dark:text-muted-dark">
            {filled > 0 ? `· ${filled}/${FIELDS.length} set` : '· optional'}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line dark:border-line-dark px-3.5 py-3">
          <p className="text-xs leading-snug text-muted dark:text-muted-dark">
            Shapes the angle of your comments. A designer notices design decisions; a CFO notices
            unit economics. All fields optional.
          </p>
          {FIELDS.map((f) => {
            const fieldId = `inlineai-persona-${String(f.key)}`
            return (
              <label key={f.key} className="block" htmlFor={fieldId}>
                <span className="mb-1.5 block text-xs font-medium text-muted dark:text-muted-dark">
                  {f.label}
                </span>
                {f.textarea ? (
                  <textarea
                    id={fieldId}
                    value={persona[f.key]}
                    placeholder={f.placeholder}
                    rows={f.rows ?? 2}
                    onChange={(e) => onChange({ [f.key]: e.target.value })}
                    className="w-full resize-none rounded bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark border border-line dark:border-line-dark px-3 py-2 text-sm placeholder:text-muted dark:placeholder:text-muted-dark focus:outline-none focus:border-accent"
                  />
                ) : (
                  <Input
                    id={fieldId}
                    value={persona[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => onChange({ [f.key]: e.target.value })}
                  />
                )}
                {f.hint && (
                  <span className="mt-1 block text-xs text-muted dark:text-muted-dark">
                    {f.hint}
                  </span>
                )}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
