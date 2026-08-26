import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { handleArchivedSessionActionRequest } from '../src/archived-session-route.ts'

function request(body: object, origin = 'http://127.0.0.1:1234') {
  const stream = new EventEmitter() as IncomingMessage & AsyncIterable<Buffer>
  Object.assign(stream, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) },
  })
  return stream
}

function response() {
  let body = ''
  const res = {
    statusCode: 0,
    setHeader: vi.fn(),
    end: vi.fn((chunk?: string) => { body = chunk ?? '' }),
  } as unknown as ServerResponse
  return { res, body: () => body }
}

describe('archived session action route', () => {
  it.each(['restore', 'delete', 'ungroup'] as const)('accepts the %s action from the renderer origin', async action => {
    const perform = vi.fn(async () => {})
    const out = response()
    await handleArchivedSessionActionRequest(request({ action, sessionId: 'session-1' }), out.res, 'http://127.0.0.1:1234', perform)
    expect(out.res.statusCode).toBe(200)
    expect(perform).toHaveBeenCalledWith({ action, sessionId: 'session-1' })
  })

  it('rejects cross-origin mutation', async () => {
    const perform = vi.fn(async () => {})
    const out = response()
    await handleArchivedSessionActionRequest(request({ action: 'delete', sessionId: 'session-1' }, 'https://example.com'), out.res, 'http://127.0.0.1:1234', perform)
    expect(out.res.statusCode).toBe(403)
    expect(perform).not.toHaveBeenCalled()
  })
})
