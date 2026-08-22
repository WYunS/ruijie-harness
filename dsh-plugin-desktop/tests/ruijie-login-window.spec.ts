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
    expect(loginWindow).toContain('首次启动需要加载组件，请再稍候。')
    expect(loginWindow).toContain('SLOW_START_NOTICE_MS = 8_000')
    expect(loginWindow).not.toContain('hide(): void')
  })

  it('cannot be closed by accident while authorization is still pending', () => {
    expect(loginWindow).toContain('closable: false')
  })
})
