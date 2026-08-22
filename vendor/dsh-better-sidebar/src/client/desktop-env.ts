/**
 * Desktop-shell detection for the sidebar. The official DSH Desktop shell
 * (Electron) stamps every render URL with `dsh-desktop-mode` and
 * `dsh-desktop-platform` and exposes `window.__DSH_DESKTOP_FILE_PATH__`
 * through its preload; community Tauri shells keep the native system frame
 * (no stamps — plain-browser semantics). Parsed once per page and memoized
 * (the URL never changes mid-session); `resetDesktopEnvForTests` clears the
 * memo for unit tests.
 *
 * Geometry facts the sidebar adapts to (from the Electron runtime):
 * - win32 desktop URLs explicitly report the native window-controls overlay
 *   height. Both shell modes can use an overlay (the controls-only
 *   compatibility caption does), so mode alone cannot describe this inset.
 * - darwin `advanced` mode keeps the traffic lights at (16,16) in the
 *   top-left; nothing on the plugin's side touches that corner today, but
 *   the platform is still reported so left-edge controls can avoid it.
 * - older advanced-shell URLs did not report the inset; retain their 32px
 *   fallback so upgrading this plugin does not regress an existing shell.
 */
export interface DesktopEnv {
  /** Running inside a desktop shell (any URL stamp or preload marker). */
  readonly desktop: boolean
  /** `advanced` = desktop-owned layout; `compatibility` = upstream Web layout. */
  readonly mode: 'compatibility' | 'advanced' | null
  /** Shell platform stamp ('darwin' | 'win32' | …), lowercased, or null. */
  readonly platform: string | null
  /** Pixels the win32 shell reserves at the top-right for window controls
   *  (0 elsewhere). */
  readonly win32OverlayTop: number
}

let cached: DesktopEnv | undefined

/** Read the shell's desktop stamps (memoized per page). */
export function parseDesktopEnv(): DesktopEnv {
  if (cached !== undefined) return cached
  // location.search includes the leading '?', which URLSearchParams does NOT
  // strip (it would become part of the first key) — drop it explicitly.
  const params = new URLSearchParams(window.location.search.replace(/^\?/, ''))
  const modeParam = params.get('dsh-desktop-mode')
  const mode = modeParam === 'compatibility' || modeParam === 'advanced' ? modeParam : null
  const platformParam = params.get('dsh-desktop-platform')
  const platform = platformParam !== null && platformParam !== '' ? platformParam.toLowerCase() : null
  const overlayTopParam = params.get('dsh-desktop-titlebar-overlay-height')
  const parsedOverlayTop = overlayTopParam === null ? undefined : Number(overlayTopParam)
  const explicitOverlayTop = parsedOverlayTop !== undefined
    && Number.isInteger(parsedOverlayTop)
    && parsedOverlayTop >= 0
    && parsedOverlayTop <= 256
    ? parsedOverlayTop
    : undefined
  const desktop = mode !== null
    || typeof (window as { __DSH_DESKTOP_FILE_PATH__?: unknown }).__DSH_DESKTOP_FILE_PATH__ !== 'undefined'
  cached = {
    desktop,
    mode,
    platform,
    win32OverlayTop: desktop && platform === 'win32'
      ? (explicitOverlayTop ?? (mode === 'advanced' ? 32 : 0))
      : 0,
  }
  return cached
}

/** Test hook: drop the memo so the next parse re-reads the URL/globals. */
export function resetDesktopEnvForTests(): void {
  cached = undefined
}
