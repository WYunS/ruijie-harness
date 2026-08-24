import { describe, expect, it } from 'vitest'
import { applyResolvedSystemProxy, proxyUrlFromElectronResult } from '../src/system-proxy.ts'

describe('desktop system proxy bridge', () => {
  it('shares an Electron HTTP proxy with Node-based IM sockets', () => {
    expect(proxyUrlFromElectronResult('PROXY 127.0.0.1:7892; DIRECT')).toBe('http://127.0.0.1:7892')
    const environment: NodeJS.ProcessEnv = {}
    applyResolvedSystemProxy(environment, 'PROXY 127.0.0.1:7892; DIRECT')
    expect(environment.HTTPS_PROXY).toBe('http://127.0.0.1:7892')
  })

  it('does not replace an explicitly configured proxy', () => {
    const environment: NodeJS.ProcessEnv = { HTTPS_PROXY: 'http://company-proxy:8080' }
    applyResolvedSystemProxy(environment, 'PROXY 127.0.0.1:7892')
    expect(environment.HTTPS_PROXY).toBe('http://company-proxy:8080')
  })
})
