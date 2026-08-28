/** Sidebar geometry passed by the desktop root slot. */
export interface DesktopSidebarOwnerProps {
  /** Whether the sidebar is showing its compact rail. */
  collapsed: boolean
  /** Current rendered sidebar width. */
  width: number
}

/** Owner conversation for the desktop's macOS directory chooser. */
export interface DesktopDirectoryFlowOwnerProps {
  open: boolean
  busy: boolean
  onPicked(path: string): void
  onCancel(): void
  onError(message: string): void
}

/** Public panel transitions consumed by conversation and sidebar plugins. */
export interface DesktopLayoutService {
  /** Toggle the sidebar between wide and compact presentation. */
  toggleSidebar(): void
  /** Open the current session's details panel. */
  openDetails(): void
  /** Close the details panel. */
  closeDetails(): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Desktop-owned layout service in advanced mode. */
    layout: DesktopLayoutService
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Upstream sidebar hosted by the desktop advanced frame. */
    'sidebar': { kind: 'single'; scope: 'root'; owner: DesktopSidebarOwnerProps }
    /** Unchanged upstream conversation surface. */
    'conversation': { kind: 'single'; scope: 'session-maybe'; owner: Record<never, never> }
    /** Unchanged upstream details surface. */
    'details': { kind: 'single'; scope: 'session'; owner: Record<never, never> }
    /** Frame-wide additive overlays. */
    'shell.overlay': { kind: 'list'; scope: 'root' }
    /** App-owned macOS folder chooser on the empty-workspace surface. */
    'conversation.hero.workspace.directoryFlow': {
      kind: 'single'; scope: 'root'; owner: DesktopDirectoryFlowOwnerProps
    }
    /** App-owned macOS folder chooser in the workspace sidebar. */
    'sidebar.workspaces.directoryFlow': {
      kind: 'single'; scope: 'root'; owner: DesktopDirectoryFlowOwnerProps
    }
  }
}
