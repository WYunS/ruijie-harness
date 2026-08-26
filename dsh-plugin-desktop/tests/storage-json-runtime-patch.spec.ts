import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { JsonStorageBackend } from '@deepseek-ai/dsh-storage-json'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('JSON storage runtime recovery patch', () => {
  it('runs before every desktop build', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: { build: string }
    }
    expect(packageJson.scripts.build).toContain('node scripts/patch-dsh-storage-json-runtime.mjs')
  })

  it('recreates a removed storage root before the next atomic publish', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'dsh-storage-recovery-'))
    roots.push(parent)
    const root = join(parent, 'storages')
    const backend = new JsonStorageBackend(root)
    const unit = await backend.kv.open({ name: 'workspace', version: 1, tables: ['items'], hasGlobal: false })

    await unit.putRecord('items', 'workspace-1', { title: 'removable' })
    await rm(root, { recursive: true, force: true })

    await expect(unit.deleteRecord('items', 'workspace-1')).resolves.toBeUndefined()
    const stored = JSON.parse(await readFile(join(root, 'workspace.json'), 'utf8')) as {
      tables: { items: Record<string, unknown> }
    }
    expect(stored.tables.items).toEqual({})
    await backend.close()
  })
})
