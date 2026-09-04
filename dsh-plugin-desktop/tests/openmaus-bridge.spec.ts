import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openMausBridgePath, publishOpenMausBridge } from '../src/openmaus-bridge.ts'

describe('OpenMaus bridge discovery', () => {
  it('publishes the loopback endpoint and removes only its own generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-openmaus-'))
    const release = await publishOpenMausBridge(root, 43123, 'generation-a', 123)
    const path = openMausBridgePath(root)
    await expect(readFile(path, 'utf8').then(JSON.parse)).resolves.toEqual({
      schemaVersion: 1,
      endpoint: 'http://127.0.0.1:43123',
      pid: 123,
      generationId: 'generation-a',
    })
    await release()
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not remove a newer process discovery record', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-openmaus-race-'))
    const releaseOld = await publishOpenMausBridge(root, 43123, 'generation-old', 123)
    const releaseNew = await publishOpenMausBridge(root, 43124, 'generation-new', 124)
    await releaseOld()
    await expect(readFile(openMausBridgePath(root), 'utf8').then(JSON.parse)).resolves.toMatchObject({
      endpoint: 'http://127.0.0.1:43124',
      generationId: 'generation-new',
    })
    await releaseNew()
  })
})
