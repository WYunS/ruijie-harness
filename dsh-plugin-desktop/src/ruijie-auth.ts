/** Ruijie OAuth login, secure refresh-token persistence, and loopback model transport. */

import { createHash, randomBytes } from 'node:crypto'
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type ServerResponse,
} from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { RuijieAccountSummary } from './ruijie-account-contract.ts'

const DEFAULT_ISSUER = 'https://gptauth.ruijie.com.cn'
const TEMPORARY_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const DEFAULT_CALLBACK_PORT = 1455
const CALLBACK_HOST = 'localhost'
const CALLBACK_PATH = '/auth/callback'
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000
const AUTH_REQUEST_TIMEOUT_MS = 30_000
const TOKEN_REFRESH_SKEW_MS = 60 * 1000
const LOGOUT_REVOKE_TIMEOUT_MS = 2_000
const MAX_PROXY_BODY_BYTES = 32 * 1024 * 1024

export interface RuijieAuthEnvironment {
  /** Read the current SSO identity and its GPTAuth wallet through the same OAuth token used for chat. */
  account(): Promise<RuijieAccountSummary>
  /** Revoke the current refresh token when possible and always clear the local session. */
  logout(): Promise<void>
  /** Stop the owned transport; safe to call more than once. */
  close(): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** SSO account service; never exposes OAuth or API credentials to the renderer. */
    ruijieAccount: RuijieAuthEnvironment
  }
}

export interface RuijieAuthOptions {
  /** Process environment updated with the short-lived local model credential. */
  readonly environment: NodeJS.ProcessEnv
  /** Open the system browser for interactive SSO. */
  readonly openExternal: (url: string) => Promise<unknown>
  /** Product-facing startup status, never credential material. */
  readonly onStatus?: (status: RuijieAuthStatus) => void
  /** OS-protected session storage. Without it, authorization remains process-lifetime only. */
  readonly credentialStore?: RuijieOAuthCredentialStore
  /** Report non-fatal cleanup and revocation failures without exposing credentials. */
  readonly onError?: (cause: unknown) => void
  /** Bound account-service calls after the browser callback; overridable by deterministic tests. */
  readonly requestTimeoutMs?: number
}

export type RuijieAuthStatus =
  | 'authorization-required'
  | 'authorization-processing'
  | 'authorization-complete'

export interface RuijieOAuthTokens {
  readonly accessToken: string
  readonly refreshToken: string
}

export interface RuijieOAuthCredentialStore {
  load(): Promise<RuijieOAuthTokens | undefined>
  save(tokens: RuijieOAuthTokens): Promise<void>
  clear(): Promise<void>
}

interface OAuthMemory {
  /** Refresh when expired, or only when the caller's rejected token is still current. */
  accessToken(rejectedToken?: string): Promise<string>
  logout(): Promise<void>
}

class OAuthSessionRejectedError extends Error {}

function requiredText(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(message)
  return value
}

async function fetchAccountService(
  input: URL,
  init: RequestInit,
  requestTimeoutMs: number,
  operation: string,
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) })
  } catch (cause) {
    if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) {
      throw new Error(`${operation}超时，请检查网络或代理后重试。`, { cause })
    }
    throw cause
  }
}

function callbackPort(environment: NodeJS.ProcessEnv): number {
  const configured = environment.RUIJIE_DSH_OAUTH_CALLBACK_PORT?.trim()
  if (configured === undefined || configured.length === 0) return DEFAULT_CALLBACK_PORT
  const port = Number(configured)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('RUIJIE_DSH_OAUTH_CALLBACK_PORT 必须是有效端口。')
  }
  return port
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
}

function issuer(environment: NodeJS.ProcessEnv): string {
  const configured = environment.RUIJIE_DSH_OAUTH_ISSUER?.trim() || DEFAULT_ISSUER
  const target = new URL(configured)
  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && isLoopbackHostname(target.hostname))) {
    throw new Error(`GPTAuth issuer must use HTTPS unless it is a loopback acceptance fixture: ${target.origin}`)
  }
  return target.toString()
}

function clientId(environment: NodeJS.ProcessEnv): string {
  return environment.RUIJIE_DSH_OAUTH_CLIENT_ID?.trim() || TEMPORARY_CODEX_CLIENT_ID
}

function supportsDeepSeekThinking(model: unknown): boolean {
  return typeof model === 'string' && /^deepseek-v4-(?:flash|pro)(?:-|$)/u.test(model)
}

/** Preserve V4 thinking requests while shielding generic OpenAI routes from the field. */
export function normalizeRuijieChatPayload(payload: unknown): unknown {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return payload
  const normalized = { ...(payload as Record<string, unknown>) }
  if (!supportsDeepSeekThinking(normalized.model)) delete normalized.thinking
  return normalized
}

function successPage(response: ServerResponse): void {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'cache-control': 'no-store',
    connection: 'close',
  })
  response.end(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>授权完成 · 锐捷 Harness</title><style>
:root{color-scheme:light;font:15px/1.6 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#17191d;background:#f5f6f8}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(460px,100%);padding:34px;border:1px solid #e5e7eb;border-radius:24px;background:#fff;box-shadow:0 20px 55px #20242d1f}.brand{display:flex;align-items:center;gap:10px;margin-bottom:36px}.mark{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,#6682ff 0%,#3d57da 100%);font-size:13px;font-style:italic;font-weight:800;letter-spacing:-.06em}.brand strong{font-size:16px}.check{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;margin-bottom:18px;color:#fff;background:linear-gradient(145deg,#6682ff 0%,#3d57da 100%);box-shadow:0 10px 24px #3d57da38;font-size:25px}h1{margin:0 0 8px;font-size:25px;line-height:1.25;letter-spacing:-.025em}p{margin:0;color:#737981}.hint{margin-top:20px;padding-top:18px;border-top:1px solid #eef0f3;font-size:13px;color:#9297a0}
</style></head><body><main class="card"><header class="brand"><span class="mark">RJ</span><strong>锐捷 Harness</strong></header><div class="check" aria-hidden="true">✓</div><h1>授权已完成</h1><p>锐捷 Harness 正在继续启动。</p><p class="hint">现在可以关闭此页面，返回锐捷 Harness。</p></main>
<script>history.replaceState(null,'','/auth/callback');const closePage=()=>{window.open('','_self');window.close()};setTimeout(closePage,450);</script></body></html>`)
}

async function receiveAuthorizationCode(
  state: string,
  authorizeUrl: string,
  redirectUri: string,
  port: number,
  openExternal: (url: string) => Promise<unknown>,
): Promise<string> {
  let settled = false
  let timeout: ReturnType<typeof setTimeout> | undefined
  let resolveCode!: (code: string) => void
  let rejectCode!: (cause: Error) => void
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })
  const finish = (action: () => void): void => {
    if (settled) return
    settled = true
    if (timeout !== undefined) clearTimeout(timeout)
    action()
  }
  const server = createServer((request, response) => {
    try {
      const callback = new URL(request.url ?? '/', redirectUri)
      if (callback.pathname !== CALLBACK_PATH) {
        response.writeHead(404).end('Not Found')
        return
      }
      if (callback.searchParams.get('state') !== state) {
        response.writeHead(400).end('State mismatch')
        finish(() => { rejectCode(new Error('GPTAuth 登录回调 state 不匹配。')) })
        return
      }
      const oauthError = callback.searchParams.get('error')
      if (oauthError !== null) {
        response.writeHead(400).end('Login failed')
        finish(() => { rejectCode(new Error(`GPTAuth 登录失败：${oauthError}`)) })
        return
      }
      const authorizationCode = callback.searchParams.get('code')
      if (authorizationCode === null || authorizationCode.length === 0) {
        response.writeHead(400).end('Missing authorization code')
        return
      }
      // GPTAuth currently also appends a legacy ordinary API key. The desktop
      // intentionally ignores it and never persists it.
      successPage(response)
      finish(() => { resolveCode(authorizationCode) })
    } catch {
      response.writeHead(400).end('Bad Request')
      finish(() => { rejectCode(new Error('无法解析 GPTAuth 登录回调。')) })
    }
  })
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(port, CALLBACK_HOST, resolveListen)
  })
  timeout = setTimeout(() => {
    finish(() => { rejectCode(new Error('等待 GPTAuth 登录超时。')) })
  }, LOGIN_TIMEOUT_MS)
  try {
    await openExternal(authorizeUrl)
    return await code
  } finally {
    await new Promise<void>(resolveClose => { server.close(() => { resolveClose() }) })
  }
}

async function exchangeAuthorizationCode(
  issuerUrl: string,
  client: string,
  redirectUri: string,
  code: string,
  verifier: string,
  requestTimeoutMs: number,
): Promise<RuijieOAuthTokens> {
  const response = await fetchAccountService(new URL('/oauth/token', issuerUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: client,
      code_verifier: verifier,
    }),
  }, requestTimeoutMs, 'GPTAuth 令牌交换')
  if (!response.ok) throw new Error(`GPTAuth 令牌交换失败（HTTP ${String(response.status)}）。`)
  const payload = await response.json() as Record<string, unknown>
  return {
    accessToken: requiredText(payload.access_token, 'GPTAuth 没有返回 OAuth Access Token。'),
    refreshToken: requiredText(payload.refresh_token, 'GPTAuth 没有返回 OAuth Refresh Token。'),
  }
}

function jwtExpiresAt(accessToken: string): number {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0
  } catch {
    return 0
  }
}

function jwtClaims(accessToken: string): Record<string, unknown> {
  try {
    const encoded = accessToken.split('.')[1]
    if (encoded === undefined) return {}
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function optionalClaim(claims: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = claims[name]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function requiredFiniteNumber(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(message)
  return value
}

/** Normalize GPTAuth's Codex-compatible billing payloads for the desktop account card. */
export function accountSummaryFromPayloads(
  accessToken: string,
  usagePayload: Record<string, unknown>,
  subscriptionPayload: Record<string, unknown>,
): RuijieAccountSummary {
  const claims = jwtClaims(accessToken)
  const used = requiredFiniteNumber(usagePayload.total_usage, 'GPTAuth 用量接口缺少 total_usage。') / 100
  const total = requiredFiniteNumber(subscriptionPayload.hard_limit_usd, 'GPTAuth 额度接口缺少 hard_limit_usd。')
  const remaining = Math.max(0, total - used)
  const id = optionalClaim(claims, 'sub', 'user_id', 'uid') ?? 'sso-user'
  const name = optionalClaim(claims, 'name', 'preferred_username', 'username')
  const email = optionalClaim(claims, 'email')
  return {
    authentication: 'sso',
    account: {
      id,
      ...(name === undefined ? {} : { name }),
      ...(email === undefined ? {} : { email }),
    },
    billing: {
      currency: 'CNY',
      total,
      used,
      remaining,
      usedPercent: total === 0 ? 0 : Math.min(100, (used / total) * 100),
    },
    fetchedAt: new Date().toISOString(),
  }
}

async function oauthJson(
  issuerUrl: string,
  pathname: string,
  oauthMemory: OAuthMemory,
): Promise<{ readonly accessToken: string; readonly payload: Record<string, unknown> }> {
  let accessToken = await oauthMemory.accessToken()
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(new URL(pathname, issuerUrl), {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (response.status === 401 && attempt === 0) {
      accessToken = await oauthMemory.accessToken(accessToken)
      continue
    }
    if (!response.ok) throw new Error(`GPTAuth 额度接口失败（HTTP ${String(response.status)}）。`)
    const payload = await response.json() as unknown
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('GPTAuth 额度接口返回格式无效。')
    }
    return { accessToken, payload: payload as Record<string, unknown> }
  }
  throw new Error('GPTAuth 额度接口认证失败。')
}

async function loadAccountSummary(issuerUrl: string, oauthMemory: OAuthMemory): Promise<RuijieAccountSummary> {
  const [usage, subscription] = await Promise.all([
    oauthJson(issuerUrl, '/v1/dashboard/billing/usage', oauthMemory),
    oauthJson(issuerUrl, '/v1/dashboard/billing/subscription', oauthMemory),
  ])
  return accountSummaryFromPayloads(usage.accessToken, usage.payload, subscription.payload)
}

function createOAuthMemory(
  issuerUrl: string,
  client: string,
  initialTokens: RuijieOAuthTokens,
  credentialStore: RuijieOAuthCredentialStore | undefined,
  reportError: (cause: unknown) => void,
  requestTimeoutMs: number,
): OAuthMemory {
  let accessToken = initialTokens.accessToken
  let refreshToken = initialTokens.refreshToken
  let refreshTask: Promise<string> | undefined
  const refresh = async (): Promise<string> => {
    const response = await fetchAccountService(new URL('/oauth/token', issuerUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: client,
      }),
    }, requestTimeoutMs, 'GPTAuth OAuth 刷新')
    if (!response.ok) {
      const message = `GPTAuth OAuth 刷新失败（HTTP ${String(response.status)}）。`
      if ([400, 401, 403].includes(response.status)) throw new OAuthSessionRejectedError(message)
      throw new Error(message)
    }
    const payload = await response.json() as Record<string, unknown>
    accessToken = requiredText(payload.access_token, 'GPTAuth OAuth 刷新没有返回 Access Token。')
    if (typeof payload.refresh_token === 'string' && payload.refresh_token.length > 0) {
      refreshToken = payload.refresh_token
    }
    await credentialStore?.save({ accessToken, refreshToken })
    return accessToken
  }
  return {
    async accessToken(rejectedToken?: string): Promise<string> {
      if (rejectedToken !== undefined && rejectedToken !== accessToken) return accessToken
      if (rejectedToken === undefined && jwtExpiresAt(accessToken) > Date.now() + TOKEN_REFRESH_SKEW_MS) return accessToken
      refreshTask ??= refresh().finally(() => { refreshTask = undefined })
      return await refreshTask
    },
    async logout(): Promise<void> {
      const tokenToRevoke = refreshToken
      await credentialStore?.clear()
      try {
        const response = await fetch(new URL('/oauth/revoke', issuerUrl), {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: tokenToRevoke, client_id: client }),
          signal: AbortSignal.timeout(LOGOUT_REVOKE_TIMEOUT_MS),
        })
        if (!response.ok && response.status !== 404) {
          reportError(new Error(`GPTAuth OAuth 注销失败（HTTP ${String(response.status)}）。`))
        }
      } catch (cause) {
        reportError(cause)
      }
    },
  }
}

const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
])

function issuerRequest(target: URL): typeof httpsRequest {
  if (target.protocol === 'https:') return httpsRequest
  if (
    target.protocol === 'http:'
    && isLoopbackHostname(target.hostname)
  ) return httpRequest
  throw new Error(`GPTAuth issuer must use HTTPS unless it is a loopback acceptance fixture: ${target.origin}`)
}

function forwardedHeaders(headers: IncomingHttpHeaders, accessToken: string, host: string): Record<string, string | string[]> {
  const next: Record<string, string | string[]> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || HOP_BY_HOP_HEADERS.has(name.toLowerCase()) || name.toLowerCase() === 'authorization') continue
    next[name] = value
  }
  next.host = host
  next.authorization = `Bearer ${accessToken}`
  return next
}

function responseHeaders(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const next: Record<string, string | string[]> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) continue
    next[name] = value
  }
  return next
}

async function readRequestBody(request: AsyncIterable<Buffer | Uint8Array>, maxBytes = MAX_PROXY_BODY_BYTES): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) throw new Error('模型请求体超过本地代理限制。')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function startLocalOAuthProxy(
  issuerUrl: string,
  localProxyKey: string,
  oauthMemory: OAuthMemory,
): Promise<{ readonly baseURL: string; close(): Promise<void> }> {
  const server = createServer(async (request, response) => {
    try {
      const incoming = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (!incoming.pathname.startsWith('/v1/')) {
        response.writeHead(404).end('Not Found')
        return
      }
      if (request.headers.authorization !== `Bearer ${localProxyKey}`) {
        response.writeHead(401).end('Unauthorized')
        return
      }
      const target = new URL(`${incoming.pathname}${incoming.search}`, issuerUrl)
      const accessToken = await oauthMemory.accessToken()
      let body: Buffer | undefined
      let headers = forwardedHeaders(request.headers, accessToken, target.host)
      if (request.method === 'POST' && incoming.pathname === '/v1/chat/completions') {
        const source = await readRequestBody(request)
        body = Buffer.from(JSON.stringify(normalizeRuijieChatPayload(JSON.parse(source.toString('utf8')))))
        headers = { ...headers, 'content-length': String(body.length) }
      }
      const upstream = issuerRequest(target)(target, { method: request.method, headers }, upstreamResponse => {
        response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders(upstreamResponse.headers))
        upstreamResponse.pipe(response)
      })
      upstream.once('error', () => {
        if (!response.headersSent) response.writeHead(502)
        response.end('GPTAuth proxy request failed')
      })
      request.once('aborted', () => { upstream.destroy() })
      if (body === undefined) request.pipe(upstream)
      else upstream.end(body)
    } catch (cause) {
      response.writeHead(502).end(cause instanceof Error ? cause.message : 'GPTAuth proxy request failed')
    }
  })
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('无法启动本地 OAuth 转发器。')
  let closed = false
  return {
    baseURL: `http://127.0.0.1:${String(address.port)}/v1`,
    async close(): Promise<void> {
      if (closed) return
      closed = true
      await new Promise<void>(resolveClose => { server.close(() => { resolveClose() }) })
    },
  }
}

/** Ensure the desktop has one authenticated model environment for its lifetime. */
export async function ensureRuijieAuthEnvironment(options: RuijieAuthOptions): Promise<RuijieAuthEnvironment> {
  const issuerUrl = issuer(options.environment)
  const client = clientId(options.environment)
  const port = callbackPort(options.environment)
  const redirectUri = `http://${CALLBACK_HOST}:${String(port)}${CALLBACK_PATH}`
  const reportError = options.onError ?? (() => {})
  const requestTimeoutMs = options.requestTimeoutMs ?? AUTH_REQUEST_TIMEOUT_MS
  const establishEnvironment = async (tokens: RuijieOAuthTokens): Promise<RuijieAuthEnvironment> => {
    const oauthMemory = createOAuthMemory(issuerUrl, client, tokens, options.credentialStore, reportError, requestTimeoutMs)
    const localProxyKey = randomBytes(32).toString('base64url')
    const proxy = await startLocalOAuthProxy(issuerUrl, localProxyKey, oauthMemory)
    try {
      const response = await fetchAccountService(new URL(`${proxy.baseURL}/models`), {
        headers: { authorization: `Bearer ${localProxyKey}` },
      }, requestTimeoutMs, 'GPTAuth 模型接口验证')
      if (!response.ok) {
        const message = `GPTAuth 模型接口验证失败（HTTP ${String(response.status)}）。`
        if ([401, 403].includes(response.status)) throw new OAuthSessionRejectedError(message)
        throw new Error(message)
      }
    } catch (cause) {
      await proxy.close()
      throw cause
    }
    options.environment.DEEPSEEK_API_KEY = localProxyKey
    options.environment.DEEPSEEK_BASE_URL = proxy.baseURL
    return {
      account: async () => await loadAccountSummary(issuerUrl, oauthMemory),
      logout: () => oauthMemory.logout(),
      close: () => proxy.close(),
    }
  }

  if (options.credentialStore !== undefined) {
    let restored: RuijieOAuthTokens | undefined
    try {
      restored = await options.credentialStore.load()
    } catch (cause) {
      reportError(cause)
      await options.credentialStore.clear()
    }
    if (restored !== undefined) {
      try {
        return await establishEnvironment(restored)
      } catch (cause) {
        if (!(cause instanceof OAuthSessionRejectedError)) throw cause
        await options.credentialStore.clear()
      }
    }
  }

  options.onStatus?.('authorization-required')
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const authorize = new URL('/oauth/authorize', issuerUrl)
  authorize.search = new URLSearchParams({
    response_type: 'code',
    product: 'harness',
    client_id: client,
    redirect_uri: redirectUri,
    scope: 'openid profile email offline_access api.connectors.invoke',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString()
  const code = await receiveAuthorizationCode(state, authorize.toString(), redirectUri, port, options.openExternal)
  options.onStatus?.('authorization-processing')
  const tokens = await exchangeAuthorizationCode(issuerUrl, client, redirectUri, code, verifier, requestTimeoutMs)
  await options.credentialStore?.save(tokens)
  const authenticated = await establishEnvironment(tokens)
  options.onStatus?.('authorization-complete')
  return authenticated
}
