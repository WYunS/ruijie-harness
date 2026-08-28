import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type convergence only: locale/theme declarations expose settings slot rows.
// The desktop client does not load or register a settings surface.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { applyAdvancedShell } from './advanced-shell.ts'
import { startRendererBootReporter } from './boot-health.ts'
import { installDesktopDirectoryPickerBridge } from './directory-picker.ts'
import { parseDesktopClientEnvironment } from './environment.ts'
import { applyMacDesktopDirectoryFlow } from './mac-directory-flow.tsx'
import { installWorkspaceFolderDrop } from './workspace-folder-drop.ts'
import { applyRuijieAccountCard } from './ruijie-account-card.tsx'
import { applyRuijieBrand } from './ruijie-brand.ts'
import { applyRuijieUnifiedModelDirectory } from './ruijie-model-directory.ts'
import { installSearchRecoveryPresentation } from './search-recovery-presentation.ts'
import { installWindowsCompatibilityStyles } from './styles.ts'

export { applyAdvancedShell } from './advanced-shell.ts'
export {
  RENDERER_BOOT_REPORT_PATH,
  rendererBootReport,
  sendRendererBootReport,
  startRendererBootReporter,
} from './boot-health.ts'
export type { RendererBootLoader, RendererBootReport } from './boot-health.ts'
export { parseDesktopClientEnvironment } from './environment.ts'
export type { DesktopClientEnvironment, DesktopClientMode, DesktopClientPlatform } from './environment.ts'

/** Services required by advanced presentation. */
export const inject = [
  'modelDirectories',
  'slots',
  'sessions',
  'theme',
  'workspaces',
]

/** Register desktop-owned client surfaces for the current BrowserWindow mode. @param ctx - browser Cordis context. */
export function apply(ctx: ClientContext): void {
  const environment = parseDesktopClientEnvironment(window.location.search)
  if (!environment) return
  ctx.effect(() => {
    document.body.dataset.dshDesktopMode = environment.mode
    document.body.dataset.dshDesktopPlatform = environment.platform
    return () => {
      delete document.body.dataset.dshDesktopMode
      delete document.body.dataset.dshDesktopPlatform
    }
  }, 'dsh-plugin-desktop: renderer environment markers')
  ctx.effect(
    () => startRendererBootReporter(ctx.loader),
    'dsh-plugin-desktop: renderer boot health report',
  )
  // macOS protected folders must enter through the app-owned NSOpenPanel;
  // accepting a raw drag path bypasses that explicit authorization boundary.
  if (environment.platform !== 'darwin') {
    ctx.effect(
      () => installWorkspaceFolderDrop({
        create: input => ctx.workspaces.create(input),
        startSession: workspaceId => { ctx.workspaces.startSession(workspaceId) },
      }),
      'dsh-plugin-desktop: workspace folder drop',
    )
  }
  ctx.effect(
    () => installSearchRecoveryPresentation(),
    'dsh-plugin-desktop: quiet intermediate failure presentation',
  )
  if (environment.platform === 'win32' || environment.platform === 'darwin') {
    ctx.effect(
      () => installDesktopDirectoryPickerBridge(),
      'dsh-plugin-desktop: native directory picker bridge',
    )
  }
  if (environment.platform === 'darwin') applyMacDesktopDirectoryFlow(ctx)
  applyRuijieAccountCard(ctx)
  applyRuijieBrand(ctx)
  applyRuijieUnifiedModelDirectory(ctx)
  if (environment.mode === 'advanced') {
    applyAdvancedShell(ctx, environment)
  } else if (environment.platform === 'win32') {
    ctx.effect(
      () => installWindowsCompatibilityStyles(),
      'dsh-plugin-desktop: Windows compatibility caption styles',
    )
  }
}
