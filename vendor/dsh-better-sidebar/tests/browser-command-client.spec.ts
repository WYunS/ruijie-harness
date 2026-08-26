import { describe, expect, it, vi } from 'vitest'
import { applyBrowserCommand, parseBrowserCommand } from '../src/client/browser-command.ts'

describe('browser command client bridge', () => {
  it('opens a pushed model command as a visible browser tab', () => {
    const openTab = vi.fn()
    const getSnapshot = vi.fn(() => ({ sessionId: undefined, state: undefined }))
    const command = parseBrowserCommand(JSON.stringify({
      id: 1,
      sessionId: 'session-a',
      url: 'https://www.baidu.com/s?wd=test',
      title: '百度搜索：test',
      readPage: true,
    }))

    expect(command).not.toBeNull()
    applyBrowserCommand({ getSnapshot, openTab } as never, command!)
    expect(openTab).toHaveBeenCalledWith({
      type: 'browser',
      url: 'https://www.baidu.com/s?wd=test',
      title: '百度搜索：test',
      placement: 'right',
      meta: { browserNavigationId: 1, browserReadRequestId: 1 },
    }, { sessionId: 'session-a' })
  })

  it('reuses and navigates the active browser for a second model command', () => {
    const service = {
      getSnapshot: () => ({
        sessionId: 'session-a',
        state: {
          activePane: 'pane-1',
          splits: {
            kind: 'leaf', id: 'pane-1', active: 'browser:1',
            tabs: [{ id: 'browser:1', type: 'browser', title: 'first', path: 'https://example.com/first' }],
          },
          bottomSplits: { kind: 'leaf', id: 'pane-2', active: null, tabs: [] },
        },
      }),
      openTab: vi.fn(),
      updateTab: vi.fn(),
      activateTab: vi.fn(),
    }

    applyBrowserCommand(service as never, {
      id: 2,
      sessionId: 'session-a',
      url: 'https://cn.bing.com/search?q=second',
      title: '必应搜索：second',
      readPage: true,
    })

    expect(service.openTab).not.toHaveBeenCalled()
    expect(service.updateTab).toHaveBeenCalledWith('browser:1', {
      path: 'https://cn.bing.com/search?q=second',
      title: '必应搜索：second',
      meta: { browserNavigationId: 2, browserReadRequestId: 2 },
    })
    expect(service.activateTab).toHaveBeenCalledWith('browser:1', { sessionId: 'session-a' })
  })

  it('marks a repeated URL as a fresh navigation request', () => {
    const service = {
      getSnapshot: () => ({
        sessionId: 'session-a',
        state: {
          activePane: 'pane-1',
          splits: {
            kind: 'leaf', id: 'pane-1', active: 'browser:1',
            tabs: [{
              id: 'browser:1', type: 'browser', title: 'same',
              path: 'https://example.com/same', meta: { browserNavigationId: 1, retained: true },
            }],
          },
          bottomSplits: { kind: 'leaf', id: 'pane-2', active: null, tabs: [] },
        },
      }),
      openTab: vi.fn(),
      updateTab: vi.fn(),
      activateTab: vi.fn(),
    }

    applyBrowserCommand(service as never, {
      id: 2,
      sessionId: 'session-a',
      url: 'https://example.com/same',
      title: 'same',
    })

    expect(service.updateTab).toHaveBeenCalledWith('browser:1', {
      path: 'https://example.com/same',
      title: 'same',
      meta: { browserNavigationId: 2, retained: true },
    })
  })
})
