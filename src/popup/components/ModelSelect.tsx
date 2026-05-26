import { PROVIDERS } from '@/llm/types'
import type { ProviderId } from '@/shared/types'
import { Input } from './ui/Input'
import { Select } from './ui/Select'

interface Props {
  provider: ProviderId
  model: string
  onChange: (model: string) => void
}

export function ModelSelect({ provider, model, onChange }: Props) {
  const meta = PROVIDERS[provider]
  const isFreeform = meta.models === 'freeform'

  return (
    <label className="block" htmlFor="inlineai-model">
      <span className="mb-1.5 block text-xs font-medium text-muted dark:text-muted-dark">
        Model
      </span>
      {isFreeform ? (
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
          options={(meta.models as string[]).map((m) => ({ value: m, label: m }))}
          value={model || meta.defaultModel}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {meta.note && (
        <span className="mt-1.5 block text-xs leading-snug text-muted dark:text-muted-dark">
          {meta.note}
        </span>
      )}
    </label>
  )
}
