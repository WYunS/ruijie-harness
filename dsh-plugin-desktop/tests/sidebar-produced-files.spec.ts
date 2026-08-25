import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  selectProducedFiles,
} from 'dsh-better-sidebar/src/client/produced-files.ts'
import {
  wrapOpenPath,
} from 'dsh-better-sidebar/src/client/openpath-intercept.ts'
import { subscribeTreeRefresh } from 'dsh-better-sidebar/src/client/tree-refresh.ts'
import {
  ARTIFACT_REGISTRATION_PROMPT,
  registerArtifactPrompt,
  registerArtifactTool,
  validateArtifactPaths,
} from 'dsh-better-sidebar/src/tools.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('better sidebar produced-file integration', () => {
  it('reads rc.8 turn-scoped deliverables from the turn-tail owner', () => {
    const owner = {
      seq: 12,
      turn: {
        data: new Map([
          ['deliverables', {
            produced: [
              { seq: 9, path: 'report.pdf' },
              { seq: 13, path: 'too-late.pdf' },
            ],
          }],
        ]),
      },
    }

    expect(selectProducedFiles(owner)).toEqual(['report.pdf'])
  })

  it('lets directory intents fall through to the host instead of opening them as editor files', async () => {
    const original = vi.fn(async () => {})
    const openInSidebar = vi.fn()
    const workspaces = { openPath: original }
    const dispose = wrapOpenPath(workspaces, {
      takeoverEnabled: () => true,
      currentSessionId: () => 'session-a',
      currentSessionCwd: () => 'C:\\Users\\Yunsh\\Desktop\\1',
      openInSidebar,
    })

    await workspaces.openPath('.')
    // ui-conversation resolves the `.` used by "Show in folder" before it
    // reaches the wrapper, so the real runtime input is the absolute cwd.
    await workspaces.openPath('C:\\Users\\Yunsh\\Desktop\\1')
    await workspaces.openPath('report.pdf')

    expect(original).toHaveBeenCalledTimes(2)
    expect(original).toHaveBeenNthCalledWith(1, '.')
    expect(original).toHaveBeenNthCalledWith(2, 'C:\\Users\\Yunsh\\Desktop\\1')
    expect(openInSidebar).toHaveBeenCalledOnce()
    expect(openInSidebar).toHaveBeenCalledWith('report.pdf', 'session-a')
    dispose()
  })

  it('automatically invalidates the visible file tree and cleans up its timer', () => {
    vi.useFakeTimers()
    const listeners = new Map<string, () => void>()
    vi.stubGlobal('window', {
      setInterval,
      clearInterval,
      addEventListener: (name: string, listener: () => void) => { listeners.set(name, listener) },
      removeEventListener: (name: string) => { listeners.delete(name) },
    })
    const refresh = vi.fn()
    const dispose = subscribeTreeRefresh(refresh, 50)

    vi.advanceTimersByTime(100)
    listeners.get('focus')?.()
    expect(refresh).toHaveBeenCalledTimes(3)

    dispose()
    vi.advanceTimersByTime(100)
    expect(refresh).toHaveBeenCalledTimes(3)
    expect(listeners.has('focus')).toBe(false)
  })

  it('refreshes visible directories without clearing rendered rows first', () => {
    const source = readFileSync(
      new URL('../../vendor/dsh-better-sidebar/src/client/FileTree.tsx', import.meta.url),
      'utf8',
    )

    expect(source).not.toContain('dataRef.current = {}')
    expect(source).not.toContain('setData({})')
    expect(source).toContain('loadDir(root, true)')
  })

  it('publishes verified shell-created files with edit locations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-artifact-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'report.pdf')
    await writeFile(path, '%PDF-1.7')

    await expect(validateArtifactPaths(['report.pdf'], directory)).resolves.toEqual([path])
    await expect(validateArtifactPaths(['missing.pdf'], directory)).rejects.toThrow('artifact does not exist')

    const tools: ToolDefinition[] = []
    registerArtifactTool({
      tools: {
        register(tool: unknown) {
          tools.push(tool as ToolDefinition)
          return () => {}
        },
      },
    } as never)
    expect(tools).toHaveLength(1)
    expect(tools[0]?.name).toBe('artifact_register')
    expect(tools[0]?.presentCall?.({ paths: ['report.pdf'] })).toEqual({
      card: 'generic',
      kind: 'edit',
      title: 'Register generated files',
      locations: [{ path: 'report.pdf' }],
    })
  })

  it('tells the model to register every script-created final output including PDFs', () => {
    const section = vi.fn(() => () => {})
    registerArtifactPrompt({ systemPrompt: { section } } as never)

    expect(section).toHaveBeenCalledWith({
      name: 'better-sidebar:artifact-registration',
      order: 189,
      text: ARTIFACT_REGISTRATION_PROMPT,
    })
    expect(ARTIFACT_REGISTRATION_PROMPT).toContain('artifact_register')
    expect(ARTIFACT_REGISTRATION_PROMPT).toContain('PDF')
    expect(ARTIFACT_REGISTRATION_PROMPT).toContain('every final output file')
    expect(ARTIFACT_REGISTRATION_PROMPT).toContain('Do not register files already reported')
  })
})
