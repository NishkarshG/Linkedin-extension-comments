import { testConnection } from '@/llm/test-connection'
import { PROVIDERS, type Settings } from '@/llm/types'
import { Check, Eye, EyeOff, Loader2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'

interface Props {
  settings: Settings
  onChange: (apiKey: string) => void
}

type Status =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; msg: string }
  | { kind: 'err'; msg: string }

export function ApiKeyInput({ settings, onChange }: Props) {
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const abortRef = useRef<AbortController | null>(null)
  const meta = PROVIDERS[settings.providerId]

  async function runTest() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus({ kind: 'testing' })
    const result = await testConnection(settings, controller.signal)
    if (controller.signal.aborted) return
    setStatus(
      result.ok ? { kind: 'ok', msg: result.message } : { kind: 'err', msg: result.message },
    )
  }

  return (
    <div className="space-y-2">
      {meta.requiresKey ? (
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted dark:text-muted-dark">
            API key
          </span>
          <div className="relative">
            <Input
              mono
              type={show ? 'text' : 'password'}
              value={settings.apiKey}
              placeholder="sk-…"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => {
                onChange(e.target.value)
                setStatus({ kind: 'idle' })
              }}
              className="pr-9"
            />
            <button
              type="button"
              aria-label={show ? 'Hide API key' : 'Show API key'}
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink dark:hover:text-ink-dark"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
      ) : (
        <p className="rounded bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark px-3 py-2 text-xs leading-snug text-muted dark:text-muted-dark">
          No API key needed for a local model. Make sure Ollama is running.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={runTest}
          disabled={status.kind === 'testing'}
          className="h-8 px-2.5 text-xs"
        >
          {status.kind === 'testing' ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Testing…
            </>
          ) : (
            'Test connection'
          )}
        </Button>
        {status.kind === 'ok' && (
          <span className="flex items-center gap-1 text-xs text-accent">
            <Check size={14} /> {status.msg}
          </span>
        )}
        {status.kind === 'err' && (
          <span className="flex items-center gap-1 text-xs text-danger">
            <X size={14} /> {status.msg}
          </span>
        )}
        {meta.keyHelpUrl && status.kind === 'idle' && (
          <a
            href={meta.keyHelpUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent hover:underline"
          >
            Get a key
          </a>
        )}
      </div>
    </div>
  )
}
