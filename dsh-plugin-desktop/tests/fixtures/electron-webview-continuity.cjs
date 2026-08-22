const http = require('node:http')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const timeoutMs = 10_000

function waitForNavigation(guest, expectedPath) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`timed out waiting for ${expectedPath}; current=${guest.getURL()}`))
    }, timeoutMs)
    const check = () => {
      const url = guest.getURL()
      if (url === '' || new URL(url).pathname !== expectedPath || guest.isLoading()) return
      cleanup()
      resolve(url)
    }
    const cleanup = () => {
      clearTimeout(timer)
      guest.off('did-finish-load', check)
      guest.off('did-stop-loading', check)
    }
    // did-navigate fires as soon as the main-frame URL commits. Starting the
    // next load at that point can legitimately abort the previous loadURL()
    // promise with ERR_ABORTED. Wait for the target page to finish instead so
    // this continuity gate measures popup routing, not navigation timing.
    guest.on('did-finish-load', check)
    guest.on('did-stop-loading', check)
    check()
  })
}

function page(label) {
  return `<!doctype html><meta charset="utf-8"><title>${label}</title><a id="result" target="_blank" href="/result/${label}">result ${label}</a>`
}

async function main() {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8')
    if (request.url === '/search/first') return response.end(page('first'))
    if (request.url === '/search/second') return response.end(page('second'))
    response.end(`<!doctype html><meta charset="utf-8"><title>${request.url}</title>${request.url}`)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fixture server has no TCP address')
  const origin = `http://127.0.0.1:${address.port}`

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'electron-webview-continuity-preload.cjs'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const attached = new Promise((resolve) => {
    window.webContents.once('did-attach-webview', (_event, guest) => {
      guest.setWindowOpenHandler(({ url }) => {
        try {
          const target = new URL(url)
          if (target.protocol === 'https:' || target.protocol === 'http:') {
            window.webContents.send('test:sidebar-popup', guest.id, target.href)
          }
        } catch {}
        return { action: 'deny' }
      })
      resolve(guest)
    })
  })
  const parent = `<!doctype html><webview id="browser" src="${origin}/search/first" webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes" allowpopups="true"></webview><script>const browser=document.getElementById('browser');window.__TEST_SIDEBAR_POPUP__.onNavigate((guestId,url)=>{if(browser.getWebContentsId()===guestId)browser.loadURL(url)})</script>`
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(parent)}`)
  const guest = await attached

  await waitForNavigation(guest, '/search/first')
  await guest.executeJavaScript("document.getElementById('result').click()")
  await waitForNavigation(guest, '/result/first')

  await guest.loadURL(`${origin}/search/second`)
  await waitForNavigation(guest, '/search/second')
  await guest.executeJavaScript("document.getElementById('result').click()")
  await waitForNavigation(guest, '/result/second')

  process.stdout.write('PASS second search result navigated inside the same webview\n')
  window.destroy()
  await new Promise(resolve => server.close(resolve))
}

app.whenReady().then(main).then(
  () => app.quit(),
  (cause) => {
    process.stderr.write(`FAIL ${cause instanceof Error ? cause.stack : String(cause)}\n`)
    app.exit(1)
  },
)
