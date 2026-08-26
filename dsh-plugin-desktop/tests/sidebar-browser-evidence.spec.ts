import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

interface BrowserModule {
  BrowserCommandBroker: new () => {
    subscribe(sessionId: string, listener: (command: unknown) => void): () => void
  }
  registerBrowserTools(
    ctx: unknown,
    broker: unknown,
  ): () => void
}

const browserModuleUrl = pathToFileURL(resolve('node_modules/dsh-better-sidebar/lib/index.js')).href
const { BrowserCommandBroker, registerBrowserTools } = await import(browserModuleUrl) as BrowserModule

function execution(sessionId: string): ToolRunContext {
  return {
    signal: { throwIfAborted: () => {}, aborted: false },
    agent: { session: { id: sessionId } },
  } as unknown as ToolRunContext
}

function mounted(search: (request: { query: string; maxResults?: number }) => Promise<unknown>) {
  const tools: ToolDefinition[] = []
  const broker = new BrowserCommandBroker()
  registerBrowserTools({
    tools: {
      register(tool: unknown) {
        tools.push(tool as ToolDefinition)
        return () => {}
      },
    },
    web: { search },
  } as never, broker)
  const browserSearch = tools.find(tool => tool.name === 'browser_search')
  if (browserSearch === undefined) throw new Error('browser_search was not registered')
  return { broker, browserSearch }
}

describe('sidebar browser search evidence', () => {
  it('opens the right browser and returns the selected web provider evidence', async () => {
    const { broker, browserSearch } = mounted(async () => ({
      content: '两条新闻摘要',
      sources: [{ url: 'https://news.example/story', title: '新闻标题', snippet: '新闻摘要' }],
      truncated: false,
    }))
    const commands: unknown[] = []
    broker.subscribe('session-a', command => { commands.push(command) })

    const result = await browserSearch.execute({ query: '今日 AI 新闻' }, execution('session-a'))

    expect(commands).toEqual([expect.objectContaining({ sessionId: 'session-a' })])
    expect(result).toMatchObject({
      delivered: true,
      evidenceStatus: 'available',
      content: '两条新闻摘要',
      sources: [{ url: 'https://news.example/story', title: '新闻标题' }],
    })
  })

  it('keeps the right browser successful when evidence providers are exhausted', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { broker, browserSearch } = mounted(async () => { throw new Error('quota exhausted') })
    const commands: unknown[] = []
    broker.subscribe('session-a', command => { commands.push(command) })

    const result = await browserSearch.execute({ query: '今日 AI 新闻' }, execution('session-a'))

    expect(commands).toHaveLength(1)
    expect(result).toMatchObject({ delivered: true, evidenceStatus: 'unavailable', sources: [] })
    expect(warning).toHaveBeenCalledOnce()
    warning.mockRestore()
  })
})
