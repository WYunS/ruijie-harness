import type { BetterSidebarService } from './service.ts'
import { allLeaves } from './state.ts'

export interface BrowserCommand {
  id: number
  sessionId: string
  url: string
  title: string
}

/** Parse one untrusted Host push frame. */
export function parseBrowserCommand(payload: string): BrowserCommand | null {
  let value: unknown
  try { value = JSON.parse(payload) } catch { return null }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (!Number.isInteger(row.id) || (row.id as number) < 1) return null
  if (typeof row.sessionId !== 'string' || row.sessionId === '') return null
  if (typeof row.url !== 'string' || !/^https?:\/\//iu.test(row.url)) return null
  if (typeof row.title !== 'string' || row.title === '') return null
  return { id: row.id as number, sessionId: row.sessionId, url: row.url, title: row.title }
}

/** Land a valid command in the command's own conversation-scoped sidebar. */
export function applyBrowserCommand(service: BetterSidebarService, command: BrowserCommand): void {
  const snapshot = service.getSnapshot()
  if (snapshot.sessionId === command.sessionId && snapshot.state !== undefined) {
    const activePane = allLeaves(snapshot.state.splits)
      .concat(allLeaves(snapshot.state.bottomSplits))
      .find(pane => pane.id === snapshot.state?.activePane)
    const activeTab = activePane?.tabs.find(tab => tab.id === activePane.active)
    if (activeTab?.type === 'browser') {
      const previousMeta = activeTab.meta !== null
        && typeof activeTab.meta === 'object'
        && !Array.isArray(activeTab.meta)
        ? activeTab.meta as Record<string, unknown>
        : {}
      // The id is a navigation nonce as well as a transport sequence. Without
      // it, asking the browser to open the same URL twice is swallowed because
      // the persisted path did not change and React has nothing to observe.
      service.updateTab(activeTab.id, {
        path: command.url,
        title: command.title,
        meta: { ...previousMeta, browserNavigationId: command.id },
      })
      service.activateTab(activeTab.id, { sessionId: command.sessionId })
      return
    }
  }
  service.openTab(
    { type: 'browser', url: command.url, title: command.title },
    { sessionId: command.sessionId },
  )
}
