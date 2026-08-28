import { opendir } from 'node:fs/promises'
import type { DesktopPlatform } from './runtime.ts'

export type DirectoryAccessProbe = (path: string) => Promise<void>

async function probeDirectory(path: string): Promise<void> {
  const directory = await opendir(path)
  await directory.close()
}

/**
 * Consume macOS user intent while the app-owned chooser is still the active
 * operation. A denied folder never reaches Workspace persistence, so no
 * background restore loop can repeatedly request the same permission.
 */
export async function confirmDesktopDirectoryAccess(
  platform: DesktopPlatform,
  path: string,
  probe: DirectoryAccessProbe = probeDirectory,
): Promise<string> {
  if (platform !== 'darwin') return path
  try {
    await probe(path)
  } catch (cause: unknown) {
    throw new Error(
      '锐捷 Harness 无法访问所选文件夹。该文件夹尚未添加，您可以重新选择其他文件夹。',
      { cause },
    )
  }
  return path
}
