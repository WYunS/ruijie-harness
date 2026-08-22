import { describe, expect, it } from 'vitest'
import { isInstalledWorkbenchReady } from '../scripts/mac-installed-acceptance.ts'

describe('installed macOS workbench readiness', () => {
  it('does not treat the transient plugin loading page as ready', () => {
    expect(isInstalledWorkbenchReady({
      url: 'http://127.0.0.1:49346/?dsh-desktop-platform=darwin',
      bodyText: 'HARNESS\nLoading plugins…',
    }, 'http://127.0.0.1:49100')).toBe(false)
  })

  it('accepts a rendered loopback workbench from a different port than the mock issuer', () => {
    expect(isInstalledWorkbenchReady({
      url: 'http://127.0.0.1:49346/?dsh-desktop-platform=darwin',
      bodyText: 'New task\nFiles\nSettings',
    }, 'http://127.0.0.1:49100')).toBe(true)
  })

  it('rejects empty, non-loopback, and mock-issuer pages', () => {
    expect(isInstalledWorkbenchReady({ url: 'about:blank', bodyText: '' }, 'http://127.0.0.1:49100')).toBe(false)
    expect(isInstalledWorkbenchReady({ url: 'https://example.com', bodyText: 'ready' }, 'http://127.0.0.1:49100')).toBe(false)
    expect(isInstalledWorkbenchReady({ url: 'http://127.0.0.1:49100/status', bodyText: 'ready' }, 'http://127.0.0.1:49100')).toBe(false)
  })
})
