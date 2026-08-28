import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  authorizationWindowSize,
  authorizationRecoveryForNavigation,
  RuijieAuthorizationRecovery,
  isRuijieEnterpriseSsoNavigation,
} from '../src/ruijie-login-window.ts'

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
const loginWindow = readFileSync(new URL('../src/ruijie-login-window.ts', import.meta.url), 'utf8')

describe('Ruijie SSO startup presentation', () => {
  it('fits a focused login window to Windows and macOS work areas without becoming full screen', () => {
    expect(authorizationWindowSize({ width: 1920, height: 1040 })).toEqual({ width: 920, height: 720 })
    expect(authorizationWindowSize({ width: 1440, height: 875 })).toEqual({ width: 920, height: 720 })
    expect(authorizationWindowSize({ width: 800, height: 600 })).toEqual({ width: 752, height: 552 })
  })

  it('automatically restores a dropped OAuth transaction exactly once after SSO lands on the user home page', () => {
    const authorizeUrl = 'https://gptauth.ruijie.com.cn/oauth/authorize?client_id=desktop&state=original'
    expect(isRuijieEnterpriseSsoNavigation('https://sid.ruijie.com.cn/login?service=callback')).toBe(true)

    expect(authorizationRecoveryForNavigation(
      authorizeUrl,
      false,
      'https://sid.ruijie.com.cn/login?service=callback',
      false,
    )).toBeUndefined()
    expect(authorizationRecoveryForNavigation(
      authorizeUrl,
      true,
      'https://w10.flweba03.cc/user',
      false,
    )).toBe(authorizeUrl)
    expect(authorizationRecoveryForNavigation(
      authorizeUrl,
      true,
      'https://w10.flweba03.cc/user',
      true,
    )).toBeUndefined()
    expect(authorizationRecoveryForNavigation(
      authorizeUrl,
      false,
      'https://attacker.example/user',
      false,
    )).toBeUndefined()
  })

  it('replays the captured real-world redirect sequence without forming a loop', () => {
    const authorizeUrl = 'https://gptauth.ruijie.com.cn/oauth/authorize?state=original'
    const recovery = new RuijieAuthorizationRecovery(authorizeUrl)

    expect(recovery.observe(authorizeUrl)).toBeUndefined()
    expect(recovery.observe('https://gptauth.ruijie.com.cn/sign-in?redirect=oauth')).toBeUndefined()
    expect(recovery.observe('https://sid.ruijie.com.cn/login?service=callback')).toBeUndefined()
    expect(recovery.observe('https://w10.flweba03.cc/user')).toBe(authorizeUrl)
    expect(recovery.observe('https://w10.flweba03.cc/user')).toBeUndefined()
  })

  it('recovers the GPTAuth dashboard landing captured from the live Electron login', () => {
    const authorizeUrl = 'https://gptauth.ruijie.com.cn/oauth/authorize?state=original'
    const recovery = new RuijieAuthorizationRecovery(authorizeUrl)

    expect(recovery.observe('https://gptauth.ruijie.com.cn/sign-in?redirect=oauth')).toBeUndefined()
    expect(recovery.observe('https://sid.ruijie.com.cn/login?service=callback')).toBeUndefined()
    expect(recovery.observe('https://gptauth.ruijie.com.cn/oauth/ruijie')).toBeUndefined()
    expect(recovery.observe('https://gptauth.ruijie.com.cn/dashboard')).toBe(authorizeUrl)
    expect(recovery.observe('https://gptauth.ruijie.com.cn/dashboard/overview')).toBeUndefined()
  })

  it('never amplifies repeated sign-in and dashboard navigation into a redirect loop', () => {
    const authorizeUrl = 'https://gptauth.ruijie.com.cn/oauth/authorize?state=original'
    const recovery = new RuijieAuthorizationRecovery(authorizeUrl)
    const noisySequence = [
      ...Array.from({ length: 20 }, () => 'https://gptauth.ruijie.com.cn/sign-in?redirect=oauth'),
      'https://sid.ruijie.com.cn/login?service=callback',
      'https://gptauth.ruijie.com.cn/oauth/ruijie',
      ...Array.from({ length: 50 }, (_, index) => index % 2 === 0
        ? 'https://gptauth.ruijie.com.cn/dashboard'
        : 'https://gptauth.ruijie.com.cn/dashboard/overview'),
    ]

    expect(noisySequence.map(url => recovery.observe(url)).filter(Boolean)).toEqual([authorizeUrl])
  })

  it('recovers an already-signed-in same-origin landing but ignores callbacks and unrelated homes', () => {
    const authorizeUrl = 'https://gptauth.ruijie.com.cn/oauth/authorize?state=original'
    const cachedSession = new RuijieAuthorizationRecovery(authorizeUrl)
    expect(cachedSession.observe('https://gptauth.ruijie.com.cn/dashboard')).toBe(authorizeUrl)
    expect(cachedSession.observe('https://gptauth.ruijie.com.cn/dashboard')).toBeUndefined()

    const normalCallback = new RuijieAuthorizationRecovery(authorizeUrl)
    expect(normalCallback.observe('http://localhost:1455/auth/callback?code=ok&state=original')).toBeUndefined()
    expect(normalCallback.observe('https://attacker.example/dashboard')).toBeUndefined()
    expect(normalCallback.observe('not a URL')).toBeUndefined()
  })

  it('opens the login window only when interactive OAuth is actually required', () => {
    const authenticate = main.indexOf('await ensureRuijieAuthEnvironment')
    const open = main.indexOf('await ruijieLoginWindow?.open(url)', authenticate)
    expect(authenticate).toBeGreaterThan(0)
    expect(open).toBeGreaterThan(authenticate)
  })

  it('loads OAuth in one controlled window and resumes a dropped transaction without another click', () => {
    expect(loginWindow).toContain('await window.loadURL(authorizeUrl)')
    expect(loginWindow).toContain("window.webContents.on('did-navigate'")
    expect(loginWindow).toContain("window.webContents.on('did-navigate-in-page'")
    expect(loginWindow).toContain('authorizationRecovery.observe(url)')
    expect(loginWindow).toContain('this.options.onRecovery?.()')
    expect(main).toContain('await ruijieLoginWindow?.open(url)')
    expect(loginWindow).not.toContain('已登录，继续授权')
    expect(loginWindow).not.toContain('CONTINUE_AUTHORIZATION_URL')
    expect(loginWindow).not.toContain('setInterval')
  })

  it('keeps the login window alive until the Harness window has mounted', () => {
    const authenticated = main.indexOf('ruijieAuth = authenticatedAccount')
    const mounted = main.indexOf('await runtime.mountScheduled()')
    const closed = main.indexOf('ruijieLoginWindow.close()')
    expect(authenticated).toBeGreaterThan(0)
    expect(mounted).toBeGreaterThan(authenticated)
    expect(closed).toBeGreaterThan(mounted)
  })

  it('shows the Harness window after closing the SSO status window', () => {
    const closed = main.indexOf('ruijieLoginWindow.close()')
    const shown = main.indexOf('runtime.show()', closed)
    expect(closed).toBeGreaterThan(0)
    expect(shown).toBeGreaterThan(closed)
  })

  it('presents concise Harness-branded progress after callback without exposing credentials', () => {
    expect(loginWindow).toContain('锐捷Harness')
    expect(loginWindow).toContain('正在打开工作台')
    expect(loginWindow).not.toMatch(/accessToken|refreshToken|codex-token|apiKey/u)
    expect(loginWindow).toContain('text-align:center')
    expect(loginWindow).toContain('width:72px;height:72px')
    expect(loginWindow).toContain('font-size:34px;font-weight:500')
    expect(loginWindow).toContain('color:var(--ink);background:var(--paper)')
    expect(loginWindow).not.toContain('#6682ff')
    expect(loginWindow).not.toContain('#3d57da')
    expect(loginWindow).not.toContain('#d71920')
  })

  it('uses Windows protection so ordinary application exits retain authorization', () => {
    expect(main).toContain('safeStorage')
    expect(main).toContain('credentialStore: new RuijieAuthStore')
    expect(main).toContain("if (status === 'authorization-complete') ruijieLoginWindow?.showStarting()")
  })

  it('keeps visible progress between the browser callback and the mounted Harness window', () => {
    const completed = main.indexOf("status === 'authorization-complete'")
    const starting = main.indexOf('ruijieLoginWindow?.showStarting()', completed)
    const mounted = main.indexOf('await runtime.mountScheduled()', starting)
    const closed = main.indexOf('ruijieLoginWindow.close()', mounted)
    expect(starting).toBeGreaterThan(completed)
    expect(mounted).toBeGreaterThan(starting)
    expect(closed).toBeGreaterThan(mounted)
    expect(loginWindow).toContain('showStarting(): void')
    expect(loginWindow).toContain('认证已完成')
    expect(loginWindow).toContain('正在打开工作台')
    expect(loginWindow).toContain('首次启动或组件初始化可能需要更久。')
    expect(loginWindow).toContain('SLOW_START_NOTICE_MS = 8_000')
    expect(loginWindow).not.toContain('hide(): void')
  })

  it('lets the user cancel an abandoned browser authorization with the native frame', () => {
    expect(loginWindow).toContain('closable: true')
    expect(loginWindow).toContain('frame: true')
    expect(loginWindow).toContain("process.platform === 'darwin'")
    expect(loginWindow).toContain('if (!this.completed) this.options.onCancel()')
  })

  it('preserves the centered monochrome status composition with native macOS chrome', () => {
    expect(loginWindow).toContain('-apple-system,BlinkMacSystemFont')
    expect(loginWindow).toContain('-webkit-font-smoothing:antialiased')
    expect(loginWindow).toContain('.shell.macos{transform:translateY(-2vh)}')
    expect(loginWindow).toContain('frame: true')
    expect(loginWindow).toContain("titleBarStyle: 'hiddenInset'")
    expect(loginWindow).toContain('trafficLightPosition')
    expect(loginWindow).toContain('fullscreenable: false')
  })

  it('isolates every login attempt from stale web state and keeps Electron capabilities disabled', () => {
    expect(loginWindow).toContain('partition: `ruijie-sso-${randomUUID()}`')
    expect(loginWindow).toContain('contextIsolation: true')
    expect(loginWindow).toContain('nodeIntegration: false')
    expect(loginWindow).toContain('sandbox: true')
    expect(loginWindow).toContain('webSecurity: true')
  })

  it('separates slow account verification from slow workspace startup', () => {
    expect(loginWindow).toContain('showVerifying(): void')
    expect(loginWindow).toContain('正在验证账号')
    expect(loginWindow).toContain('账号服务响应较慢')
    expect(loginWindow).toContain('组件初始化可能需要更久')
    expect(main).toContain("status === 'authorization-processing'")
  })
})
