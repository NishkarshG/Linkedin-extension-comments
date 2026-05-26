import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '@/llm/types'
import { getSettings, onSettingsChanged, setSettings as persistSettings } from '@/storage/storage'
import { useCallback, useEffect, useState } from 'react'

export interface UseSettings {
  settings: Settings
  loaded: boolean
  update: (patch: SettingsPatch) => Promise<Settings>
}

/** Shared settings hook used by both the popup and the options page. */
export function useSettings(): UseSettings {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    getSettings().then((s) => {
      if (mounted) {
        setSettings(s)
        setLoaded(true)
      }
    })
    const unsub = onSettingsChanged((s) => {
      if (mounted) setSettings(s)
    })
    return () => {
      mounted = false
      unsub()
    }
  }, [])

  const update = useCallback(async (patch: SettingsPatch) => {
    const next = await persistSettings(patch)
    setSettings(next)
    return next
  }, [])

  return { settings, loaded, update }
}
