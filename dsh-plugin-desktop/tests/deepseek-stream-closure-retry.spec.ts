import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import type { AnonymousUserId } from '@deepseek-ai/dsh-anonymous-user-id'
import {
  createUserMessage,
  LlmRuntime,
} from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import {
  DeepSeekAdapter,
  resolveAdapterOptions,
} from '@deepseek-ai/dsh-llm-deepseek'
import * as retry from '@deepseek-ai/dsh-llm-retry'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'

let context: Context | undefined

function sseResponse(payloads: readonly unknown[]): Response {
  return new Response(payloads
    .map(payload => `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`)
    .join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

async function harness(maxRetries: number): Promise<{ ctx: Context; requests: ReturnType<typeof vi.fn> }> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(Object.assign((inner: Context) => {
    retry.apply(inner, {}, { random: () => 0.5 })
  }, { inject: retry.inject }))
  await ctx.plugin(AgentLoop, { agents: [] })

  const requests = vi.fn()
  const adapter = new DeepSeekAdapter({
    options: () => resolveAdapterOptions({
      baseURL: 'https://example.test/v1',
      thinking: 'disabled',
      retryPolicy: {
        mode: 'normal',
        maxRetries,
        retryableCodes: ['STREAM_CLOSED'],
        backoff: { initialDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 },
      },
    }),
    resolveApiKey: async () => 'test-key',
    resolveUserId: () => 'test-user' as AnonymousUserId,
  })
  ctx.llm.registerAdapter(['deepseek-official'], adapter)
  return { ctx, requests }
}

function waitForRetry(ctx: Context, retryNumber: number): Promise<Extract<SessionEvent, { type: 'llm/retry' }>> {
  return new Promise((resolve) => {
    const dispose = ctx.on('session/event', (_session, event) => {
      if (event.type === 'llm/retry' && event.data.retry === retryNumber) {
        dispose()
        resolve(event)
      }
    })
  })
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await context?.fiber.dispose()
  context = undefined
})

describe('DeepSeek SSE closure recovery', () => {
  it('retries a missing [DONE] marker and commits only the complete retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse([{ choices: [{ delta: { content: 'discarded partial' } }] }]))
      .mockResolvedValueOnce(sseResponse([
        { choices: [{ delta: { content: 'recovered answer' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
        '[DONE]',
      ]))
    vi.stubGlobal('fetch', fetchMock)
    const result = await harness(3)
    context = result.ctx
    const agent = context.agentLoop.create(SessionId('stream-closure-recovered'), {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })
    const scheduled = waitForRetry(context, 1)

    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'go' }],
      source: { kind: 'user' },
    }))
    await scheduled
    await agent.whenIdle()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(agent.session.deriveMessages().at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'recovered answer' }],
    })
    expect(agent.session.deriveMessages().some(message => JSON.stringify(message).includes('discarded partial'))).toBe(false)
  })

  it('keeps a permanently truncated response failed after the configured retry limit', async () => {
    const fetchMock = vi.fn(async () => sseResponse([
      { choices: [{ delta: { content: 'never complete' } }] },
    ]))
    vi.stubGlobal('fetch', fetchMock)
    const result = await harness(1)
    context = result.ctx
    const agent = context.agentLoop.create(SessionId('stream-closure-exhausted'), {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })
    const scheduled = waitForRetry(context, 1)

    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'go' }],
      source: { kind: 'user' },
    }))
    await scheduled
    await agent.whenIdle()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(agent.session.events.filter(event => event.type === 'llm/retry')).toHaveLength(1)
    expect(agent.session.deriveMessages().some(message => JSON.stringify(message).includes('never complete'))).toBe(false)
  })
})
