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
  it('registers search, open, and current-page browser tools', () => {
    const { captured } = mount()
    expect(captured.map(tool => tool.name)).toEqual(['browser_search', 'browser_open', 'browser_read_current'])
  })

  it('pushes a Bing search into the calling session sidebar', async () => {
    const search = async () => ({
      content: '今日新闻摘要',
      sources: [{ url: 'https://news.example/article', title: '新闻标题', snippet: '新闻正文摘要' }],
      truncated: false,
    })
    const { broker, captured } = mount({ search })
    const received: unknown[] = []
    broker.subscribe('session-a', command => {
      received.push(command)
      broker.acceptPage({
        commandId: command.id,
        sessionId: command.sessionId,
        url: command.url,
        title: '必应结果',
        text: '这是从右侧栏页面直接读取的搜索结果正文，包含足够长度供模型进行新闻总结与引用。',
        links: [{ url: 'https://news.example/local', title: '右栏新闻' }],
        truncated: false,
      })
    })

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
    broker.subscribe('session-a', command => {
      received.push(command)
      broker.acceptPage({
        commandId: command.id,
        sessionId: command.sessionId,
        url: command.url,
        title: '',
        text: '',
        links: [],
        truncated: false,
      })
    })

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

  it('reads a page that the user navigated to inside the right sidebar', async () => {
    const { broker, captured } = mount()
    broker.acceptPage({
      commandId: 0,
      sessionId: 'session-a',
      url: 'https://news.example/current',
      title: '当前新闻',
      text: '这是用户在右侧栏中主动点开的新闻正文，模型应该能够直接读取并完成准确总结，同时保留新闻原始来源链接供用户核验。',
      links: [{ url: 'https://news.example/source', title: '原始来源' }],
      truncated: false,
    })

    const result = await toolOf(captured, 'browser_read_current').execute({}, exec('session-a'))

    expect(result).toMatchObject({
      url: 'https://news.example/current',
      title: '当前新闻',
      content: expect.stringContaining('新闻正文'),
      sources: [{ url: 'https://news.example/source', title: '原始来源' }],
    })
  })
})
