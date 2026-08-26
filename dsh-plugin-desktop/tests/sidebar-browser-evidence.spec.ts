import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

interface BrowserModule {
  BrowserCommandBroker: new () => {
    subscribe(sessionId: string, listener: (command: {
      id: number
      sessionId: string
      url: string
      title: string
    }) => void): () => void
    acceptPage(value: {
      commandId: number
      sessionId: string
      url: string
      title: string
      text: string
      links: Array<{ url: string; title?: string }>
      truncated: boolean
    }): boolean
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
  const browserOpen = tools.find(tool => tool.name === 'browser_open')
  const browserReadCurrent = tools.find(tool => tool.name === 'browser_read_current')
  if (browserOpen === undefined || browserReadCurrent === undefined) throw new Error('browser read tools were not registered')
  return { broker, browserSearch, browserOpen, browserReadCurrent }
}

describe('sidebar browser search evidence', () => {
  it('opens the right browser and returns the selected web provider evidence', async () => {
    const { broker, browserSearch } = mounted(async () => ({
      content: '两条新闻摘要',
      sources: [{ url: 'https://news.example/story', title: '新闻标题', snippet: '新闻摘要' }],
      truncated: false,
    }))
    const commands: unknown[] = []
    broker.subscribe('session-a', command => {
      commands.push(command)
      broker.acceptPage({
        commandId: command.id,
        sessionId: command.sessionId,
        url: command.url,
        title: '右栏结果',
        text: '这是右侧栏浏览器加载后提取的正文内容，长度足够用于机器读取和后续总结。',
        links: [{ url: 'https://news.example/sidebar', title: '右栏来源' }],
        truncated: false,
      })
    })

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
    broker.subscribe('session-a', command => {
      commands.push(command)
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

    const result = await browserSearch.execute({ query: '今日 AI 新闻' }, execution('session-a'))

    expect(commands).toHaveLength(1)
    expect(result).toMatchObject({ delivered: true, evidenceStatus: 'unavailable', sources: [] })
    expect(warning).toHaveBeenCalledOnce()
    warning.mockRestore()
  })

  it('uses the loaded right-sidebar page when search providers are exhausted', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { broker, browserSearch } = mounted(async () => { throw new Error('rate limited') })
    broker.subscribe('session-a', command => {
      broker.acceptPage({
        commandId: command.id,
        sessionId: command.sessionId,
        url: command.url,
        title: '必应搜索结果',
        text: '右侧栏已经成功加载搜索结果，这些可见文字由桌面应用直接提取，不依赖任何外部抓取供应商，也不会向用户显示供应商错误。',
        links: [{ url: 'https://news.example/local-result', title: '本地读取结果' }],
        truncated: false,
      })
    })

    const result = await browserSearch.execute({ query: '今日科技新闻' }, execution('session-a'))

    expect(result).toMatchObject({
      delivered: true,
      evidenceStatus: 'available',
      content: expect.stringContaining('桌面应用直接提取'),
      sources: [{ url: 'https://news.example/local-result' }],
    })
    expect(JSON.stringify(result)).not.toMatch(/rate limited|Firecrawl/iu)
    expect(warning).toHaveBeenCalledOnce()
    warning.mockRestore()
  })

  it('returns DOM evidence from browser_open without using a search provider', async () => {
    const search = vi.fn()
    const { broker, browserOpen } = mounted(search)
    broker.subscribe('session-a', command => {
      broker.acceptPage({
        commandId: command.id,
        sessionId: command.sessionId,
        url: command.url,
        title: '新闻正文',
        text: '这是从右侧栏隔离网页中直接读取出来的完整新闻正文，模型能够使用这段内容进行总结，并给出用户可以核验的网页来源。',
        links: [{ url: 'https://news.example/source', title: '新闻来源' }],
        truncated: false,
      })
    })

    const result = await browserOpen.execute({ url: 'https://news.example/story' }, execution('session-a'))

    expect(search).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      delivered: true,
      evidenceStatus: 'available',
      content: expect.stringContaining('完整新闻正文'),
      sources: [{ url: 'https://news.example/source' }],
    })
  })

  it('reads the latest page after the user navigates inside the sidebar', async () => {
    const { broker, browserReadCurrent } = mounted(async () => ({ sources: [], truncated: false }))
    broker.acceptPage({
      commandId: 0,
      sessionId: 'session-a',
      url: 'https://news.example/current',
      title: '用户当前页面',
      text: '这是用户在右侧栏中自行点击打开的新闻正文，模型可以读取当前页面后继续在聊天区完成准确清晰的内容总结。',
      links: [{ url: 'https://news.example/current', title: '用户当前页面' }],
      truncated: false,
    })

    const result = await browserReadCurrent.execute({}, execution('session-a'))

    expect(result).toMatchObject({
      url: 'https://news.example/current',
      content: expect.stringContaining('自行点击打开'),
    })
  })
})
