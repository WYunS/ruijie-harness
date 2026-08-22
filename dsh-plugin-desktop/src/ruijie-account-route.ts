import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  RUIJIE_ACCOUNT_CLIENT_HEADER,
  RUIJIE_ACCOUNT_CLIENT_VALUE,
  type RuijieAccountError,
  type RuijieAccountSummary,
} from './ruijie-account-contract.ts'

function finishJson(
  res: ServerResponse,
  statusCode: number,
  value: RuijieAccountSummary | RuijieAccountError,
): void {
  res.statusCode = statusCode
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

function finishEmpty(res: ServerResponse, statusCode: number): void {
  res.statusCode = statusCode
  res.setHeader('cache-control', 'no-store')
  res.end()
}

/** Serve the authenticated user's non-secret identity and wallet totals. */
export async function handleRuijieAccountRequest(
  req: IncomingMessage,
  res: ServerResponse,
  summary: () => Promise<RuijieAccountSummary>,
  reportError: (cause: unknown) => void = () => {},
): Promise<void> {
  if (req.method !== 'GET') return finishJson(res, 405, { error: 'method not allowed' })
  if (req.headers[RUIJIE_ACCOUNT_CLIENT_HEADER] !== RUIJIE_ACCOUNT_CLIENT_VALUE) {
    return finishJson(res, 403, { error: 'forbidden' })
  }
  try {
    finishJson(res, 200, await summary())
  } catch (cause) {
    reportError(cause)
    finishJson(res, 502, { error: '无法读取锐捷账号额度' })
  }
}

/** Clear the protected OAuth session, then restart into interactive sign-in. */
export async function handleRuijieLogoutRequest(
  req: IncomingMessage,
  res: ServerResponse,
  logout: () => Promise<void>,
  restart: () => Promise<void>,
  reportError: (cause: unknown) => void = () => {},
): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, { error: 'method not allowed' })
  if (req.headers[RUIJIE_ACCOUNT_CLIENT_HEADER] !== RUIJIE_ACCOUNT_CLIENT_VALUE) {
    return finishJson(res, 403, { error: 'forbidden' })
  }
  try {
    await logout()
  } catch (cause) {
    reportError(cause)
    return finishJson(res, 500, { error: '无法退出锐捷账号' })
  }
  finishEmpty(res, 204)
  try {
    await restart()
  } catch (cause) {
    reportError(cause)
  }
}
