import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import {
  accountSummaryFromPayloads,
  buildRuijieAuthorizationUrl,
  ensureRuijieAuthEnvironment,
  normalizeRuijieChatPayload,
} from '../src/ruijie-auth.ts'

const authSource = readFileSync(new URL('../src/ruijie-auth.ts', import.meta.url), 'utf8')

function unsignedJwt(payload: object): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`
}

async function unusedLoopbackPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fixture has no TCP address')
  await new Promise<void>(resolve => { server.close(() => { resolve() }) })
  return address.port
}

describe('Ruijie desktop authentication module', () => {
  it('accepts a loopback HTTP issuer for packaged acceptance without weakening remote OAuth', async () => {
    const requests: string[] = []
    const server = createServer((request, response) => {
      requests.push(request.url ?? '')
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"object":"list","data":[]}')
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('fixture has no TCP address')
    const environment: NodeJS.ProcessEnv = {
      RUIJIE_DSH_OAUTH_ISSUER: `http://127.0.0.1:${String(address.port)}`,
    }
    const tokens = {
      accessToken: unsignedJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      refreshToken: 'acceptance-refresh-token',
    }
    try {
      const auth = await ensureRuijieAuthEnvironment({
        environment,
        credentialStore: {
          load: async () => tokens,
          save: async () => undefined,
          clear: async () => undefined,
        },
        openExternal: async () => { throw new Error('interactive authorization must not run') },
      })
      expect(environment.DEEPSEEK_BASE_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/u)
      expect(environment.DEEPSEEK_API_KEY).toBeTypeOf('string')
      expect(requests).toEqual(['/v1/models'])
      await auth.close()
    } finally {
      await new Promise<void>(resolve => { server.close(() => { resolve() }) })
    }
  })

  it('rejects stale local credentials against the server, clears them, and authorizes exactly once', async () => {
    const staleAccessToken = unsignedJwt({ sub: 'stale-user', exp: Math.floor(Date.now() / 1000) + 3600 })
    const freshAccessToken = unsignedJwt({ sub: 'fresh-user', exp: Math.floor(Date.now() / 1000) + 3600 })
    const modelAuthorizations: Array<string | undefined> = []
    const issuerServer = createServer((request, response) => {
      if (request.url === '/v1/models') {
        modelAuthorizations.push(request.headers.authorization)
        if (request.headers.authorization === `Bearer ${staleAccessToken}`) {
          response.writeHead(401).end('Unauthorized')
          return
        }
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('{"object":"list","data":[]}')
        return
      }
      if (request.url === '/oauth/token') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          access_token: freshAccessToken,
          refresh_token: 'fresh-refresh-token',
        }))
        return
      }
      response.writeHead(404).end('Not Found')
    })
    await new Promise<void>((resolve, reject) => {
      issuerServer.once('error', reject)
      issuerServer.listen(0, '127.0.0.1', resolve)
    })
    const issuerAddress = issuerServer.address()
    if (issuerAddress === null || typeof issuerAddress === 'string') throw new Error('fixture has no TCP address')
    const callbackPort = await unusedLoopbackPort()
    let clearCount = 0
    let authorizationCount = 0
    const savedTokens: Array<{ readonly accessToken: string; readonly refreshToken: string }> = []
    const statuses: string[] = []
    try {
      const auth = await ensureRuijieAuthEnvironment({
        environment: {
          RUIJIE_DSH_OAUTH_ISSUER: `http://127.0.0.1:${String(issuerAddress.port)}`,
          RUIJIE_DSH_OAUTH_CALLBACK_PORT: String(callbackPort),
        },
        credentialStore: {
          load: async () => ({ accessToken: staleAccessToken, refreshToken: 'stale-refresh-token' }),
          save: async tokens => { savedTokens.push(tokens) },
          clear: async () => { clearCount += 1 },
        },
        onStatus: status => { statuses.push(status) },
        openExternal: async authorizeUrl => {
          authorizationCount += 1
          const authorize = new URL(authorizeUrl)
          const callback = new URL(authorize.searchParams.get('redirect_uri') ?? '')
          callback.searchParams.set('code', 'fresh-authorization-code')
          callback.searchParams.set('state', authorize.searchParams.get('state') ?? '')
          const response = await fetch(callback)
          expect(response.ok).toBe(true)
        },
      })

      expect(clearCount).toBe(1)
      expect(authorizationCount).toBe(1)
      expect(savedTokens).toEqual([{
        accessToken: freshAccessToken,
        refreshToken: 'fresh-refresh-token',
      }])
      expect(modelAuthorizations).toEqual([
        `Bearer ${staleAccessToken}`,
        `Bearer ${freshAccessToken}`,
      ])
      expect(statuses).toEqual([
        'authorization-required',
        'authorization-processing',
        'authorization-complete',
      ])
      await auth.close()
    } finally {
      await new Promise<void>(resolve => { issuerServer.close(() => { resolve() }) })
    }
  })

  it('times out a stalled post-login model validation instead of waiting indefinitely', async () => {
    const server = createServer(() => {
      // Intentionally never respond: this reproduces a network stall after OAuth.
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('fixture has no TCP address')
    const tokens = {
      accessToken: unsignedJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      refreshToken: 'stalled-refresh-token',
    }
    const startedAt = Date.now()
    try {
      await expect(ensureRuijieAuthEnvironment({
        environment: { RUIJIE_DSH_OAUTH_ISSUER: `http://127.0.0.1:${String(address.port)}` },
        credentialStore: {
          load: async () => tokens,
          save: async () => undefined,
          clear: async () => undefined,
        },
        requestTimeoutMs: 50,
        openExternal: async () => { throw new Error('interactive authorization must not run') },
      })).rejects.toThrow('GPTAuth 模型接口验证超时')
      expect(Date.now() - startedAt).toBeLessThan(2_000)
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => { server.close(() => { resolve() }) })
    }
  })

  it('rejects a non-loopback HTTP issuer before opening a browser', async () => {
    const openExternal = async (): Promise<never> => {
      throw new Error('browser must not open for an insecure issuer')
    }
    await expect(ensureRuijieAuthEnvironment({
      environment: { RUIJIE_DSH_OAUTH_ISSUER: 'http://example.com' },
      openExternal,
    })).rejects.toThrow('must use HTTPS unless it is a loopback acceptance fixture')
  })

  it('does not expose an environment-key bypass around SSO', () => {
    const source = ensureRuijieAuthEnvironment.toString()
    expect(source).not.toContain('existingKey')
    expect(source).not.toContain('managed: false')
  })

  it('restores protected credentials before requesting interactive authorization', () => {
    const restore = authSource.indexOf('options.credentialStore.load()')
    const authorize = authSource.indexOf("options.onStatus?.('authorization-required')")
    expect(restore).toBeGreaterThan(0)
    expect(authorize).toBeGreaterThan(restore)
    expect(authSource).toContain('options.credentialStore?.save(tokens)')
    expect(authSource).toContain('credentialStore?.clear()')
  })

  it('uses the same OAuth authorization contract as the working Ruijie Codex client', () => {
    const authorize = new URL(buildRuijieAuthorizationUrl({
      issuerUrl: 'https://gptauth.ruijie.com.cn/',
      client: 'client-id',
      redirectUri: 'http://localhost:1455/auth/callback',
      challenge: 'pkce-challenge',
      state: 'oauth-state',
    }))
    expect(authorize.pathname).toBe('/oauth/authorize')
    expect(Object.fromEntries(authorize.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'client-id',
      redirect_uri: 'http://localhost:1455/auth/callback',
      scope: 'openid profile email offline_access api.connectors.read api.connectors.invoke',
      code_challenge: 'pkce-challenge',
      code_challenge_method: 'S256',
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
      state: 'oauth-state',
      originator: 'codex_cli_rs',
    })
    expect(authorize.searchParams.has('product')).toBe(false)
  })

  it('shows a branded completion page and only attempts best-effort auto-close', () => {
    expect(authSource).toContain("'cache-control': 'no-store'")
    expect(authSource).toContain("history.replaceState(null,'','/auth/callback')")
    expect(authSource).toContain('window.close()')
    expect(authSource).not.toContain('<body hidden>')
    expect(authSource).toContain('<title>授权完成 · 锐捷 Harness</title>')
    expect(authSource).toContain('<h1>锐捷Harness</h1>')
    expect(authSource).toContain('<p>授权完成，关闭本页</p>')
    expect(authSource).toContain('<span class="mark" aria-hidden="true">RJ</span>')
    expect(authSource).toContain('color:#111;background:#fff')
    expect(authSource).not.toContain('#6682ff')
    expect(authSource).not.toContain('#3d57da')
    expect(authSource).not.toContain('#d71920')
  })

  it('bounds post-callback account network requests and reports their real phase', () => {
    expect(authSource).toContain('AUTH_REQUEST_TIMEOUT_MS = 30_000')
    expect(authSource).toContain('AbortSignal.timeout(requestTimeoutMs)')
    const code = authSource.indexOf('await receiveAuthorizationCode')
    const processing = authSource.indexOf("options.onStatus?.('authorization-processing')", code)
    const exchange = authSource.indexOf('await exchangeAuthorizationCode', processing)
    const establish = authSource.indexOf('const authenticated = await establishEnvironment(tokens)', exchange)
    const complete = authSource.indexOf("options.onStatus?.('authorization-complete')", establish)
    expect(processing).toBeGreaterThan(code)
    expect(exchange).toBeGreaterThan(processing)
    expect(establish).toBeGreaterThan(exchange)
    expect(complete).toBeGreaterThan(establish)
  })

  it('routes only the public V4 aliases through the low-cost GPTAuth models', () => {
    const thinking = { type: 'enabled' }
    expect(normalizeRuijieChatPayload({
      model: 'deepseek-v4-flash',
      thinking,
      reasoning_effort: 'high',
    })).toEqual({
      model: 'origin-deepseek-v4-flash',
      thinking,
      reasoning_effort: 'high',
    })
    expect(normalizeRuijieChatPayload({
      model: 'deepseek-v4-pro',
      thinking,
      reasoning_effort: 'low',
    })).toEqual({
      model: 'origin-deepseek-v4-pro',
      thinking,
      reasoning_effort: 'low',
    })
    expect(normalizeRuijieChatPayload({ model: 'deepseek-v4-flash-wot', thinking })).toEqual({
      model: 'deepseek-v4-flash-wot',
      thinking,
    })
    expect(normalizeRuijieChatPayload({ model: 'ray', thinking })).toEqual({ model: 'ray' })
  })

  it('preserves native multimodal message parts through the Ruijie proxy normalizer', () => {
    const content = [
      { type: 'text', text: '这张图里有什么？' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AQID' } },
    ]
    expect(normalizeRuijieChatPayload({
      model: 'gpt-5.6-luna',
      messages: [{ role: 'user', content }],
    })).toEqual({
      model: 'gpt-5.6-luna',
      messages: [{ role: 'user', content }],
    })
  })

  it('maps the same GPTAuth wallet fields as Ruijie Codex to the signed-in user', () => {
    const result = accountSummaryFromPayloads(
      unsignedJwt({ sub: '42', name: 'WYS', email: 'wys@ruijie.com.cn' }),
      { total_usage: 94_778.8916 },
      { hard_limit_usd: 2739.726028 },
    )

    expect(result.authentication).toBe('sso')
    expect(result.account).toEqual({ id: '42', name: 'WYS', email: 'wys@ruijie.com.cn' })
    expect(result.billing).toEqual({
      currency: 'CNY',
      total: 2739.726028,
      used: 947.788916,
      remaining: 1791.937112,
      usedPercent: 34.59429542638925,
    })
  })
})
