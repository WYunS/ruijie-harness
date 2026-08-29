/** Isolated interactive SSO window that becomes a native-owned startup status window after callback. */

import { app, BrowserWindow, screen } from 'electron'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOGIN_ICON_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'app-icon.png')
const SLOW_START_NOTICE_MS = 8_000

type LoginPhase = 'verifying' | 'slow-verifying' | 'starting' | 'slow-start'

export interface RuijieAuthorizationLoader {
  readonly loadURL: (url: string) => Promise<void>
  readonly useDirectProxy: () => Promise<void>
}

const DIRECT_RETRY_NETWORK_ERRORS = /\b(?:ERR_TIMED_OUT|ERR_CONNECTION_CLOSED|ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_PROXY_CONNECTION_FAILED|ERR_CONNECTION_TIMED_OUT|ERR_ADDRESS_UNREACHABLE)\b/u

/** Preserve the normal system route and retry once without it only after a transport failure. */
export async function loadAuthorizationWithDirectFallback(
  loader: RuijieAuthorizationLoader,
  authorizeUrl: string,
): Promise<'system' | 'direct'> {
  try {
    await loader.loadURL(authorizeUrl)
    return 'system'
  } catch (cause) {
    const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)
    if (!DIRECT_RETRY_NETWORK_ERRORS.test(detail)) throw cause
    await loader.useDirectProxy()
    await loader.loadURL(authorizeUrl)
    return 'direct'
  }
}

/** Keep authentication focused while fitting smaller Windows and macOS work areas. */
export function authorizationWindowSize(
  workArea: { readonly width: number; readonly height: number },
): { readonly width: number; readonly height: number } {
  const fit = (available: number, preferred: number, minimum: number): number => Math.min(
    preferred,
    Math.max(Math.min(minimum, available), available - 48),
  )
  return {
    width: fit(workArea.width, 920, 480),
    height: fit(workArea.height, 720, 420),
  }
}

/** Recognize the enterprise identity provider that can drop GPTAuth's return target. */
export function isRuijieEnterpriseSsoNavigation(navigationUrl: string): boolean {
  try {
    const navigation = new URL(navigationUrl)
    return navigation.protocol === 'https:' && navigation.hostname === 'sid.ruijie.com.cn'
  } catch {
    return false
  }
}

/** Recover the one known GPTAuth failure without permitting a redirect loop. */
export function authorizationRecoveryForNavigation(
  authorizeUrl: string,
  enterpriseSsoVisited: boolean,
  navigationUrl: string,
  alreadyRecovered: boolean,
): string | undefined {
  if (alreadyRecovered) return undefined
  try {
    const authorize = new URL(authorizeUrl)
    const navigation = new URL(navigationUrl)
    const trustedLanding = navigation.origin === authorize.origin
      || (enterpriseSsoVisited && navigation.protocol === 'https:')
    if (!trustedLanding) return undefined
    const isUserHome = navigation.pathname === '/user' || navigation.pathname === '/user/'
    const isDashboard = navigation.pathname === '/dashboard' || navigation.pathname.startsWith('/dashboard/')
    if (!isUserHome && !isDashboard) return undefined
    return authorizeUrl
  } catch {
    return undefined
  }
}

/** Stateful, one-shot recovery guard shared by both Electron navigation event types. */
export class RuijieAuthorizationRecovery {
  private enterpriseSsoVisited = false
  private recovered = false

  constructor(private readonly authorizeUrl: string) {}

  observe(navigationUrl: string): string | undefined {
    this.enterpriseSsoVisited = this.enterpriseSsoVisited
      || isRuijieEnterpriseSsoNavigation(navigationUrl)
    const recoveryUrl = authorizationRecoveryForNavigation(
      this.authorizeUrl,
      this.enterpriseSsoVisited,
      navigationUrl,
      this.recovered,
    )
    if (recoveryUrl !== undefined) this.recovered = true
    return recoveryUrl
  }
}

function loginCopy(phase: LoginPhase): { readonly title: string; readonly detail: string } {
  if (phase === 'verifying') {
    return { title: '正在验证账号', detail: '正在连接账号服务，通常只需几秒。' }
  }
  if (phase === 'slow-verifying') {
    return { title: '账号服务响应较慢', detail: '请检查网络或代理，或稍后重试。' }
  }
  if (phase === 'starting') {
    return { title: '认证已完成', detail: '正在打开工作台，通常只需几秒。' }
  }
  return { title: '正在准备工作台', detail: '首次启动或组件初始化可能需要更久。' }
}

function loginHtml(phase: LoginPhase, macOS: boolean): string {
  const copy = loginCopy(phase)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>锐捷 Harness</title>
  <style>
    :root{color-scheme:light;--ink:#111;--muted:#6f6f73;--line:#e7e7e7;--paper:#fff;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--ink);background:var(--paper);-webkit-font-smoothing:antialiased}*{box-sizing:border-box}body{margin:0;min-height:100vh;overflow:hidden;display:grid;place-items:center;padding:24px;background:var(--paper)}.shell{width:100%;text-align:center;transform:translateY(-3vh);-webkit-app-region:drag;user-select:none}.shell.macos{transform:translateY(-2vh)}.mark{width:72px;height:72px;margin:0 auto 26px;border:1px solid var(--line);border-radius:18px;display:grid;place-items:center;color:var(--ink);background:var(--paper);box-shadow:0 10px 28px #00000014;font-size:25px;font-style:italic;font-weight:850;letter-spacing:-.08em}.brand{margin:0;font-size:34px;font-weight:500;line-height:1.2;letter-spacing:-.04em}.status{margin-top:42px}h2{margin:0;font-size:21px;font-weight:600;line-height:1.35;letter-spacing:-.025em}p{margin:10px 0 0;color:var(--muted);font-size:15px}.progress{width:96px;height:1px;margin:34px auto 0;border-radius:999px;background:var(--line);overflow:hidden}.progress::after{content:"";display:block;width:36px;height:100%;border-radius:999px;background:var(--ink);animation:signal 1.35s cubic-bezier(.4,0,.2,1) infinite alternate}@keyframes signal{to{transform:translateX(60px)}}@media(max-height:540px){.shell{transform:none}.status{margin-top:28px}.mark{width:64px;height:64px;margin-bottom:20px;border-radius:16px}.brand{font-size:30px}.progress{margin-top:24px}}@media(prefers-reduced-motion:reduce){.progress::after{animation:none;transform:translateX(30px)}}
  </style>
</head>
<body><main class="shell${macOS ? ' macos' : ''}"><span class="mark" aria-hidden="true">RJ</span><h1 class="brand">锐捷Harness</h1><section class="status" aria-live="polite"><h2>${copy.title}</h2><p>${copy.detail}</p><div class="progress" aria-hidden="true"></div></section></main></body>
</html>`
}

export interface RuijieLoginWindowOptions {
  readonly onCancel: () => void
  readonly onError?: (cause: unknown) => void
  readonly onRecovery?: () => void
}

/** Own interactive OAuth and visible startup state without exposing credentials to the app renderer. */
export class RuijieLoginWindow {
  private window: BrowserWindow | undefined
  private slowStartNotice: ReturnType<typeof setTimeout> | undefined
  private completed = false
  constructor(private readonly options: RuijieLoginWindowOptions) {}

  async open(authorizeUrl: string): Promise<void> {
    const authorizationRecovery = new RuijieAuthorizationRecovery(authorizeUrl)
    const macOS = process.platform === 'darwin'
    const workArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workAreaSize
    const windowSize = authorizationWindowSize(workArea)
    const window = new BrowserWindow({
      title: '锐捷 Harness 登录',
      ...windowSize,
      minWidth: Math.min(640, windowSize.width),
      minHeight: Math.min(520, windowSize.height),
      show: false,
      closable: true,
      resizable: true,
      maximizable: true,
      minimizable: true,
      fullscreenable: false,
      frame: true,
      ...(macOS ? {
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 24, y: 22 },
      } : {}),
      hasShadow: true,
      roundedCorners: true,
      icon: LOGIN_ICON_PATH,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        spellcheck: false,
        // Fresh in-memory storage excludes stale GPTAuth cookies/localStorage,
        // while the redirects within this one SSO attempt share the same state.
        partition: `ruijie-sso-${randomUUID()}`,
      },
    })
    this.window = window
    window.center()
    window.removeMenu()
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const recoverDroppedAuthorization = (_event: Electron.Event, url: string): void => {
      const recoveryUrl = authorizationRecovery.observe(url)
      if (recoveryUrl === undefined) return
      this.options.onRecovery?.()
      void window.loadURL(recoveryUrl).catch(cause => { this.options.onError?.(cause) })
    }
    // GPTAuth can reach /user by either a document redirect or SPA history
    // navigation; Electron reports those through different events.
    window.webContents.on('did-navigate', recoverDroppedAuthorization)
    window.webContents.on('did-navigate-in-page', recoverDroppedAuthorization)
    const show = (): void => {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
    const showMaximized = (): void => {
      if (!window.isMaximized()) window.maximize()
      show()
    }
    app.on('activate', show)
    // Fill the current work area on first display without entering macOS's
    // separate native full-screen Space. Later restores remain user-controlled.
    window.once('ready-to-show', showMaximized)
    window.on('closed', () => {
      app.off('activate', show)
      this.window = undefined
      if (!this.completed) this.options.onCancel()
    })
    await loadAuthorizationWithDirectFallback({
      loadURL: async url => { await window.loadURL(url) },
      useDirectProxy: async () => {
        await window.webContents.session.setProxy({ mode: 'direct' })
        await window.webContents.session.closeAllConnections()
      },
    }, authorizeUrl)
  }

  private showPhase(phase: LoginPhase, slowPhase: LoginPhase): void {
    const window = this.window
    if (window === undefined || window.isDestroyed()) return
    if (this.slowStartNotice !== undefined) clearTimeout(this.slowStartNotice)
    const macOS = process.platform === 'darwin'
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loginHtml(phase, macOS))}`).catch(() => {})
    this.slowStartNotice = setTimeout(() => {
      const current = this.window
      if (current === undefined || current.isDestroyed()) return
      void current.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loginHtml(slowPhase, macOS))}`).catch(() => {})
    }, SLOW_START_NOTICE_MS)
  }

  /** Distinguish post-callback account-service traffic from application startup. */
  showVerifying(): void {
    this.showPhase('verifying', 'slow-verifying')
  }

  /** Replace account verification with honest progress until the main window is mounted. */
  showStarting(): void {
    this.showPhase('starting', 'slow-start')
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
