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

export interface BrowserCommand {
  id: number
  sessionId: string
  url: string
  title: string
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

  issue(sessionId: string, url: string, title: string): { command: BrowserCommand; delivered: boolean } {
    const command = { id: this.nextId++, sessionId, url, title }
    const listeners = this.listeners.get(sessionId)
    if (listeners !== undefined && listeners.size > 0) {
      for (const listener of listeners) listener(command)
      return { command, delivered: true }
    }
    const queue = this.pending.get(sessionId) ?? []
    queue.push(command)
    // A disconnected UI only needs the latest few explicit navigation asks.
    this.pending.set(sessionId, queue.slice(-10))
    return { command, delivered: false }
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
      const { delivered } = broker.issue(sessionIdOf(exec), url, `必应搜索：${query}`)
      try {
        const evidence = await ctx.web.search({ query, maxResults: 8 }, exec.signal)
        return {
          url,
          delivered,
          evidenceStatus: 'available',
          ...(evidence.content === undefined ? {} : { content: evidence.content }),
          sources: evidence.sources.map((source: BrowserSearchSource) => ({ ...source })),
        }
      } catch (cause) {
        if (exec.signal.aborted) throw cause
        // Opening the user-visible browser is independently useful. Provider
        // exhaustion must not turn a successful navigation into a tool error;
        // the provider trail remains available in host diagnostics.
        console.warn('[dsh-better-sidebar] browser_search evidence unavailable', cause)
        return { url, delivered, evidenceStatus: 'unavailable', sources: [] }
      }
    },
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'browser_open',
    description:
      'Open a complete http:// or https:// URL in the visible browser in the current conversation right sidebar. '
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
        },
      },
      render: renderBrowserResult,
    },
    execute: (args: { url: string }, exec) => {
      exec.signal.throwIfAborted()
      const parsed = validateHttpUrl(args.url)
      const title = parsed.hostname || parsed.href
      const { delivered } = broker.issue(sessionIdOf(exec), parsed.href, title)
      return Promise.resolve({ url: parsed.href, delivered })
    },
  })))

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
