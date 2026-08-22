/** Main-world key for sidebar popup navigation intercepted by Electron. */
export const DESKTOP_SIDEBAR_POPUP_BRIDGE = '__DSH_DESKTOP_SIDEBAR_POPUP__'

/** Private main-to-preload IPC channel for one intercepted sidebar popup. */
export const DESKTOP_SIDEBAR_POPUP_CHANNEL = 'dsh-desktop:sidebar-popup'

/** Narrow bridge exposed to the renderer for routing a popup into its owning tab. */
export interface DesktopSidebarPopupBridge {
  onNavigate(listener: (guestId: number, url: string) => void): () => void
}

