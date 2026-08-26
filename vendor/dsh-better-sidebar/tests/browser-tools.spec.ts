import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { BrowserCommandBroker, registerBrowserTools } from '../src/browser-tools.ts'
import type { Context } from '../src/context-types.ts'

function exec(sessionId: string): ToolRunContext {
  return {
    signal: { throwIfAborted: () => {}, aborted: false },
    agent: { session: { id: sessionId } },
  } as unknown as ToolRunContext
}

function mount(options: { search?: (request: { query: string; maxResults?: number }) => Promise<unknown> } = {}) {
  const captured: ToolDefinition[] = []
  const ctx = {
    tools: {
      register(tool: unknown) {
        captured.push(tool as ToolDefinition)
        return () => {}
      },
    },
    web: {
      search: options.search ?? (async () => ({ content: '', sources: [], truncated: false })),
    },
  } as unknown as Context
  const broker = new BrowserCommandBroker()
  const dispose = registerBrowserTools(ctx, broker)
  return { broker, captured, dispose }
}

function toolOf(captured: ToolDefinition[], name: string): ToolDefinition {
  const tool = captured.find(candidate => candidate.name === name)
  if (tool === undefined) throw new Error(`tool ${name} was not registered`)
  return tool
}

describe('model-facing sidebar browser tools', () => {
  it('registers browser_search and browser_open', () => {
    const { captured } = mount()
    expect(captured.map(tool => tool.name)).toEqual(['browser_search', 'browser_open'])
  })

  it('pushes a Bing search into the calling session sidebar', async () => {
    const search = async () => ({
      content: '今日新闻摘要',
      sources: [{ url: 'https://news.example/article', title: '新闻标题', snippet: '新闻正文摘要' }],
      truncated: false,
    })
    const { broker, captured } = mount({ search })
    const received: unknown[] = []
    broker.subscribe('session-a', command => { received.push(command) })

    const result = await toolOf(captured, 'browser_search').execute({ query: '格列兹曼' }, exec('session-a'))

    expect(result).toMatchObject({
      delivered: true,
      evidenceStatus: 'available',
      content: '今日新闻摘要',
      sources: [{ url: 'https://news.example/article', title: '新闻标题' }],
    })
    expect(received).toEqual([
      expect.objectContaining({
        sessionId: 'session-a',
        url: 'https://cn.bing.com/search?q=%E6%A0%BC%E5%88%97%E5%85%B9%E6%9B%BC',
      }),
    ])
  })

  it('keeps the visible browser usable when every evidence provider fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { broker, captured } = mount({ search: async () => { throw new Error('providers exhausted') } })
    const received: unknown[] = []
    broker.subscribe('session-a', command => { received.push(command) })

    const result = await toolOf(captured, 'browser_search').execute({ query: 'AI 新闻' }, exec('session-a'))

    expect(result).toMatchObject({ delivered: true, evidenceStatus: 'unavailable', sources: [] })
    expect(received).toHaveLength(1)
    expect(warning).toHaveBeenCalledOnce()
    warning.mockRestore()
  })

  it('never sends one session browser command to another session', async () => {
    const { broker, captured } = mount()
    const received: unknown[] = []
    broker.subscribe('session-b', command => { received.push(command) })

    await toolOf(captured, 'browser_open').execute({ url: 'https://example.com/path' }, exec('session-a'))

    expect(received).toEqual([])
  })
})
