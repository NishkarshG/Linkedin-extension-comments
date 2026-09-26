import { BUNDLED_SKILLS, customPromptFor } from '@/llm/prompt'
import { MAX_OUTPUT_TOKENS_MAX, MAX_OUTPUT_TOKENS_MIN } from '@/llm/types'
import { ApiKeyInput } from '@/popup/components/ApiKeyInput'
import { ModelSelect } from '@/popup/components/ModelSelect'
import { PersonaCard } from '@/popup/components/PersonaCard'
import { ProviderSelect } from '@/popup/components/ProviderSelect'
import { Button } from '@/popup/components/ui/Button'
import { Input } from '@/popup/components/ui/Input'
import { Toggle } from '@/popup/components/ui/Toggle'
import { changeProvider } from '@/popup/useProviderChange'
import { useSettings } from '@/popup/useSettings'
import type { Platform, ProviderId } from '@/shared/types'
import { REPO_URL } from '@/shared/types'
import { resetSettings } from '@/storage/storage'
import { Check, Copy, RotateCcw, Sparkles } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

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

const PLATFORM_LABELS: Record<Platform, string> = { linkedin: 'LinkedIn', x: 'X' }

/** LinkedIn / X switch for the per-platform skill and custom prompt. */
function PlatformTabs({ value, onChange }: { value: Platform; onChange: (p: Platform) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Platform"
      className="inline-flex rounded border border-line dark:border-line-dark p-0.5"
    >
      {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
        <button
          key={p}
          type="button"
          role="tab"
          aria-selected={value === p}
          onClick={() => onChange(p)}
          className={`rounded px-3 py-1 text-xs font-medium ${
            value === p
              ? 'bg-accent/10 text-accent'
              : 'text-muted hover:text-ink dark:text-muted-dark dark:hover:text-ink-dark'
          }`}
        >
          {PLATFORM_LABELS[p]}
        </button>
      ))}
    </div>
  )
}

/**
 * A number input that keeps its own draft text and only saves a valid,
 * clamped value on blur or Enter, so typing "5" on the way to "50" is not
 * instantly clamped to the minimum.
 */
function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step,
  integer = false,
  onCommit,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step: number
  integer?: boolean
  onCommit: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  function commit() {
    const n = integer ? Number.parseInt(draft, 10) : Number.parseFloat(draft)
    if (Number.isNaN(n)) {
      setDraft(String(value))
      return
    }
    const clamped = Math.min(max, Math.max(min, n))
    setDraft(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted dark:text-muted-dark">
        {label}
      </span>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      {hint && <span className="mt-1 block text-xs text-muted dark:text-muted-dark">{hint}</span>}
    </label>
  )
}

export default function App() {
  const { settings, update } = useSettings()
  const [copied, setCopied] = useState(false)
  const [platform, setPlatform] = useState<Platform>('linkedin')

  const customPrompt = customPromptFor(settings, platform)
  const customKey = platform === 'x' ? 'customSystemPromptX' : 'customSystemPrompt'
  const effectivePrompt = customPrompt.trim() || BUNDLED_SKILLS[platform]
  const usingCustom = customPrompt.trim().length > 0

  async function copySkill() {
    await navigator.clipboard.writeText(BUNDLED_SKILLS[platform])
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
            <h1 className="text-xl font-semibold">InlineAI for LinkedIn &amp; X</h1>
            <p className="text-sm text-muted dark:text-muted-dark">
              Settings · open-source · bring-your-own-key
            </p>
            <p className="text-xs text-muted dark:text-muted-dark">
              Tip: press Alt+Shift+W in any LinkedIn comment box or X reply box to write with AI.
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
              onChange={(providerId: ProviderId) => changeProvider(settings, update, providerId)}
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
            <div className="grid grid-cols-2 gap-4">
              <NumberField
                label="Max output length (tokens)"
                value={settings.maxOutputTokens}
                min={MAX_OUTPUT_TOKENS_MIN}
                max={MAX_OUTPUT_TOKENS_MAX}
                step={10}
                integer
                onCommit={(maxOutputTokens) => update({ maxOutputTokens })}
              />
              <NumberField
                label="Creativity (temperature)"
                hint="Ignored by reasoning models."
                value={settings.temperature}
                min={0}
                max={2}
                step={0.1}
                onCommit={(temperature) => update({ temperature })}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted dark:text-muted-dark">
                  Custom system prompt for {PLATFORM_LABELS[platform]}{' '}
                  {usingCustom ? '(active)' : '(using bundled skill)'}
                </span>
                <PlatformTabs value={platform} onChange={setPlatform} />
              </div>
              <div className="mb-1.5 flex justify-end">
                {usingCustom && (
                  <button
                    type="button"
                    onClick={() => update({ [customKey]: '' })}
                    className="flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <RotateCcw size={12} /> Reset to default
                  </button>
                )}
              </div>
              <textarea
                rows={5}
                value={customPrompt}
                placeholder={`Leave empty to use the bundled ${PLATFORM_LABELS[platform]} skill below.`}
                onChange={(e) => update({ [customKey]: e.target.value })}
                className="w-full resize-y rounded bg-canvas dark:bg-canvas-dark text-ink dark:text-ink-dark border border-line dark:border-line-dark px-3 py-2 font-mono text-xs leading-relaxed focus:outline-none focus:border-accent"
              />
            </div>
          </Section>

          <Section
            title="What is sent to your AI provider"
            description="Transparency matters. On each click we send only:"
          >
            <ul className="list-inside list-disc space-y-1 text-sm text-ink dark:text-ink-dark">
              <li>The post author's display name and headline (on X: display name and @handle)</li>
              <li>The post body text and hashtags (on X: plus the text of a quoted post)</li>
              <li>The post's media type (text, image, video, document, article, repost)</li>
              <li>A post type guess (for example “opinion” or “achievement”)</li>
              <li>When you reply to a comment: the text of that comment (up to 600 characters)</li>
              <li>Your persona fields (only what you typed above)</li>
              <li>The system prompt shown below</li>
            </ul>
            <p className="text-sm text-muted dark:text-muted-dark">
              We never send the full page, your profile, or your activity history.
            </p>
          </Section>

          <Section
            title={`The ${PLATFORM_LABELS[platform]} skill (system prompt)`}
            description={
              usingCustom
                ? `Your custom prompt is active on ${PLATFORM_LABELS[platform]}. The bundled skill below is what InlineAI ships with.`
                : `This exact text is sent as the system prompt on every ${PLATFORM_LABELS[platform]} ${platform === 'x' ? 'reply' : 'comment'}.`
            }
          >
            <div className="flex items-center justify-between">
              <PlatformTabs value={platform} onChange={setPlatform} />
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
