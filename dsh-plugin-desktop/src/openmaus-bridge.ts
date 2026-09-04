/** Discovery record for trusted local clients such as OpenMausBot. */

import { readFile, unlink } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

export const OPENMAUS_BRIDGE_FILENAME = 'openmaus-bridge.json'

export interface OpenMausBridgeRecord {
  readonly schemaVersion: 1
  readonly endpoint: string
  readonly pid: number
  readonly generationId: string
}

export function openMausBridgePath(bridgeDirectory: string): string {
  if (!isAbsolute(bridgeDirectory) || /[\0\r\n]/u.test(bridgeDirectory)) {
    throw new Error('dsh-plugin-desktop: OpenMaus bridge directory must be absolute')
  }
  return join(resolve(bridgeDirectory), OPENMAUS_BRIDGE_FILENAME)
}

export async function publishOpenMausBridge(
  bridgeDirectory: string,
  port: number,
  generationId: string,
  pid: number = process.pid,
): Promise<() => Promise<void>> {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('dsh-plugin-desktop: OpenMaus bridge port must be a listening TCP port')
  }
  if (!Number.isSafeInteger(pid) || pid < 1) {
    throw new Error('dsh-plugin-desktop: OpenMaus bridge pid must be a positive integer')
  }
  if (generationId.length === 0 || /[\0\r\n]/u.test(generationId)) {
    throw new Error('dsh-plugin-desktop: OpenMaus bridge generation id is invalid')
  }
  const path = openMausBridgePath(bridgeDirectory)
  const record: OpenMausBridgeRecord = {
    schemaVersion: 1,
    endpoint: `http://127.0.0.1:${String(port)}`,
    pid,
    generationId,
  }
  await writeFileAtomic(path, `${JSON.stringify(record)}\n`, { mode: 0o600, dirMode: 0o700 })

  let disposed = false
  return async () => {
    if (disposed) return
    disposed = true
    try {
      const current = JSON.parse(await readFile(path, 'utf8')) as Partial<OpenMausBridgeRecord>
      if (current.generationId !== generationId) return
      await unlink(path)
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
    }
  }
}
