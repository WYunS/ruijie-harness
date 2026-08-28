import { join } from 'node:path'

const PACKAGED_RUNTIME_DIRECTORY = 'runtime-cwd'

export interface DesktopWorkingDirectoryOptions {
  readonly isPackaged: boolean
  readonly launchDirectory: string
  readonly applicationDataDirectory: string
}

/** Keep the Host's private cwd out of user-visible and privacy-protected folders. */
export function desktopWorkingDirectory(options: DesktopWorkingDirectoryOptions): string {
  return options.isPackaged
    ? join(options.applicationDataDirectory, PACKAGED_RUNTIME_DIRECTORY)
    : options.launchDirectory
}
