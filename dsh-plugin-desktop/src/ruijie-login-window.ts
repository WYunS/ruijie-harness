/** Small native-owned status window shown while the system browser completes SSO. */

import { app, BrowserWindow } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOGIN_ICON_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'app-icon.png')
const SLOW_START_NOTICE_MS = 8_000

type LoginPhase = 'authorize' | 'starting' | 'slow-start'

function loginCopy(phase: LoginPhase): { readonly title: string; readonly detail: string } {
  if (phase === 'authorize') {
    return { title: '请在浏览器确认授权', detail: '确认后会直接返回 Harness。' }
  }
  if (phase === 'starting') {
    return { title: '认证已完成', detail: '正在打开工作台，通常只需几秒。' }
  }
  return { title: '正在准备工作台', detail: '首次启动需要加载组件，请再稍候。' }
}

function loginHtml(phase: LoginPhase): string {
  const copy = loginCopy(phase)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>锐捷 Harness</title>
  <style>
    :root{color-scheme:light;font:14px/1.5 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#17191d;background:transparent}*{box-sizing:border-box}body{margin:0;height:100vh;overflow:hidden;padding:14px}.shell{position:relative;width:100%;height:100%;padding:24px 26px;border:1px solid #e5e7eb;border-radius:22px;background:#fff;box-shadow:0 20px 55px #20242d24;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:10px;-webkit-app-region:drag;user-select:none}.mark{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:#fff;background:#d71920;font-size:12px;font-style:italic;font-weight:800;letter-spacing:-.06em}.brand strong{font-size:15px;letter-spacing:.01em}.copy{margin:auto 0}h1{margin:0 0 7px;font-size:22px;line-height:1.25;letter-spacing:-.025em;font-weight:650}p{margin:0;color:#737981}.progress{height:2px;margin-top:auto;background:#eef0f3;overflow:hidden}.progress::after{content:"";display:block;width:34%;height:100%;background:#d71920;animation:signal 1.25s cubic-bezier(.4,0,.2,1) infinite alternate}@keyframes signal{to{transform:translateX(194%)}}@media(prefers-reduced-motion:reduce){.progress::after{animation:none;transform:translateX(96%)}}
  </style>
</head>
<body><main class="shell"><header class="brand"><span class="mark">RJ</span><strong>锐捷 Harness</strong></header><div class="copy"><h1>${copy.title}</h1><p>${copy.detail}</p></div><div class="progress" aria-hidden="true"></div></main></body>
</html>`
}

export interface RuijieLoginWindowOptions {
  readonly onCancel: () => void
}

/** Own the visible pre-auth state without exposing OAuth material to a renderer. */
export class RuijieLoginWindow {
  private window: BrowserWindow | undefined
  private slowStartNotice: ReturnType<typeof setTimeout> | undefined
  private completed = false
  constructor(private readonly options: RuijieLoginWindowOptions) {}

  async open(): Promise<void> {
    const window = new BrowserWindow({
      title: '锐捷 Harness',
      width: 440,
      height: 260,
      show: false,
      closable: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      frame: false,
      transparent: true,
      hasShadow: true,
      roundedCorners: true,
      icon: LOGIN_ICON_PATH,
      autoHideMenuBar: true,
      backgroundColor: '#00000000',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        spellcheck: false,
        partition: 'ruijie-sso-status',
      },
    })
    this.window = window
    window.center()
    window.removeMenu()
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => { event.preventDefault() })
    const show = (): void => {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
    app.on('activate', show)
    window.once('ready-to-show', show)
    window.on('closed', () => {
      app.off('activate', show)
      this.window = undefined
      if (!this.completed) this.options.onCancel()
    })
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loginHtml('authorize'))}`)
  }

  /** Replace the authorization prompt with honest progress until the main window is mounted. */
  showStarting(): void {
    const window = this.window
    if (window === undefined || window.isDestroyed()) return
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loginHtml('starting'))}`).catch(() => {})
    this.slowStartNotice = setTimeout(() => {
      const current = this.window
      if (current === undefined || current.isDestroyed()) return
      void current.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loginHtml('slow-start'))}`).catch(() => {})
    }, SLOW_START_NOTICE_MS)
  }

  show(): void {
    const window = this.window
    if (window === undefined || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  close(): void {
    this.completed = true
    if (this.slowStartNotice !== undefined) clearTimeout(this.slowStartNotice)
    this.slowStartNotice = undefined
    const window = this.window
    this.window = undefined
    if (window !== undefined && !window.isDestroyed()) window.destroy()
  }
}
