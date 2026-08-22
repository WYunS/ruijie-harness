import { readFileSync } from 'node:fs'
import type { NativeImage } from 'electron'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopShellSpec } from '../src/runtime.ts'
import { desktopRendererUrl } from '../src/index.ts'
import { advancedWindowOptions, compatibilityWindowOptions } from '../src/window-options.ts'

async function loadBrowserPolicy() {
  const source = readFileSync(
    new URL('../../vendor/dsh-better-sidebar/src/client/browser.ts', import.meta.url),
    'utf8',
  )
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2023,
    },
  }).outputText
  const encoded = Buffer.from(javascript, 'utf8').toString('base64')
  return await import(`data:text/javascript;base64,${encoded}`) as {
    normalizeBrowserUrl(input: string, selfOrigin: string): { kind: string; url?: string }
    fallbackSearchUrlForBlockedSite(input: string): string | undefined
  }
}

async function loadSidebarDesktopEnvironment() {
  const source = readFileSync(
    new URL('../../vendor/dsh-better-sidebar/src/client/desktop-env.ts', import.meta.url),
    'utf8',
  )
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2023,
    },
  }).outputText
  const encoded = Buffer.from(javascript, 'utf8').toString('base64')
  return await import(`data:text/javascript;base64,${encoded}`) as {
    parseDesktopEnv(): { win32OverlayTop: number }
    resetDesktopEnvForTests(): void
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const spec: DesktopShellSpec = {
  mode: 'compatibility',
  width: 1280,
  height: 840,
  minWidth: 900,
  minHeight: 640,
  url: 'http://127.0.0.1:43120/',
  productName: '锐捷 Harness',
  windowTitle: '锐捷 Harness',
  iconPath: 'D:/tmp/app-icon.png',
  trayIcons: { templatePath: 'D:/tmp/tray.png', bluePath: 'D:/tmp/tray-blue.png' },
  readLocalePreference: () => 'zh',
  readThemeSource: () => 'system',
  requestQuit: () => {},
  requestModeChange: async () => {},
}

describe('native sidebar browser', () => {
  it('carries a navigation nonce so repeated browser commands are observable', () => {
    const source = readFileSync(
      new URL('../../vendor/dsh-better-sidebar/src/client/browser-command.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain('browserNavigationId: command.id')
    expect(source).toContain('meta: { ...previousMeta, browserNavigationId: command.id }')
  })

  it('enables isolated Electron webviews in both desktop shell modes', () => {
    const icon = {} as NativeImage
    expect(compatibilityWindowOptions(spec, icon, 'win32', 'D:/tmp/preload.cjs').webPreferences)
      .toMatchObject({ webviewTag: true })
    expect(advancedWindowOptions(
      { ...spec, mode: 'advanced' }, icon, 'win32', 'D:/tmp/preload.cjs',
    ).webPreferences).toMatchObject({ webviewTag: true })
  })

  it('uses the native webview on Electron and does not pre-probe the target', () => {
    const source = readFileSync(
      new URL('../../vendor/dsh-better-sidebar/src/client/BrowserView.tsx', import.meta.url),
      'utf8',
    )
    expect(source).toContain("const nativeWebview = navigator.userAgent.includes('Electron')")
    expect(source).toMatch(/nativeWebview[\s\S]*?<webview/u)
    expect(source).toMatch(/<webview[\s\S]*?allowpopups="true"/u)
    expect(source).toMatch(/if \(nativeWebview\) return/u)
  })

  it('treats ordinary text as a search query instead of a fake HTTPS host', async () => {
    const { normalizeBrowserUrl } = await loadBrowserPolicy()
    expect(normalizeBrowserUrl('益生菌 最新研究', 'http://127.0.0.1:43120')).toEqual({
      kind: 'ok',
      url: 'https://cn.bing.com/search?q=%E7%9B%8A%E7%94%9F%E8%8F%8C%20%E6%9C%80%E6%96%B0%E7%A0%94%E7%A9%B6',
    })
  })

  it('contains an automatic Bing fallback for unreachable Baidu pages', () => {
    const source = readFileSync(
      new URL('../../vendor/dsh-better-sidebar/src/client/BrowserView.tsx', import.meta.url),
      'utf8',
    )
    expect(source).toContain('fallbackSearchUrlForBlockedSite')
    expect(source).toContain('did-fail-load')
    expect(source).toContain('browserNavigationId')
    expect(source).toContain('webviewRef.current.reload()')
    expect(source).toContain('if (next === url)')
  })

  it('shares the application network session for system proxy and certificate behavior', () => {
    const source = readFileSync(
      new URL('../../vendor/dsh-better-sidebar/src/client/BrowserView.tsx', import.meta.url),
      'utf8',
    )
    expect(source).not.toContain('partition="persist:ruijie-harness-browser"')
  })

  it('routes popup navigation through the owning renderer tab', () => {
    const source = readFileSync(
      new URL('../../vendor/dsh-better-sidebar/src/client/BrowserView.tsx', import.meta.url),
      'utf8',
    )
    expect(source).toContain('__DSH_DESKTOP_SIDEBAR_POPUP__')
    expect(source).toContain('view.getWebContentsId() === guestId')
    expect(source).not.toContain("addEventListener('new-window'")
  })

  it('keeps embedded spreadsheet renderers below the sidebar tab chrome', () => {
    const styles = readFileSync(
      new URL('../../vendor/dsh-better-sidebar/src/client/sidebar.module.css', import.meta.url),
      'utf8',
    )
    const clientBundle = readFileSync(
      new URL('../../vendor/dsh-better-sidebar/lib/client.js', import.meta.url),
      'utf8',
    )
    expect(styles).toMatch(
      /\.paneTab:has\(\[aria-label\$=["']\.xlsx["'] i\]\)[\s\S]*?contain:\s*paint/u,
    )
    const compiledSelector = 'aria-label$=\\\\.xlsx i'
    const selectorIndex = clientBundle.indexOf(compiledSelector)
    expect(selectorIndex).toBeGreaterThan(-1)
    expect(clientBundle.slice(selectorIndex, selectorIndex + 120)).toContain('contain:paint')
  })

  it('keeps file-close and right-panel controls below the controls-only Windows caption', async () => {
    const options = compatibilityWindowOptions(spec, {} as NativeImage, 'win32', 'D:/tmp/preload.cjs')
    const environment = await loadSidebarDesktopEnvironment()
    const url = new URL(desktopRendererUrl(43120, 'compatibility', 'win32'))
    const clientBundle = readFileSync(
      new URL('../../vendor/dsh-better-sidebar/lib/client.js', import.meta.url),
      'utf8',
    )
    vi.stubGlobal('window', {
      location: {
        search: url.search,
      },
    })
    environment.resetDesktopEnvForTests()

    expect(options.titleBarOverlay).toMatchObject({ height: 32 })
    expect(url.searchParams.get('dsh-desktop-titlebar-overlay-height')).toBe('32')
    expect(environment.parseDesktopEnv().win32OverlayTop).toBe(32)
    expect(clientBundle).toContain('dsh-desktop-titlebar-overlay-height')
  })

  it('preserves the Baidu Baike topic when falling back to Bing', async () => {
    const { fallbackSearchUrlForBlockedSite } = await loadBrowserPolicy()
    expect(fallbackSearchUrlForBlockedSite(
      'https://baike.baidu.com/item/%E5%AE%89%E6%89%98%E4%B8%87%C2%B7%E6%A0%BC%E5%88%97%E5%85%B9%E6%9B%BC/1',
    )).toBe('https://cn.bing.com/search?q=%E5%AE%89%E6%89%98%E4%B8%87%C2%B7%E6%A0%BC%E5%88%97%E5%85%B9%E6%9B%BC')
    expect(fallbackSearchUrlForBlockedSite('https://en.wikipedia.org/wiki/Antoine_Griezmann')).toBeUndefined()
  })
})
