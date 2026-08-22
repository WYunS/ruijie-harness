import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  RUIJIE_ACCOUNT_CLIENT_HEADER,
  RUIJIE_ACCOUNT_CLIENT_VALUE,
  type RuijieAccountSummary,
} from '../src/ruijie-account-contract.ts'
import { handleRuijieAccountRequest, handleRuijieLogoutRequest } from '../src/ruijie-account-route.ts'

function responseHarness() {
  const headers = new Map<string, string>()
  let body = ''
  const response = Object.assign(new EventEmitter(), {
    statusCode: 0,
    setHeader: (name: string, value: string) => { headers.set(name, value) },
    end: (value?: string) => { body = value ?? '' },
  }) as unknown as ServerResponse
  return { response, headers, body: () => body }
}

const summary: RuijieAccountSummary = {
  authentication: 'sso',
  account: { id: '42', email: 'wys@ruijie.com.cn' },
      billing: { currency: 'CNY', total: 100, used: 25, remaining: 75, usedPercent: 25 },
  fetchedAt: '2026-08-19T00:00:00.000Z',
}

describe('Ruijie account renderer route', () => {
  it('returns only non-secret SSO identity and wallet data to the desktop client', async () => {
    const request = {
      method: 'GET',
      headers: { [RUIJIE_ACCOUNT_CLIENT_HEADER]: RUIJIE_ACCOUNT_CLIENT_VALUE },
    } as unknown as IncomingMessage
    const harness = responseHarness()

    await handleRuijieAccountRequest(request, harness.response, async () => summary)

    expect(harness.response.statusCode).toBe(200)
    expect(harness.headers.get('cache-control')).toBe('no-store')
    expect(JSON.parse(harness.body())).toEqual(summary)
    expect(harness.body()).not.toMatch(/access_token|refresh_token|sk-/u)
  })

  it('rejects ordinary browser requests without the desktop client marker', async () => {
    const request = { method: 'GET', headers: {} } as unknown as IncomingMessage
    const harness = responseHarness()
    const load = vi.fn(async () => summary)

    await handleRuijieAccountRequest(request, harness.response, load)

    expect(harness.response.statusCode).toBe(403)
    expect(load).not.toHaveBeenCalled()
  })

  it('clears the SSO session before restarting on explicit logout', async () => {
    const request = {
      method: 'POST',
      headers: { [RUIJIE_ACCOUNT_CLIENT_HEADER]: RUIJIE_ACCOUNT_CLIENT_VALUE },
    } as unknown as IncomingMessage
    const harness = responseHarness()
    const logout = vi.fn(async () => {})
    const restart = vi.fn(async () => {})

    await handleRuijieLogoutRequest(request, harness.response, logout, restart)

    expect(harness.response.statusCode).toBe(204)
    expect(logout).toHaveBeenCalledOnce()
    expect(restart).toHaveBeenCalledOnce()
    expect(logout.mock.invocationCallOrder[0]).toBeLessThan(restart.mock.invocationCallOrder[0] ?? 0)
  })

  it('does not expose logout to an unmarked browser request', async () => {
    const request = { method: 'POST', headers: {} } as unknown as IncomingMessage
    const harness = responseHarness()
    const logout = vi.fn(async () => {})

    await handleRuijieLogoutRequest(request, harness.response, logout, async () => {})

    expect(harness.response.statusCode).toBe(403)
    expect(logout).not.toHaveBeenCalled()
  })
})
