/** BrowserWindow construction for compatibility and advanced shells. */

import type { BrowserWindowConstructorOptions, NativeImage } from 'electron'
import type { DesktopPlatform, DesktopShellSpec } from './runtime.ts'
import { WINDOWS_TITLEBAR_HEIGHT } from './window-chrome.ts'

/** High-contrast native caption overlay for the active Windows palette. */
export function windowsTitleBarOverlay(dark: boolean): Electron.TitleBarOverlay {
  return {
    // Keep the page's own titlebar surface visible; only the native caption
    // glyphs follow the current Harness theme.
    color: '#00000000',
    symbolColor: dark ? '#ffffff' : '#111318',
    height: WINDOWS_TITLEBAR_HEIGHT,
  }
}

/**
 * Build a secure BrowserWindow while preserving the operating system frame.
 * @param spec - shell values resolved from the active Cordis row.
 * @param icon - validated application icon.
 * @param platform - current Electron platform.
 * @returns options with a native frame and no custom materials.
 */
export function compatibilityWindowOptions(
  spec: DesktopShellSpec,
  icon: NativeImage,
  platform: DesktopPlatform,
  preload: string,
  dark = false,
): BrowserWindowConstructorOptions {
  if (spec.mode !== 'compatibility') {
    throw new Error(`dsh-plugin-desktop: unsupported compatibility window mode ${spec.mode}`)
  }
  const options: BrowserWindowConstructorOptions = {
    title: '',
    width: spec.width,
    height: spec.height,
    minWidth: spec.minWidth,
    minHeight: spec.minHeight,
    show: false,
    icon,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: true,
    },
  }
  if (platform === 'win32') {
    options.autoHideMenuBar = true
    options.titleBarStyle = 'hidden'
    options.titleBarOverlay = windowsTitleBarOverlay(dark)
  }
  return options
}

/**
 * Build the native material window used by the desktop-owned advanced shell.
 * @param spec - shell values resolved from the active Cordis row.
 * @param icon - validated application icon.
 * @param platform - current Electron platform.
 * @returns platform-native glass and window-control options.
 */
export function advancedWindowOptions(
  spec: DesktopShellSpec,
  icon: NativeImage,
  platform: DesktopPlatform,
  preload: string,
  dark = false,
): BrowserWindowConstructorOptions {
  if (spec.mode !== 'advanced') {
    throw new Error(`dsh-plugin-desktop: unsupported advanced window mode ${spec.mode}`)
  }
  const options: BrowserWindowConstructorOptions = {
    // Keep the native caption accessible without painting duplicate product
    // branding beside the Windows controls in the custom title-bar overlay.
    title: '',
    width: spec.width,
    height: spec.height,
    minWidth: spec.minWidth,
    minHeight: spec.minHeight,
    show: false,
    icon,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: true,
    },
  }
  if (platform === 'darwin') {
    return {
      ...options,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
      transparent: true,
      backgroundColor: '#00000000',
      vibrancy: 'sidebar',
      visualEffectState: 'followWindow',
    }
  }
  if (platform === 'win32') {
    return {
      ...options,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: windowsTitleBarOverlay(dark),
      backgroundColor: '#00000000',
      backgroundMaterial: 'mica',
      hasShadow: true,
      roundedCorners: true,
      thickFrame: true,
    }
  }
  throw new Error('dsh-plugin-desktop: advanced shell mode is supported on macOS and Windows')
}

/**
 * Select the BrowserWindow options for the active presentation mode.
 * @param spec - active shell generation.
 * @param icon - validated application icon.
 * @param platform - current Electron platform.
 * @returns mode-specific BrowserWindow options.
 */
export function desktopWindowOptions(
  spec: DesktopShellSpec,
  icon: NativeImage,
  platform: DesktopPlatform,
  preload: string,
  dark = false,
): BrowserWindowConstructorOptions {
  return spec.mode === 'compatibility'
    ? compatibilityWindowOptions(spec, icon, platform, preload, dark)
    : advancedWindowOptions(spec, icon, platform, preload, dark)
}
