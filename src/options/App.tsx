import { BUNDLED_SYSTEM_PROMPT } from '@/llm/prompt'
import { ApiKeyInput } from '@/popup/components/ApiKeyInput'
import { ModelSelect } from '@/popup/components/ModelSelect'
import { PersonaCard } from '@/popup/components/PersonaCard'
import { ProviderSelect } from '@/popup/components/ProviderSelect'
import { Button } from '@/popup/components/ui/Button'
import { Input } from '@/popup/components/ui/Input'
import { Toggle } from '@/popup/components/ui/Toggle'
import { useSettings } from '@/popup/useSettings'
import type { ProviderId } from '@/shared/types'
import { REPO_URL } from '@/shared/types'
import { resetSettings } from '@/storage/storage'
import { Check, Copy, RotateCcw, Sparkles } from 'lucide-react'
import { type ReactNode, useState } from 'react'

function Section({
  title,
  description,
  children,
}: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line dark:border-line-dark bg-canvas dark:bg-canvas-dark p-5">
      <h2 className="text-base font-semibold text-ink dark:text-ink-dark">{title}</h2>
      {description && (
        <p className="mt-1 text-sm leading-snug text-muted dark:text-muted-dark">{description}</p>
      )}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-ink dark:text-ink-dark">{label}</p>
        <p className="text-xs leading-snug text-muted dark:text-muted-dark">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

export default function App() {
  const { settings, update } = useSettings()
  const [copied, setCopied] = useState(false)

  const effectivePrompt = settings.customSystemPrompt.trim() || BUNDLED_SYSTEM_PROMPT
  const usingCustom = settings.customSystemPrompt.trim().length > 0

  async function copySkill() {
    await navigator.clipboard.writeText(BUNDLED_SYSTEM_PROMPT)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleReset() {
    if (!confirm('Reset all InlineAI settings, including your API key?')) return
    await resetSettings()
    await update({})
  }

  return (
    <div className="min-h-screen bg-canvas text-ink dark:bg-canvas-dark dark:text-ink-dark">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <header className="mb-8 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-card bg-accent/10 text-accent">
            <Sparkles size={18} />
          </span>
          <div>
            <h1 className="text-xl font-semibold">InlineAI for LinkedIn</h1>
            <p className="text-sm text-muted dark:text-muted-dark">
              Settings · open-source · bring-your-own-key
            </p>
          </div>
        </header>

        <div className="space-y-5">
          <Section
            title="AI provider"
            description="You pay your provider directly. Your API key is stored only in this browser, never synced or sent anywhere except the provider you choose."
          >
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
          </Section>

          <Section
            title="Persona"
            description="Optional. Shapes the angle of your comments so they sound like you."
          >
            <PersonaCard
              persona={settings.persona}
              onChange={(patch) => update({ persona: patch })}
            />
          </Section>

          <Section title="Advanced">
            <ToggleRow
              label="Stream the comment"
              description="Type the comment into the box as it generates."
              checked={settings.streaming}
              onChange={(streaming) => update({ streaming })}
            />
            <ToggleRow
              label="Auto-expand “see more”"
              description="Click “see more” on long posts before reading them, for better context."
              checked={settings.autoExpandSeeMore}
              onChange={(autoExpandSeeMore) => update({ autoExpandSeeMore })}
            />
            <ToggleRow
              label="Debug logging"
              description="Log selector diagnostics to the console (never your API key)."
              checked={settings.debug}
              onChange={(debug) => update({ debug })}
            />
            <label className="block max-w-[200px]">
              <span className="mb-1.5 block text-xs font-medium text-muted dark:text-muted-dark">
                Max output length (tokens)
              </span>
              <Input
                type="number"
                min={20}
                max={2000}
                value={settings.maxOutputTokens}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10)
                  if (!Number.isNaN(n)) update({ maxOutputTokens: Math.min(2000, Math.max(20, n)) })
                }}
              />
            </label>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-muted dark:text-muted-dark">
                  Custom system prompt {usingCustom ? '(active)' : '(using bundled skill)'}
                </span>
                {usingCustom && (
                  <button
                    type="button"
                    onClick={() => update({ customSystemPrompt: '' })}
                    className="flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <RotateCcw size={12} /> Reset to default
                  </button>
                )}
              </div>
              <textarea
                rows={5}
                value={settings.customSystemPrompt}
                placeholder="Leave empty to use the bundled LinkedIn skill below."
                onChange={(e) => update({ customSystemPrompt: e.target.value })}
                className="w-full resize-y rounded bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark border border-line dark:border-line-dark px-3 py-2 font-mono text-xs leading-relaxed focus:outline-none focus:border-accent"
              />
            </div>
          </Section>

          <Section
            title="What is sent to your AI provider"
            description="Transparency matters. On each click we send only:"
          >
            <ul className="list-inside list-disc space-y-1 text-sm text-ink dark:text-ink-dark">
              <li>The post author's display name and headline</li>
              <li>The post body text and hashtags</li>
              <li>A post-type heuristic (e.g. “opinion”, “achievement”)</li>
              <li>Your persona fields (only what you typed above)</li>
              <li>The system prompt shown below</li>
            </ul>
            <p className="text-sm text-muted dark:text-muted-dark">
              We never send your full LinkedIn page, your profile, or your activity history.
            </p>
          </Section>

          <Section
            title="The LinkedIn skill (system prompt)"
            description={
              usingCustom
                ? 'Your custom prompt is active. The bundled skill below is what InlineAI ships with.'
                : 'This exact text is sent as the system prompt on every comment.'
            }
          >
            <div className="flex justify-end">
              <Button variant="secondary" onClick={copySkill} className="h-8 px-2.5 text-xs">
                {copied ? (
                  <>
                    <Check size={14} /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copy
                  </>
                )}
              </Button>
            </div>
            <pre className="max-h-96 overflow-auto rounded bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark p-4 font-mono text-xs leading-relaxed text-ink dark:text-ink-dark whitespace-pre-wrap">
              {effectivePrompt}
            </pre>
          </Section>

          <div className="flex items-center justify-between pt-2">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-accent hover:underline"
            >
              View source on GitHub
            </a>
            <Button variant="danger" onClick={handleReset} className="text-danger">
              Reset all settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
