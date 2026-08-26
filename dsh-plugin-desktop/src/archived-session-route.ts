import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ArchivedSessionActionRequest } from './archived-session-contract.ts'

const MAX_BODY_BYTES = 4 * 1024

function finishJson(res: ServerResponse, statusCode: number, value: object): void {
  res.statusCode = statusCode
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

async function readRequest(req: IncomingMessage): Promise<ArchivedSessionActionRequest> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('request body is too large')
    chunks.push(buffer)
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  if (typeof value !== 'object' || value === null) throw new Error('invalid request')
  const { action, sessionId } = value as { action?: unknown, sessionId?: unknown }
  if ((action !== 'restore' && action !== 'delete' && action !== 'ungroup') || typeof sessionId !== 'string' || sessionId === '') {
    throw new Error('invalid request')
  }
  return { action, sessionId }
}

/** Restore an archived session or permanently erase its local event log. */
export async function handleArchivedSessionActionRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  perform: (request: ArchivedSessionActionRequest) => Promise<void>,
  reportError: (cause: unknown) => void = () => {},
): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, { error: 'method not allowed' })
  if (req.headers.origin !== expectedOrigin) return finishJson(res, 403, { error: 'forbidden' })
  if (req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return finishJson(res, 415, { error: 'content type must be application/json' })
  }
  let request: ArchivedSessionActionRequest
  try {
    request = await readRequest(req)
  } catch (cause) {
    reportError(cause)
    return finishJson(res, 400, { error: 'invalid archived-session request' })
  }
  try {
    await perform(request)
    finishJson(res, 200, { ok: true })
  } catch (cause) {
    reportError(cause)
    finishJson(res, 409, { error: cause instanceof Error ? cause.message : 'archived-session action failed' })
  }
}
