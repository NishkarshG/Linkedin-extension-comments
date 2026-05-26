import { DEFAULT_SETTINGS, type Settings, type SettingsPatch, SettingsSchema } from '@/llm/types'

// Single namespaced key under chrome.storage.local. Privacy-first: never sync,
// never localStorage, never cookies (see security_and_privacy in the spec).
export const STORAGE_KEY = 'inlineai:settings'

/** Read settings, validated through Zod. Falls back to defaults on missing/corrupt data. */
export async function getSettings(): Promise<Settings> {
  try {
    const raw = await chrome.storage.local.get(STORAGE_KEY)
    const stored = raw[STORAGE_KEY]
    const parsed = SettingsSchema.safeParse(stored ?? {})
    return parsed.success ? parsed.data : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** Merge a partial patch into stored settings (deep-merging persona) and persist. */
export async function setSettings(patch: SettingsPatch): Promise<Settings> {
  const current = await getSettings()
  const next = SettingsSchema.parse({
    ...current,
    ...patch,
    persona: { ...current.persona, ...(patch.persona ?? {}) },
  })
  await chrome.storage.local.set({ [STORAGE_KEY]: next })
  return next
}

/** Remove all stored settings (the options page "Reset all settings" action). */
export async function resetSettings(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'local' || !changes[STORAGE_KEY]) return
    const parsed = SettingsSchema.safeParse(changes[STORAGE_KEY]?.newValue ?? {})
    cb(parsed.success ? parsed.data : DEFAULT_SETTINGS)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

/** Mask an API key for safe display/logging (never reveal more than the last 4 chars). */
export function maskApiKey(key: string): string {
  if (!key) return '(none)'
  if (key.length <= 4) return '••••'
  return `••••${key.slice(-4)}`
}
