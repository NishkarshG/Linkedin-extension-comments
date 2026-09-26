import { hasHostAccess, providerHost, requestHostAccess } from '@/llm/permissions'
import { testConnection } from '@/llm/test-connection'
import { PROVIDERS, type Settings } from '@/llm/types'
import { Check, Eye, EyeOff, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
  const access = useHostAccess(settings)
  const host = providerHost(settings)

  async function runTest() {
    // Asking first keeps the click's user gesture; resolves at once if already granted.
    if (!(await requestHostAccess(settings))) {
      setStatus({ kind: 'err', msg: `Access to ${host} was not granted.` })
      return
    }
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
      {access === false && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-accent/30 bg-accent/5 px-3 py-2 text-xs leading-snug text-ink dark:text-ink-dark">
          <span className="min-w-0 break-words">
            InlineAI needs your permission to contact <strong>{host}</strong>.
          </span>
          <Button
            variant="secondary"
            onClick={() => void requestHostAccess(settings)}
            className="h-7 shrink-0 px-2 text-xs"
          >
            Allow access
          </Button>
        </div>
      )}
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

/** Whether the extension may call the selected provider; tracks grants live. */
function useHostAccess(settings: Settings): boolean | null {
  const [access, setAccess] = useState<boolean | null>(null)
  const { providerId, baseUrlOverride } = settings
  useEffect(() => {
    let alive = true
    const check = (): void => {
      hasHostAccess({ providerId, baseUrlOverride }).then((v) => {
        if (alive) setAccess(v)
      })
    }
    check()
    chrome.permissions.onAdded.addListener(check)
    chrome.permissions.onRemoved.addListener(check)
    return () => {
      alive = false
      chrome.permissions.onAdded.removeListener(check)
      chrome.permissions.onRemoved.removeListener(check)
    }
  }, [providerId, baseUrlOverride])
  return access
}
