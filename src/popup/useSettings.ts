import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '@/llm/types'
import {
  getSettings,
  mergeSettings,
  onSettingsChanged,
  setSettings as persistSettings,
} from '@/storage/storage'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseSettings {
  settings: Settings
  loaded: boolean
  update: (patch: SettingsPatch) => Promise<Settings>
}

/**
 * Shared settings hook used by both the popup and the options page.
 *
 * Updates are applied to React state synchronously (optimistically) and then
 * persisted. Controlled inputs therefore never lag behind the keyboard, which
 * previously made the caret jump to the end and could drop characters.
 */
export function useSettings(): UseSettings {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  /** Local writes still in flight; storage echoes of them must not rewind the UI. */
  const pending = useRef(0)

  useEffect(() => {
    let mounted = true
    getSettings().then((s) => {
      if (mounted) {
        setSettings(s)
        setLoaded(true)
      }
    })
    const unsub = onSettingsChanged((s) => {
      // Changes from another page (popup vs options) still sync once we are idle.
      if (mounted && pending.current === 0) setSettings(s)
    })
    return () => {
      mounted = false
      unsub()
    }
  }, [])

  const update = useCallback(async (patch: SettingsPatch) => {
    setSettings((prev) => mergeSettings(prev, patch))
    pending.current += 1
    try {
      const saved = await persistSettings(patch)
      // Once the last write lands, adopt what storage actually holds (for
      // example after "Reset all settings").
      if (pending.current === 1) setSettings(saved)
      return saved
    } finally {
      pending.current -= 1
    }
  }, [])

  return { settings, loaded, update }
}
