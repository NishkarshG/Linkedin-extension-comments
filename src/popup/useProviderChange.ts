import { requestHostAccess } from '@/llm/permissions'
import type { Settings, SettingsPatch } from '@/llm/types'
import type { ProviderId } from '@/shared/types'

/**
 * Switch provider and ask for access to its host in the same click. The
 * permission request starts before any await so it keeps the user gesture.
 */
export function changeProvider(
  settings: Settings,
  update: (patch: SettingsPatch) => Promise<Settings>,
  providerId: ProviderId,
): void {
  void requestHostAccess({ providerId, baseUrlOverride: settings.baseUrlOverride })
  void update({ providerId, model: '' })
}
