import { describe, expect, it } from 'vitest'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { BrowserCommandBroker, registerBrowserTools } from '../src/browser-tools.ts'
import type { Context } from '../src/context-types.ts'

function exec(sessionId: string): ToolRunContext {
  return {
    signal: { throwIfAborted: () => {}, aborted: false },
    agent: { session: { id: sessionId } },
  } as unknown as ToolRunContext
}

function mount() {
  const captured: ToolDefinition[] = []
  const ctx = {
    tools: {
      register(tool: unknown) {
        captured.push(tool as ToolDefinition)
        return () => {}
      },
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
    const { broker, captured } = mount()
    const received: unknown[] = []
    broker.subscribe('session-a', command => { received.push(command) })

    const result = await toolOf(captured, 'browser_search').execute({ query: '格列兹曼' }, exec('session-a'))

    expect(result).toMatchObject({ delivered: true })
    expect(received).toEqual([
      expect.objectContaining({
        sessionId: 'session-a',
        url: 'https://cn.bing.com/search?q=%E6%A0%BC%E5%88%97%E5%85%B9%E6%9B%BC',
      }),
    ])
  })

  it('never sends one session browser command to another session', async () => {
    const { broker, captured } = mount()
    const received: unknown[] = []
    broker.subscribe('session-b', command => { received.push(command) })

    await toolOf(captured, 'browser_open').execute({ url: 'https://example.com/path' }, exec('session-a'))

    expect(received).toEqual([])
  })
})
