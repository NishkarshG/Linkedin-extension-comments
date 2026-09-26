import { PROVIDERS, isRetiredModel, resolveModel } from '@/llm/types'
import type { ProviderId } from '@/shared/types'
import { useState } from 'react'
import { Input } from './ui/Input'
import { Select } from './ui/Select'

interface Props {
  provider: ProviderId
  model: string
  onChange: (model: string) => void
}

const CUSTOM = '__custom__'

export function ModelSelect({ provider, model, onChange }: Props) {
  const meta = PROVIDERS[provider]
  const list = meta.models === 'freeform' ? null : meta.models
  const effective = resolveModel({ providerId: provider, model })
  const retired = model.trim().length > 0 && isRetiredModel(model.trim())
  // Providers retire models often, so any provider can take a typed model id.
  // Remembered per provider, so switching provider resets it without an effect.
  const [customFor, setCustomFor] = useState<ProviderId | null>(null)
  const customMode = customFor === provider
  const isCustom = list !== null && (customMode || !list.includes(effective))

  return (
    <div className="space-y-1.5">
      <label className="block" htmlFor="inlineai-model">
        <span className="mb-1.5 block text-xs font-medium text-muted dark:text-muted-dark">
          Model
        </span>
        {list === null ? (
          <Input
            id="inlineai-model"
            value={model}
            placeholder={meta.defaultModel}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        ) : (
          <Select
            id="inlineai-model"
            options={[
              ...list.map((m) => ({
                value: m,
                label: m === meta.defaultModel ? `${m} (default)` : m,
              })),
              { value: CUSTOM, label: 'Custom model id…' },
            ]}
            value={isCustom ? CUSTOM : effective}
            onChange={(e) => {
              if (e.target.value === CUSTOM) {
                setCustomFor(provider)
              } else {
                setCustomFor(null)
                onChange(e.target.value)
              }
            }}
          />
        )}
      </label>
      {isCustom && (
        <Input
          aria-label="Custom model id"
          value={list?.includes(model) ? '' : model}
          placeholder="Exact model id from your provider"
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      )}
      {retired && (
        <span className="block text-xs leading-snug text-danger">
          {model} has been retired by the provider, so {meta.defaultModel} is used instead.
        </span>
      )}
      {meta.note && (
        <span className="block text-xs leading-snug text-muted dark:text-muted-dark">
          {meta.note}
        </span>
      )}
    </div>
  )
}
