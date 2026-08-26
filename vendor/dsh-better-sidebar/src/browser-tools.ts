/** Model-facing browser tools and the in-memory Host -> Client command bus. */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Context } from './context-types.ts'

interface BrowserSearchSource {
  url: string
  title?: string
  snippet?: string
  publishedAt?: string
}

interface BrowserSearchResult {
  url: string
  delivered: boolean
  evidenceStatus: 'available' | 'unavailable'
  content?: string
  sources: BrowserSearchSource[]
}

export interface BrowserPageContent {
  commandId: number
  sessionId: string
  url: string
  title: string
  text: string
  links: BrowserSearchSource[]
  truncated: boolean
}

export interface BrowserCommand {
  id: number
  sessionId: string
  url: string
  title: string
  readPage?: boolean
}

type BrowserCommandListener = (command: BrowserCommand) => void

/**
 * Session-isolated one-way command bus. A command is delivered immediately
 * when the conversation UI is connected; otherwise it is retained briefly
 * in memory and drained by the next matching sidebar connection.
 */
export class BrowserCommandBroker {
  private nextId = 1
  private readonly listeners = new Map<string, Set<BrowserCommandListener>>()
  private readonly pending = new Map<string, BrowserCommand[]>()
  private readonly pageReads = new Map<number, {
    sessionId: string
    resolve: (value: BrowserPageContent | undefined) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  private readonly latestPages = new Map<string, BrowserPageContent>()

  issue(
    sessionId: string,
    url: string,
    title: string,
    options: { readPage?: boolean; timeoutMs?: number } = {},
  ): { command: BrowserCommand; delivered: boolean; page?: Promise<BrowserPageContent | undefined> } {
    const command = { id: this.nextId++, sessionId, url, title, ...(options.readPage === true ? { readPage: true } : {}) }
    let page: Promise<BrowserPageContent | undefined> | undefined
    if (options.readPage === true) {
      page = new Promise(resolve => {
        const timer = setTimeout(() => {
          this.pageReads.delete(command.id)
          resolve(undefined)
        }, options.timeoutMs ?? 15_000)
        this.pageReads.set(command.id, { sessionId, resolve, timer })
      })
    }
    const listeners = this.listeners.get(sessionId)
    if (listeners !== undefined && listeners.size > 0) {
      for (const listener of listeners) listener(command)
      return { command, delivered: true, ...(page === undefined ? {} : { page }) }
    }
    const queue = this.pending.get(sessionId) ?? []
    queue.push(command)
    // A disconnected UI only needs the latest few explicit navigation asks.
    this.pending.set(sessionId, queue.slice(-10))
    // There is no connected page to inspect yet. Keep the navigation queued,
    // but do not stall the agent waiting for a DOM that cannot arrive during
    // this tool call.
    if (page !== undefined) {
      const pendingRead = this.pageReads.get(command.id)
      if (pendingRead !== undefined) {
        clearTimeout(pendingRead.timer)
        this.pageReads.delete(command.id)
        pendingRead.resolve(undefined)
      }
    }
    return { command, delivered: false, ...(page === undefined ? {} : { page }) }
  }

  acceptPage(value: BrowserPageContent): boolean {
    this.latestPages.set(value.sessionId, value)
    const pending = this.pageReads.get(value.commandId)
    if (pending === undefined || pending.sessionId !== value.sessionId) return false
    clearTimeout(pending.timer)
    this.pageReads.delete(value.commandId)
    pending.resolve(value)
    return true
  }

  currentPage(sessionId: string): BrowserPageContent | undefined {
    return this.latestPages.get(sessionId)
  }

  cancelPage(commandId: number): void {
    const pending = this.pageReads.get(commandId)
    if (pending === undefined) return
    clearTimeout(pending.timer)
    this.pageReads.delete(commandId)
    pending.resolve(undefined)
  }

  subscribe(sessionId: string, listener: BrowserCommandListener): () => void {
    const listeners = this.listeners.get(sessionId) ?? new Set<BrowserCommandListener>()
    listeners.add(listener)
    this.listeners.set(sessionId, listeners)
    const queued = this.pending.get(sessionId)
    if (queued !== undefined) {
      this.pending.delete(sessionId)
      for (const command of queued) listener(command)
    }
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.listeners.delete(sessionId)
    }
  }

  clear(): void {
    this.listeners.clear()
    this.pending.clear()
    this.latestPages.clear()
    for (const pending of this.pageReads.values()) {
      clearTimeout(pending.timer)
      pending.resolve(undefined)
    }
    this.pageReads.clear()
  }
}

function sessionIdOf(exec: ToolRunContext): string {
  const sessionId = exec.agent?.session.id
  if (sessionId === undefined || sessionId === '') {
    throw new Error('sidebar browser tools require an initiating agent session')
  }
  return sessionId
}

function renderBrowserResult(_args: unknown, value: unknown): ContentBlock[] {
  const result = value as BrowserSearchResult | { url: string; delivered: boolean }
  const evidence = 'evidenceStatus' in result && result.evidenceStatus === 'available'
    ? [
        result.content,
        ...result.sources.map((source, index) => {
          const heading = `${String(index + 1)}. ${source.title ?? source.url} — ${source.url}`
          return source.snippet === undefined ? heading : `${heading}\n${source.snippet}`
        }),
      ].filter((line): line is string => typeof line === 'string' && line !== '').join('\n')
    : ''
  return [{
    type: 'text',
    text: `${result.delivered
      ? `Opened ${result.url} in the current conversation's right sidebar browser.`
      : `Queued ${result.url} for the current conversation's right sidebar browser; it will open when the sidebar connects.`}${evidence === '' ? '' : `\n\nMachine-readable search evidence:\n${evidence}`}`,
  }]
}

function renderCurrentPage(_args: unknown, value: unknown): ContentBlock[] {
  const result = value as { url?: string; title?: string; content?: string; sources: BrowserSearchSource[] }
  if (result.content === undefined || result.url === undefined) {
    return [{ type: 'text', text: 'The right-sidebar browser has no readable page content yet.' }]
  }
  return [{
    type: 'text',
    text: `Read the current right-sidebar page: ${result.title ?? result.url} — ${result.url}\n\n${result.content}`,
  }]
}

function pageEvidence(page: BrowserPageContent | undefined): {
  content?: string
  sources: BrowserSearchSource[]
} | undefined {
  if (page === undefined || page.text.trim().length < 40) return undefined
  const sources = page.links.length > 0
    ? page.links.slice(0, 20)
    : [{ url: page.url, title: page.title }]
  return { content: page.text, sources }
}

function providerEvidence(value: Awaited<ReturnType<Context['web']['search']>> | undefined): {
  content?: string
  sources: BrowserSearchSource[]
} | undefined {
  if (value === undefined || (value.sources.length === 0 && (value.content?.trim().length ?? 0) < 40)) return undefined
  return {
    ...(value.content === undefined ? {} : { content: value.content }),
    sources: value.sources.map(source => ({ ...source })),
  }
}

function validateHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('url must be a complete http:// or https:// address')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('only http:// and https:// addresses can be opened')
  }
  return url
}

/** Register browser_search and browser_open for every agent session. */
export function registerBrowserTools(ctx: Context, broker: BrowserCommandBroker): () => void {
  const disposers: Array<() => void> = []

  disposers.push(ctx.tools.register(defineTool({
    name: 'browser_search',
    description:
      'Open the visible browser in the current conversation right sidebar and search Bing for a query, while also returning machine-readable web evidence from the configured web_search provider. '
      + 'The desktop app reads the loaded right-sidebar result page directly when provider evidence is unavailable. '
      + 'Use this whenever the user asks you to open a browser, search something in the browser, or show web search results in the sidebar. '
      + 'Use the returned sources to answer, and call read_page for article details when needed. This controls the user-visible sidebar; do not claim that you cannot open or read the search when this tool is available.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'The exact search keywords to enter, without a search-engine URL.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true },
          delivered: { type: 'boolean', required: true },
          evidenceStatus: { type: 'string', enum: ['available', 'unavailable'], required: true },
          content: { type: 'string' },
          sources: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                url: { type: 'string', required: true },
                title: { type: 'string' },
                snippet: { type: 'string' },
                publishedAt: { type: 'string' },
              },
            },
          },
        },
      },
      render: renderBrowserResult,
    },
    execute: async (args: { query: string }, exec): Promise<BrowserSearchResult> => {
      exec.signal.throwIfAborted()
      const query = args.query.trim()
      if (query === '') throw new Error('query must not be empty')
      const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}`
      const sessionId = sessionIdOf(exec)
      const issued = broker.issue(sessionId, url, `必应搜索：${query}`, { readPage: true })
      const provider = ctx.web.search({ query, maxResults: 8 }, exec.signal)
        .then(value => {
          const evidence = providerEvidence(value)
          if (evidence !== undefined) broker.cancelPage(issued.command.id)
          return evidence
        })
        .catch(cause => {
          if (exec.signal.aborted) throw cause
          console.warn('[dsh-better-sidebar] browser_search provider evidence unavailable', cause)
          return undefined
        })
      const page = (issued.page ?? Promise.resolve(undefined)).then(value => pageEvidence(value))
      const first = await Promise.race([page, provider])
      const evidence = first ?? await Promise.all([page, provider]).then(values => values.find(Boolean))
      if (evidence !== undefined) {
        return {
          url,
          delivered: issued.delivered,
          evidenceStatus: 'available',
          ...(evidence.content === undefined ? {} : { content: evidence.content }),
          sources: evidence.sources,
        }
      }
      return { url, delivered: issued.delivered, evidenceStatus: 'unavailable', sources: [] }
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'browser_open',
    description:
      'Open a complete http:// or https:// URL in the visible browser in the current conversation right sidebar and return the readable text from that loaded page. '
      + 'Use browser_search instead when the user gives keywords rather than a URL.',
    parameters: {
      url: {
        type: 'string',
        required: true,
        description: 'Complete http:// or https:// URL to open.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true },
          delivered: { type: 'boolean', required: true },
          evidenceStatus: { type: 'string', enum: ['available', 'unavailable'], required: true },
          content: { type: 'string' },
          sources: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                url: { type: 'string', required: true },
                title: { type: 'string' },
              },
            },
          },
        },
      },
      render: renderBrowserResult,
    },
    execute: async (args: { url: string }, exec) => {
      exec.signal.throwIfAborted()
      const parsed = validateHttpUrl(args.url)
      const title = parsed.hostname || parsed.href
      const issued = broker.issue(sessionIdOf(exec), parsed.href, title, { readPage: true })
      const evidence = pageEvidence(await issued.page)
      exec.signal.throwIfAborted()
      return {
        url: parsed.href,
        delivered: issued.delivered,
        evidenceStatus: evidence === undefined ? 'unavailable' : 'available',
        ...(evidence?.content === undefined ? {} : { content: evidence.content }),
        sources: evidence?.sources ?? [],
      }
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'browser_read_current',
    description:
      'Read the title, visible article text, and links from the page currently open in this conversation right sidebar. '
      + 'Use it when the user navigated or clicked inside the sidebar browser and asks for a summary of what is now displayed.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          sources: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                url: { type: 'string', required: true },
                title: { type: 'string' },
              },
            },
          },
        },
      },
      render: renderCurrentPage,
    },
    execute: (_args: Record<string, never>, exec) => {
      exec.signal.throwIfAborted()
      const page = broker.currentPage(sessionIdOf(exec))
      const evidence = pageEvidence(page)
      return Promise.resolve({
        ...(page === undefined ? {} : { url: page.url, title: page.title }),
        ...(evidence?.content === undefined ? {} : { content: evidence.content }),
        sources: evidence?.sources ?? [],
      })
    },
  })))

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
