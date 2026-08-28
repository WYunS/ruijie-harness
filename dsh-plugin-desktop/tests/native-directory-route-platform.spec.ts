import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it, vi } from 'vitest'
import { apply, type Config } from '../src/index.ts'
import {
  DESKTOP_DIRECTORY_PICKER_PATH,
  DESKTOP_DIRECTORY_VALIDATOR_PATH,
} from '../src/directory-picker-contract.ts'
import type { DesktopPlatform, DesktopRuntime } from '../src/runtime.ts'

const config: Config = {
  mode: 'compatibility',
  port: 0,
  width: 1280,
  height: 840,
  minWidth: 900,
  minHeight: 640,
}

function registeredRoutes(platform: DesktopPlatform): Map<string, WebRoute> {
  const routes = new Map<string, WebRoute>()
  const runtime = {
    platform,
    locale: 'en',
    schedule: vi.fn(() => async () => {}),
    pickDirectory: vi.fn(async () => null),
    validateDirectory: vi.fn(async () => true),
    reportRendererBoot: vi.fn(),
    setLocalePreference: vi.fn(),
    setThemeSource: vi.fn(),
    requestRestart: vi.fn(async () => {}),
  } as unknown as DesktopRuntime
  const ctx = {
    webServer: {
      host: '127.0.0.1',
      port: 43120,
      register: vi.fn((route: WebRoute) => {
        routes.set(route.path, route)
        return () => { routes.delete(route.path) }
      }),
    },
    settings: {
      get: vi.fn(() => undefined),
      register: vi.fn(() => ({
        get: () => ({ mode: config.mode }),
        watch: () => () => {},
        update: vi.fn(async () => {}),
        replace: vi.fn(async () => {}),
      })),
    },
    logger: { warn: vi.fn(), error: vi.fn() },
    get: vi.fn((key: unknown) => {
      if (String(key) === 'desktopRuntime') return runtime
      if (String(key) === 'appExit') return vi.fn()
      if (String(key) === 'ruijieAccount') {
        return { account: vi.fn(async () => ({})), logout: vi.fn(async () => {}) }
      }
      return undefined
    }),
    effect: vi.fn((register: () => unknown) => register()),
    on: vi.fn(() => () => {}),
  } as unknown as Context

  apply(ctx, config)
  return routes
}

describe('native directory-picker platform contract', () => {
  it.each(['win32', 'darwin'] as const)(
    'registers the app-owned picker route on %s',
    (platform) => {
      expect(registeredRoutes(platform).has(DESKTOP_DIRECTORY_PICKER_PATH)).toBe(true)
      expect(registeredRoutes(platform).has(DESKTOP_DIRECTORY_VALIDATOR_PATH)).toBe(true)
    },
  )

  it('does not expose the desktop picker route on unsupported Linux hosts', () => {
    expect(registeredRoutes('linux').has(DESKTOP_DIRECTORY_PICKER_PATH)).toBe(false)
    expect(registeredRoutes('linux').has(DESKTOP_DIRECTORY_VALIDATOR_PATH)).toBe(false)
  })
})
