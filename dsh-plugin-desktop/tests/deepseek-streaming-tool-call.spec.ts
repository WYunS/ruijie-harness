import type { AnonymousUserId } from '@deepseek-ai/dsh-anonymous-user-id'
import { MessageId, type StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  DeepSeekAdapter,
  resolveAdapterOptions,
} from '@deepseek-ai/dsh-llm-deepseek'
import { afterEach, describe, expect, it, vi } from 'vitest'

function sseResponse(payloads: readonly unknown[]): Response {
  const body = payloads
    .map(payload => `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`)
    .join('')
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

describe('DeepSeek streaming tool calls', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the first non-empty id and name when continuation deltas contain empty strings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_web_search',
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":' },
            }],
          },
        }],
      },
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: '',
              function: { name: '', arguments: '"AI news today"}' },
            }],
          },
        }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
      '[DONE]',
    ])))

    const connection = resolveAdapterOptions({
      baseURL: 'https://example.test/v1',
      thinking: 'disabled',
    })
    const adapter = new DeepSeekAdapter({
      options: () => connection,
      resolveApiKey: async () => 'test-key',
      resolveUserId: () => 'test-user' as AnonymousUserId,
    })
    const chunks: StreamChunk[] = []

    for await (const chunk of adapter.stream({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      messages: [{
        id: MessageId('message-user'),
        role: 'user',
        content: [{ type: 'text', text: 'Search today AI news' }],
        source: { kind: 'user' },
      }],
      tools: [{
        name: 'web_search',
        description: 'Search the web',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      }],
    })) chunks.push(chunk)

    expect(chunks.find(chunk => chunk.type === 'block-end')).toMatchObject({
      block: {
        type: 'tool-call',
        id: 'call_web_search',
        name: 'web_search',
        arguments: '{"query":"AI news today"}',
      },
    })
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'tool-calls' },
    })
  })

  it('does not surface legacy DSML snapshots when the gateway also emits native tool calls', async () => {
    const legacyPrefix = '<｜DSML｜tool_calls> <｜DSML｜invoke name="excel_create">'
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      {
        choices: [{
          delta: {
            content: legacyPrefix,
            tool_calls: [{
              index: 0,
              id: 'call_excel_create',
              type: 'function',
              function: { name: 'excel_create', arguments: '{"path":' },
            }],
          },
        }],
      },
      {
        choices: [{
          delta: {
            // The affected gateway sends cumulative legacy snapshots. They
            // are transport control text, not assistant-visible prose.
            content: `${legacyPrefix} <｜DSML｜parameter name="path">report.xlsx`,
            tool_calls: [{
              index: 0,
              id: '',
              function: { name: '', arguments: '"report.xlsx"}' },
            }],
          },
        }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
      '[DONE]',
    ])))

    const adapter = new DeepSeekAdapter({
      options: () => resolveAdapterOptions({
        baseURL: 'https://example.test/v1',
        thinking: 'disabled',
      }),
      resolveApiKey: async () => 'test-key',
      resolveUserId: () => 'test-user' as AnonymousUserId,
    })
    const chunks: StreamChunk[] = []

    for await (const chunk of adapter.stream({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      messages: [{
        id: MessageId('message-user'),
        role: 'user',
        content: [{ type: 'text', text: 'Create an Excel workbook' }],
        source: { kind: 'user' },
      }],
      tools: [{
        name: 'excel_create',
        description: 'Create an Excel workbook',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      }],
    })) chunks.push(chunk)

    expect(chunks.filter(chunk => chunk.type === 'text-delta')).toEqual([])
    expect(chunks.find(chunk => chunk.type === 'block-end')).toMatchObject({
      block: {
        type: 'tool-call',
        id: 'call_excel_create',
        name: 'excel_create',
        arguments: '{"path":"report.xlsx"}',
      },
    })
  })

  it('loads the Harness model catalog with tag 2 while keeping Luna hidden', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      object: 'list',
      ability_tag: '2',
      data: [
        { id: 'harness-selected-model', object: 'model' },
        { id: 'deepseek-v4-pro', object: 'model' },
        { id: 'gpt-5.6-luna', object: 'model' },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const connection = resolveAdapterOptions({
      baseURL: 'https://example.test/v1',
      thinking: 'disabled',
      models: [{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }],
    })
    const adapter = new DeepSeekAdapter({
      options: () => connection,
      resolveApiKey: async () => 'harness-test-key',
      resolveUserId: () => 'test-user' as AnonymousUserId,
    })

    await expect(adapter.listModels('deepseek-official')).resolves.toEqual([
      {
        provider: 'deepseek-official',
        id: 'harness-selected-model',
        name: 'harness-selected-model',
        inputModalities: ['text'],
      },
      {
        provider: 'deepseek-official',
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        inputModalities: ['text'],
      },
    ])
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://example.test/v1/models?tag=2')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        authorization: 'Bearer harness-test-key',
        accept: 'application/json',
      },
    })
  })

  it('keeps the two configured models for legacy and unconfigured Harness catalogs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      object: 'list',
      data: [{ id: 'legacy-codex-model', object: 'model' }],
    }), { status: 200 })))

    const connection = resolveAdapterOptions({
      baseURL: 'https://legacy.example.test/v1',
      thinking: 'enabled',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash' },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
      ],
    })
    const adapter = new DeepSeekAdapter({
      options: () => connection,
      resolveApiKey: async () => 'legacy-test-key',
      resolveUserId: () => 'test-user' as AnonymousUserId,
    })

    const models = await adapter.listModels('deepseek-official')
    expect(models.map(model => model.id)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      object: 'list',
      ability_tag: '2',
      data: [],
    }), { status: 200 })))
    const unconfiguredModels = await adapter.listModels('deepseek-official')
    expect(unconfiguredModels.map(model => model.id)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])

    await expect(adapter.resolveModel('deepseek-official', 'deepseek-v4-flash')).resolves.toMatchObject({
      reasoning: {
        efforts: [
          { id: 'off' },
          { id: 'low' },
          { id: 'high' },
          { id: 'max' },
        ],
      },
    })
  })
})
