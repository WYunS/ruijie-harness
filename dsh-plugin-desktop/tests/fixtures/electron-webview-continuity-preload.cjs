const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('__TEST_SIDEBAR_POPUP__', {
  onNavigate(listener) {
    const handler = (_event, guestId, url) => listener(guestId, url)
    ipcRenderer.on('test:sidebar-popup', handler)
    return () => ipcRenderer.off('test:sidebar-popup', handler)
  },
})

