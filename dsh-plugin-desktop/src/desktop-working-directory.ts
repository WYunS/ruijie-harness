import { join } from 'node:path'

const PACKAGED_WORKSPACE_NAME = 'Ruijie Harness'

export interface DesktopWorkingDirectoryOptions {
  readonly isPackaged: boolean
  readonly launchDirectory: string
  readonly homeDirectory: string
}

/** Keep packaged launches out of DMG, Downloads, and terminal-inherited directories. */
export function desktopWorkingDirectory(options: DesktopWorkingDirectoryOptions): string {
  return options.isPackaged
    ? join(options.homeDirectory, PACKAGED_WORKSPACE_NAME)
    : options.launchDirectory
}
