import { originPattern, providerHost, requiredOrigins } from '@/llm/permissions'
import { describe, expect, it } from 'vitest'

describe('provider host permissions', () => {
  it('derives a match pattern for the selected provider only', () => {
    expect(requiredOrigins({ providerId: 'openai', baseUrlOverride: '' })).toEqual([
      'https://api.openai.com/*',
    ])
    expect(requiredOrigins({ providerId: 'ollama', baseUrlOverride: '' })).toEqual([
      'http://localhost/*',
    ])
    expect(
      requiredOrigins({ providerId: 'ollama', baseUrlOverride: 'http://127.0.0.1:11434/v1' }),
    ).toEqual(['http://127.0.0.1/*'])
  })

  it('rejects non http URLs', () => {
    expect(originPattern('file:///etc/passwd')).toBeNull()
    expect(originPattern('not a url')).toBeNull()
  })

  it('shows a readable host', () => {
    expect(providerHost({ providerId: 'anthropic', baseUrlOverride: '' })).toBe('api.anthropic.com')
  })
})
