/** Minimal context-isolated bridge for resolving operating-system drag payloads. */

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { DESKTOP_FILE_PATH_BRIDGE } from './file-path-bridge-contract.ts'
import {
  DESKTOP_SIDEBAR_POPUP_BRIDGE,
  DESKTOP_SIDEBAR_POPUP_CHANNEL,
} from './sidebar-popup-bridge-contract.ts'

contextBridge.exposeInMainWorld(DESKTOP_FILE_PATH_BRIDGE, {
  /** Resolve only genuine disk-backed Web File objects selected by the operator. */
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },
})

contextBridge.exposeInMainWorld(DESKTOP_SIDEBAR_POPUP_BRIDGE, {
  onNavigate(listener: (guestId: number, url: string) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, guestId: unknown, url: unknown): void => {
      if (typeof guestId === 'number' && Number.isInteger(guestId) && typeof url === 'string') {
        listener(guestId, url)
      }
    }
    ipcRenderer.on(DESKTOP_SIDEBAR_POPUP_CHANNEL, handler)
    return () => { ipcRenderer.off(DESKTOP_SIDEBAR_POPUP_CHANNEL, handler) }
  },
})
