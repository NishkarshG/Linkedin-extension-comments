import { PROVIDERS, type Settings } from './types'

// Provider hosts are OPTIONAL host permissions (see manifest.ts): the user only
// grants access to the one provider they actually use, instead of every AI
// provider at install time.

type HostSettings = Pick<Settings, 'providerId' | 'baseUrlOverride'>

/** Match pattern for the host of a base URL (any port), or null when unparsable. */
export function originPattern(baseUrl: string): string | null {
  try {
    const u = new URL(baseUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return `${u.protocol}//${u.hostname}/*`
  } catch {
    return null
  }
}

/** Human readable host for UI copy, e.g. "api.openai.com". */
export function providerHost(settings: HostSettings): string {
  try {
    return new URL(effectiveBaseUrl(settings)).host
  } catch {
    return PROVIDERS[settings.providerId].displayName
  }
}

function effectiveBaseUrl(settings: HostSettings): string {
  return settings.baseUrlOverride.trim() || PROVIDERS[settings.providerId].baseUrl
}

export function requiredOrigins(settings: HostSettings): string[] {
  const pattern = originPattern(effectiveBaseUrl(settings))
  return pattern ? [pattern] : []
}

/** True when the extension may call the selected provider. */
export async function hasHostAccess(settings: HostSettings): Promise<boolean> {
  const origins = requiredOrigins(settings)
  if (origins.length === 0) return false
  try {
    return await chrome.permissions.contains({ origins })
  } catch {
    return false
  }
}

/** Ask for access to the selected provider. Must run inside a user gesture. */
export async function requestHostAccess(settings: HostSettings): Promise<boolean> {
  const origins = requiredOrigins(settings)
  if (origins.length === 0) return false
  try {
    return await chrome.permissions.request({ origins })
  } catch {
    return false
  }
}
