import { PROVIDERS } from '@/llm/types'
import { PROVIDER_IDS, type ProviderId } from '@/shared/types'
import { Select } from './ui/Select'

interface Props {
  value: ProviderId
  onChange: (provider: ProviderId) => void
}

export function ProviderSelect({ value, onChange }: Props) {
  const options = PROVIDER_IDS.map((id) => ({ value: id, label: PROVIDERS[id].displayName }))
  return (
    <label className="block" htmlFor="inlineai-provider">
      <span className="mb-1.5 block text-xs font-medium text-muted dark:text-muted-dark">
        Provider
      </span>
      <Select
        id="inlineai-provider"
        options={options}
        value={value}
        onChange={(e) => onChange(e.target.value as ProviderId)}
      />
    </label>
  )
}
