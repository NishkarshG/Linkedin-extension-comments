import { PROVIDERS } from '@/llm/types'
import type { ProviderId } from '@/shared/types'
import { REPO_URL } from '@/shared/types'
import { resetSettings } from '@/storage/storage'
import { ExternalLink, Settings2, Sparkles } from 'lucide-react'
import { ApiKeyInput } from './components/ApiKeyInput'
import { ModelSelect } from './components/ModelSelect'
import { PersonaCard } from './components/PersonaCard'
import { ProviderSelect } from './components/ProviderSelect'
import { Button } from './components/ui/Button'
import { useSettings } from './useSettings'

export default function App() {
  const { settings, loaded, update } = useSettings()
  const meta = PROVIDERS[settings.providerId]
  const needsKey = meta.requiresKey && settings.apiKey.trim().length === 0

  function openOptions() {
    chrome.runtime.openOptionsPage()
  }

  async function handleReset() {
    if (!confirm('Reset all InlineAI settings, including your API key?')) return
    await resetSettings()
    await update({})
  }

  return (
    <div className="w-[360px] bg-canvas text-ink dark:bg-canvas-dark dark:text-ink-dark">
      <header className="flex items-center gap-2 border-b border-line dark:border-line-dark px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-accent/10 text-accent">
          <Sparkles size={16} />
        </span>
        <div className="leading-tight">
          <h1 className="text-base font-semibold">InlineAI</h1>
          <p className="text-xs text-muted dark:text-muted-dark">
            Personalised LinkedIn comments · BYO key
          </p>
        </div>
        <button
          type="button"
          onClick={openOptions}
          aria-label="Open full settings"
          className="ml-auto text-muted hover:text-ink dark:hover:text-ink-dark"
        >
          <Settings2 size={18} />
        </button>
      </header>

      <div className="space-y-4 px-4 py-4">
        {loaded && needsKey && (
          <div className="rounded-card border border-accent/30 bg-accent/5 px-3.5 py-3 text-sm text-ink dark:text-ink-dark">
            Add your API key to get started. Your key is stored only on this device.
          </div>
        )}

        <ProviderSelect
          value={settings.providerId}
          onChange={(providerId: ProviderId) => update({ providerId, model: '' })}
        />
        <ModelSelect
          provider={settings.providerId}
          model={settings.model}
          onChange={(model) => update({ model })}
        />
        <ApiKeyInput settings={settings} onChange={(apiKey) => update({ apiKey })} />
        <PersonaCard persona={settings.persona} onChange={(patch) => update({ persona: patch })} />
      </div>

      <footer className="flex items-center gap-3 border-t border-line dark:border-line-dark px-4 py-3 text-xs">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-muted hover:text-ink dark:hover:text-ink-dark"
        >
          GitHub <ExternalLink size={12} />
        </a>
        <button
          type="button"
          onClick={openOptions}
          className="text-muted hover:text-ink dark:hover:text-ink-dark"
        >
          What's sent / skill
        </button>
        <Button
          variant="ghost"
          onClick={handleReset}
          className="ml-auto h-7 px-2 text-xs text-danger"
        >
          Reset
        </Button>
      </footer>
    </div>
  )
}
