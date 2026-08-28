import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
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
    const sourcePathInput = join(root, 'source')
    const targetPathInput = join(root, 'target')
    const storageRoot = join(root, 'storage')
    await Promise.all([mkdir(sourcePathInput), mkdir(targetPathInput)])
    const [sourcePath, targetPath] = await Promise.all([realpath(sourcePathInput), realpath(targetPathInput)])
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
    const sourcePathInput = join(root, 'source')
    const storageRoot = join(root, 'storage')
    await mkdir(sourcePathInput)
    const sourcePath = await realpath(sourcePathInput)
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

  it('probes each restored session cwd only once per startup indexing batch', () => {
    const workspacePath = import.meta.resolve('@deepseek-ai/dsh-workspace')
    const source = readFileSync(new URL(workspacePath), 'utf8')
    expect(source).toContain('const checkedPaths = /* @__PURE__ */ new Map();')
    expect(source).toContain('let checked = checkedPaths.get(header.cwd);')
    expect(source).toContain('checkedPaths.set(header.cwd, checked);')
  })

  it('performs one realpath and stat probe for repeated historical cwd values', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-probe-deduplication-'))
    roots.push(root)
    const workspacePathInput = join(root, 'Downloads')
    const storageRoot = join(root, 'storage')
    await mkdir(workspacePathInput)
    const workspacePath = await realpath(workspacePathInput)

    const installedModuleUrl = new URL(import.meta.resolve('@deepseek-ai/dsh-workspace'))
    const instrumentedModuleUrl = new URL(`probe-${crypto.randomUUID()}.mjs`, installedModuleUrl)
    const originalSource = await readFile(installedModuleUrl, 'utf8')
    const probeKey = `__dshWorkspaceProbe_${crypto.randomUUID().replaceAll('-', '')}`
    const instrumentedSource = originalSource.replace(
      'import { realpath, stat } from "node:fs/promises";',
      `import { realpath as realRealpath, stat as realStat } from "node:fs/promises";\nconst realpath = async (...args) => { globalThis.${probeKey}.realpath++; return await realRealpath(...args); };\nconst stat = async (...args) => { globalThis.${probeKey}.stat++; return await realStat(...args); };`,
    )
    expect(instrumentedSource).not.toBe(originalSource)
    await writeFile(instrumentedModuleUrl, instrumentedSource)
    ;(globalThis as Record<string, unknown>)[probeKey] = { realpath: 0, stat: 0 }
    const instrumented = await import(instrumentedModuleUrl.href) as { default: typeof WorkspaceRegistry }

    const ctx = new Context()
    await ctx.plugin(Storage)
    const backend = new JsonStorageBackend(storageRoot)
    ctx.storage.backend.register('json', backend)
    const facility = new DomainFacility(ctx, { backend: 'json', routes: {} })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)
    ctx.provide('sessionPersistence', {
      list: async () => [
        { version: 0, id: SessionId('old-session-1'), createdAt: 2, cwd: workspacePath },
        { version: 0, id: SessionId('old-session-2'), createdAt: 1, cwd: workspacePath },
      ],
      load: () => { throw new Error('event bodies are not needed') },
      inspect: () => { throw new Error('event bodies are not needed') },
    } as never)

    try {
      const fiber = await ctx.plugin(instrumented.default)
      expect((globalThis as unknown as Record<string, { realpath: number; stat: number }>)[probeKey]).toEqual({
        realpath: 1,
        stat: 1,
      })
      await fiber.dispose()
      await backend.close()
    } finally {
      delete (globalThis as Record<string, unknown>)[probeKey]
      await rm(instrumentedModuleUrl)
    }
  })
})
