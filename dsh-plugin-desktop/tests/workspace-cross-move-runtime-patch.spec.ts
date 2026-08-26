import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { JsonStorageBackend } from '@deepseek-ai/dsh-storage-json'
import { SessionId } from '@deepseek-ai/dsh-session'
import WorkspaceRegistry, { type Workspace, type WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { afterEach, describe, expect, it } from 'vitest'

interface CrossWorkspaceRegistry {
  moveSessionBefore(workspaceId: WorkspaceId, sessionId: SessionId, beforeSessionId?: SessionId): Promise<Workspace>
  unarchiveSession(sessionId: SessionId): Promise<void>
}

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function openRegistry(storageRoot: string, sessionId: SessionId, cwd: string) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new JsonStorageBackend(storageRoot)
  ctx.storage.backend.register('json', backend)
  const facility = new DomainFacility(ctx, { backend: 'json', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  ctx.provide('sessionPersistence', {
    list: async () => [{ version: 0, id: sessionId, createdAt: 1, cwd }],
    load: () => { throw new Error('event bodies are not needed') },
    inspect: () => { throw new Error('event bodies are not needed') },
  } as never)
  const fiber = await ctx.plugin(WorkspaceRegistry)
  return { ctx, fiber, backend, registry: ctx.workspaceRegistry }
}

describe('cross-workspace session move runtime patch', () => {
  it('runs before every desktop build', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: { build: string }
    }
    expect(packageJson.scripts.build).toContain('node scripts/patch-dsh-workspace-cross-move-runtime.mjs')
  })

  it('moves a session to another workspace and preserves that grouping after restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-cross-move-'))
    roots.push(root)
    const sourcePath = join(root, 'source')
    const targetPath = join(root, 'target')
    const storageRoot = join(root, 'storage')
    await Promise.all([mkdir(sourcePath), mkdir(targetPath)])
    const sessionId = SessionId('session-to-move')

    const first = await openRegistry(storageRoot, sessionId, sourcePath)
    const source = first.registry.list().find(workspace => workspace.path === sourcePath)!
    const target = await first.registry.create(targetPath)
    const movable = first.registry as unknown as CrossWorkspaceRegistry
    await movable.moveSessionBefore(target.id, sessionId)
    expect(source.sessionIds).toEqual([])
    expect(target.sessionIds).toEqual([sessionId])
    await first.fiber.dispose()
    await first.backend.close()

    const reopened = await openRegistry(storageRoot, sessionId, sourcePath)
    expect(reopened.registry.get(source.id)?.sessionIds).toEqual([])
    expect(reopened.registry.get(target.id)?.sessionIds).toEqual([sessionId])
    await reopened.fiber.dispose()
    await reopened.backend.close()
  })

  it('restores an archived session without changing its workspace position', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-unarchive-'))
    roots.push(root)
    const sourcePath = join(root, 'source')
    const storageRoot = join(root, 'storage')
    await mkdir(sourcePath)
    const sessionId = SessionId('session-to-restore')
    const opened = await openRegistry(storageRoot, sessionId, sourcePath)
    await opened.registry.archiveSession(sessionId)
    await (opened.registry as unknown as CrossWorkspaceRegistry).unarchiveSession(sessionId)
    expect(opened.registry.archivedSessionIds).toEqual([])
    expect(opened.registry.list()[0]?.sessionIds).toEqual([sessionId])
    await opened.fiber.dispose()
    await opened.backend.close()
  })

  it('ships cross-group drag handling in the workspace client runtime', () => {
    const clientPath = import.meta.resolve('@deepseek-ai/dsh-client-ui-workspace/client')
    const source = readFileSync(new URL(clientPath), 'utf8')
    expect(source).toContain('const targetGroup = groups.find((candidate) => candidate.key === over.accountKey);')
    expect(source).toContain('insertSessionBefore(over.accountKey, activeDrag.sessionId, anchor)')
    expect(source).toContain('archivedSessionAction(activeDrag.sessionId, "ungroup")')
    expect(source).toContain('drag.over?.accountKey === group.key ? drag.over')
  })
})
