import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
const loginWindow = readFileSync(new URL('../src/ruijie-login-window.ts', import.meta.url), 'utf8')

describe('Ruijie SSO startup presentation', () => {
  it('opens the login window only when interactive OAuth is actually required', () => {
    const authenticate = main.indexOf('await ensureRuijieAuthEnvironment')
    const open = main.indexOf('await ruijieLoginWindow?.open()', authenticate)
    expect(authenticate).toBeGreaterThan(0)
    expect(open).toBeGreaterThan(authenticate)
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

  it('presents a concise Harness-branded authorization journey without exposing credentials', () => {
    expect(loginWindow).toContain('锐捷 Harness')
    expect(loginWindow).toContain('请在浏览器确认授权')
    expect(loginWindow).toContain('确认后会直接返回 Harness')
    expect(loginWindow).toContain('正在打开工作台')
    expect(loginWindow).not.toMatch(/accessToken|refreshToken|codex-token|apiKey/u)
    expect(loginWindow).toContain('#6682ff')
    expect(loginWindow).toContain('#3d57da')
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

  it('lets the user cancel an abandoned browser authorization on every desktop platform', () => {
    expect(loginWindow).toContain('closable: true')
    expect(loginWindow).toContain('关闭并退出')
    expect(loginWindow).toContain("process.platform === 'darwin'")
    expect(loginWindow).toContain("titleBarStyle: 'hiddenInset'")
    expect(loginWindow).toContain('trafficLightPosition')
    expect(loginWindow).toContain('window.close()')
  })

  it('routes the frameless close control through the native BrowserWindow', () => {
    expect(loginWindow).toContain("const CANCEL_NAVIGATION_URL = 'ruijie-harness://cancel-authorization/'")
    expect(loginWindow).toContain("window.location.href='ruijie-harness://cancel-authorization/'")
    expect(loginWindow).toContain('if (url === CANCEL_NAVIGATION_URL) window.close()')
  })

  it('gives the Windows close control a stable 40px hit target without replacing macOS traffic lights', () => {
    expect(loginWindow).toContain('width:40px;height:40px')
    expect(loginWindow).toContain('display:grid;place-items:center')
    expect(loginWindow).toContain("const closeControl = macOS\n    ? ''")
    expect(loginWindow).toContain("frame: macOS")
  })

  it('separates slow account verification from slow workspace startup', () => {
    expect(loginWindow).toContain('showVerifying(): void')
    expect(loginWindow).toContain('正在验证账号')
    expect(loginWindow).toContain('账号服务响应较慢')
    expect(loginWindow).toContain('组件初始化可能需要更久')
    expect(main).toContain("status === 'authorization-processing'")
  })
})
