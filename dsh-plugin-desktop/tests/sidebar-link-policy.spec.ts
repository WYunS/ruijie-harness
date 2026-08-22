import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Ruijie sidebar link policy', () => {
  it('opens ordinary HTTPS links in the sidebar for fresh and fallback profiles', () => {
    const prefsShared = readFileSync(
      new URL('../../vendor/dsh-better-sidebar/src/prefs-shared.ts', import.meta.url),
      'utf8',
    )
    const prefsClient = readFileSync(
      new URL('../../vendor/dsh-better-sidebar/src/client/prefs.ts', import.meta.url),
      'utf8',
    )
    const config = readFileSync(
      new URL('../../vendor/dsh-better-sidebar/src/config.ts', import.meta.url),
      'utf8',
    )
    expect(prefsShared).toMatch(/browserInterceptLinks:\s*true/u)
    expect(prefsShared).toMatch(/browserInterceptHttps:\s*true/u)
    expect(prefsClient).toContain('SIDEBAR_PREFS_DEFAULTS.browserInterceptHttps')
    expect(config).toMatch(/browserInterceptHttps:\s*z\.boolean\(\)\.default\(true\)/u)
  })
})
