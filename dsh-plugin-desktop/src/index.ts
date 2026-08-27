/** DSH Desktop Host plugin: owns the selected native shell generation. */

import { readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-cmdline'
import {
  LOCALE_SETTINGS_NAMESPACE,
  type LocaleSettings,
} from '@deepseek-ai/dsh-client-locale'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  THEME_SETTINGS_NAMESPACE,
  type ThemeSettings,
} from '@deepseek-ai/dsh-client-ui-theme'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  handleRendererBootRequest,
  RENDERER_BOOT_REPORT_PATH,
} from './renderer-boot.ts'
import {
  DESKTOP_DIRECTORY_PICKER_PATH,
  DESKTOP_DIRECTORY_VALIDATOR_PATH,
} from './directory-picker-contract.ts'
import {
  handleDesktopDirectoryPickerRequest,
  handleDesktopDirectoryValidationRequest,
} from './directory-picker-route.ts'
import type { DesktopShellMode } from './runtime.ts'
import type {} from './runtime.ts'
import type {} from './ruijie-auth.ts'
import { RUIJIE_ACCOUNT_PATH, RUIJIE_BRAND_WORDMARK_PATH, RUIJIE_LOGOUT_PATH } from './ruijie-account-contract.ts'
import { handleRuijieAccountRequest, handleRuijieLogoutRequest } from './ruijie-account-route.ts'
import { WINDOWS_TITLEBAR_HEIGHT } from './window-chrome.ts'
import { ARCHIVED_SESSION_ACTION_PATH } from './archived-session-contract.ts'
import { handleArchivedSessionActionRequest } from './archived-session-route.ts'
import { isSessionActivelyRunning } from './session-deletion-policy.ts'

/** Stable Cordis plugin name. */
export const name = 'desktop-shell'

/** Services required before the shell can register its renderer generation. */
/** Services required by the desktop shell; `desktopRuntime` is probed, not required. */
export const inject = ['webServer', 'webRuntime', 'appExit', 'settings']

/** Standard settings namespace shared by tray and configuration surfaces. */
export const DESKTOP_SETTINGS_NAMESPACE = settingsNamespace('dsh-desktop')

interface SessionLifecycleRegistry {
  readonly archivedSessionIds: readonly string[]
  unarchiveSession(sessionId: ReturnType<typeof SessionId>): Promise<void>
}

const UI_THEME_SETTINGS_NAMESPACE = settingsNamespace(THEME_SETTINGS_NAMESPACE)
const UI_LOCALE_SETTINGS_NAMESPACE = settingsNamespace(LOCALE_SETTINGS_NAMESPACE)
const RUIJIE_BRAND_WORDMARK = readFileSync(new URL('../build/ruijie-wordmark.png', import.meta.url))

/** Desktop settings presented by the standard settings service. */
export interface DesktopSettings {
  /** Native presentation selected for the next application generation. */
  mode: DesktopShellMode
  /** Loopback Web port selected for the next application generation; zero requests a random port. */
  port: number
  /** Log verbosity threshold applied to the file logger. */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

/** Schema registered with the standard settings service. */
export const DesktopSettingsSchema: z<DesktopSettings> = z.object({
  mode: z.union(['compatibility', 'advanced'] as const).default('compatibility'),
  port: z.number().step(1).min(0).max(65_535).default(0),
  logLevel: z.union(['debug', 'info', 'warn', 'error'] as const).default('info'),
})

/** Native window configuration. */
export interface Config {
  /** Native presentation mode selected before BrowserWindow construction. */
  mode: DesktopShellMode
  /** Configured loopback Web port used to detect restart-applied settings changes. */
  port: number
  /** Initial window width in CSS pixels. */
  width: number
  /** Initial window height in CSS pixels. */
  height: number
  /** Minimum window width in CSS pixels. */
  minWidth: number
  /** Minimum window height in CSS pixels. */
  minHeight: number
}

/** Validated native window configuration. */
export const Config: z<Config> = z.object({
  mode: z.union(['compatibility', 'advanced'] as const).default('compatibility'),
  port: z.number().step(1).min(0).max(65_535).default(0),
  width: z.number().step(1).min(800).default(1280),
  height: z.number().step(1).min(600).default(840),
  minWidth: z.number().step(1).min(640).default(900),
  minHeight: z.number().step(1).min(480).default(640),
})

/**
 * Construct the unmodified upstream Web root URL.
 * @param port - active loopback Web server port.
 * @param mode - active native presentation mode.
 * @param platform - active Electron platform.
 * @returns the URL loaded by the BrowserWindow.
 */
export function desktopRendererUrl(
  port: number,
  mode: DesktopShellMode,
  platform: Context['desktopRuntime']['platform'],
): string {
  const url = new URL(`http://127.0.0.1:${String(port)}/`)
  url.searchParams.set('dsh-desktop-mode', mode)
  url.searchParams.set('dsh-desktop-platform', platform)
  if (platform === 'win32') {
    url.searchParams.set('dsh-desktop-titlebar-overlay-height', String(WINDOWS_TITLEBAR_HEIGHT))
  }
  return url.href
}

/**
 * Register the Electron shell from active Web carrier values.
 * @param ctx - Host context carrying the Electron adapter and Web carrier.
 * @param config - validated native window values.
 */
export function apply(ctx: Context, config: Config): void {
  const runtime = ctx.get('desktopRuntime')
  if (runtime === undefined) {
    process.stderr.write(
      'dsh-plugin-desktop: this profile is composed with the DSH Desktop shell, which requires the desktop launcher (desktopRuntime).\n'
      + 'Start it with `dsh-desktop`, or select this profile inside the packaged DSH Desktop application.\n'
      + 'The desktop terminal, profile, and update rows stay inactive in an ordinary DSH boot.\n',
    )
    return
  }
  const appExit = ctx.get('appExit')
  if (appExit === undefined) {
    throw new Error('dsh-plugin-desktop: the launcher did not provide ctx.appExit')
  }
  if (ctx.webServer.host !== '127.0.0.1') {
    throw new Error('dsh-plugin-desktop: desktop shell requires a loopback Web server')
  }
  const ruijieAccount = ctx.get('ruijieAccount')
  if (ruijieAccount === undefined) {
    throw new Error('dsh-plugin-desktop: the launcher did not provide the Ruijie SSO account service')
  }
  const iconFilename = runtime.platform === 'darwin'
    ? 'app-icon-mac.png'
    : 'app-icon.png'
  const iconPath = fileURLToPath(new URL(`../build/${iconFilename}`, import.meta.url))
  const trayIcons = {
    templatePath: fileURLToPath(new URL('../build/tray-iconTemplate.png', import.meta.url)),
    bluePath: fileURLToPath(new URL('../build/tray-icon-blue.png', import.meta.url)),
  }
  const settings = ctx.settings.register(
    DESKTOP_SETTINGS_NAMESPACE,
    DesktopSettingsSchema,
    {
      applies: 'restart',
      validate: (value) => {
        if (value.mode === 'advanced' && runtime.platform === 'linux') {
          throw new Error('dsh-plugin-desktop: advanced shell mode is supported on macOS and Windows')
        }
      },
    },
  )
  const rendererOrigin = `http://127.0.0.1:${String(ctx.webServer.port)}`
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: RENDERER_BOOT_REPORT_PATH,
      handler: (req, res) => handleRendererBootRequest(
        req,
        res,
        rendererOrigin,
        report => { runtime.reportRendererBoot(report) },
      ),
    }),
    'dsh-plugin-desktop: renderer boot report route',
  )
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: RUIJIE_ACCOUNT_PATH,
      handler: (req, res) => handleRuijieAccountRequest(
        req,
        res,
        () => ruijieAccount.account(),
        cause => {
          ctx.logger.warn(`dsh-plugin-desktop: failed to load Ruijie account summary: ${cause instanceof Error ? cause.message : String(cause)}`)
        },
      ),
    }),
    'dsh-plugin-desktop: Ruijie SSO account route',
  )
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: RUIJIE_LOGOUT_PATH,
      handler: (req, res) => handleRuijieLogoutRequest(
        req,
        res,
        () => ruijieAccount.logout(),
        () => runtime.requestRestart(),
        cause => {
          ctx.logger.warn(`dsh-plugin-desktop: failed to log out Ruijie account: ${cause instanceof Error ? cause.message : String(cause)}`)
        },
      ),
    }),
    'dsh-plugin-desktop: Ruijie SSO logout route',
  )
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: RUIJIE_BRAND_WORDMARK_PATH,
      handler: (_req, res) => {
        res.writeHead(200, {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=86400, immutable',
          'content-length': String(RUIJIE_BRAND_WORDMARK.byteLength),
        })
        res.end(RUIJIE_BRAND_WORDMARK)
      },
    }),
    'dsh-plugin-desktop: Ruijie brand wordmark route',
  )
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'exact',
      path: ARCHIVED_SESSION_ACTION_PATH,
      handler: (req, res) => handleArchivedSessionActionRequest(
        req,
        res,
        rendererOrigin,
        async ({ action, sessionId: rawSessionId }) => {
          const sessionId = SessionId(rawSessionId)
          const workspaceRegistry = ctx.get('workspaceRegistry')
          if (workspaceRegistry === undefined) throw new Error('工作区服务尚未就绪')
          const registry = workspaceRegistry as unknown as SessionLifecycleRegistry & typeof workspaceRegistry
          if (action === 'restore') {
            await registry.unarchiveSession(sessionId)
            return
          }
          if (action === 'ungroup') {
            for (const workspace of workspaceRegistry.list()) await workspace.detachSession(sessionId)
            return
          }
          const loadedSession = ctx.get('sessions')?.get(sessionId)
          if (loadedSession !== undefined && isSessionActivelyRunning(loadedSession.events)) {
            throw new Error('会话正在生成内容，请先停止生成再彻底删除')
          }
          const sessionPersistence = ctx.get('sessionPersistence')
          if (sessionPersistence === undefined) throw new Error('会话存储服务尚未就绪')
          const header = (await sessionPersistence.list()).find(candidate => candidate.id === sessionId)
          if (header === undefined) throw new Error('会话记录已经不存在')
          const location = sessionPersistence.locate(header)
          if (location?.kind !== 'jsonl') throw new Error('当前会话存储格式不支持彻底删除')
          const artifact = resolve(location.path)
          const sessionDirectory = dirname(artifact)
          if (!basename(artifact).startsWith('session.jsonl') || dirname(sessionDirectory) === sessionDirectory) {
            throw new Error('拒绝删除不安全的会话路径')
          }
          await workspaceRegistry.archiveSession(sessionId)
          for (const workspace of workspaceRegistry.list()) await workspace.detachSession(sessionId)
          await rm(sessionDirectory, { recursive: true, force: false })
        },
        cause => {
          ctx.logger.warn(`dsh-plugin-desktop: archived-session action failed: ${cause instanceof Error ? cause.message : String(cause)}`)
        },
      ),
    }),
    'dsh-plugin-desktop: archived session lifecycle route',
  )
  if (runtime.platform === 'win32') {
    ctx.effect(
      () => ctx.webServer.register({
        kind: 'exact',
        path: DESKTOP_DIRECTORY_PICKER_PATH,
        handler: (req, res) => handleDesktopDirectoryPickerRequest(
          req,
          res,
          rendererOrigin,
          () => runtime.pickDirectory(),
          cause => {
            ctx.logger.error(`dsh-plugin-desktop: native directory picker failed: ${cause instanceof Error ? cause.message : String(cause)}`)
          },
        ),
      }),
      'dsh-plugin-desktop: native directory picker route',
    )
    ctx.effect(
      () => ctx.webServer.register({
        kind: 'exact',
        path: DESKTOP_DIRECTORY_VALIDATOR_PATH,
        handler: (req, res) => handleDesktopDirectoryValidationRequest(
          req,
          res,
          rendererOrigin,
          path => runtime.validateDirectory(path),
          cause => {
            ctx.logger.error(`dsh-plugin-desktop: workspace directory validation failed: ${cause instanceof Error ? cause.message : String(cause)}`)
          },
        ),
      }),
      'dsh-plugin-desktop: workspace directory validation route',
    )
  }
  ctx.effect(() => {
    let pending: ReturnType<typeof setImmediate> | undefined
    const stopWatching = settings.watch((next) => {
      if (next.mode === config.mode && next.port === config.port) {
        if (pending !== undefined) clearImmediate(pending)
        pending = undefined
        return
      }
      pending ??= setImmediate(() => {
        pending = undefined
        void runtime.requestRestart().catch((cause: unknown) => {
          ctx.logger.error('dsh-plugin-desktop: failed to restart after startup setting change')
          ctx.logger.error(cause)
        })
      })
    })
    return () => {
      stopWatching()
      if (pending !== undefined) clearImmediate(pending)
    }
  }, 'dsh-plugin-desktop: restart after startup setting change')
  ctx.on('settings/updated', (namespace, next) => {
    if (namespace !== UI_THEME_SETTINGS_NAMESPACE) return
    runtime.setThemeSource((next as ThemeSettings).preference)
  })
  ctx.on('settings/updated', (namespace, next) => {
    if (namespace !== UI_LOCALE_SETTINGS_NAMESPACE) return
    runtime.setLocalePreference((next as LocaleSettings).preference)
  })
  ctx.effect(
    () => runtime.schedule({
      ...config,
      url: desktopRendererUrl(ctx.webServer.port, config.mode, runtime.platform),
      productName: '锐捷 Harness',
      windowTitle: '锐捷 Harness',
      iconPath,
      trayIcons,
      readLocalePreference: () => {
        return (ctx.settings.get(UI_LOCALE_SETTINGS_NAMESPACE) as LocaleSettings | undefined)?.preference
      },
      readThemeSource: () => {
        const theme = ctx.settings.get(UI_THEME_SETTINGS_NAMESPACE) as ThemeSettings | undefined
        if (theme === undefined) {
          throw new Error('dsh-plugin-desktop: native shell requires the ui-theme settings namespace')
        }
        return theme.preference
      },
      requestQuit: appExit,
      requestModeChange: async mode => settings.update({ mode }),
    }),
    'dsh-plugin-desktop: native shell generation',
  )
}
