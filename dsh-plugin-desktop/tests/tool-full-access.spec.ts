import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import SandboxedFs from '@deepseek-ai/dsh-fs-sandbox'
import SandboxPolicy, { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import SessionStore from '@deepseek-ai/dsh-session'
import { ShellExecutor, type ShellExecRequest, type ShellExecSpec, type ShellRunResult, type ShellProcess } from '@deepseek-ai/dsh-shell'
import * as ShellEnv from '@deepseek-ai/dsh-shell-env'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ToolBash from '@deepseek-ai/dsh-tool-bash'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import * as ToolPwsh from '@deepseek-ai/dsh-tool-pwsh'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import Subprocess from '@deepseek-ai/dsh-subprocess-local'
import Sandbox from '@deepseek-ai/dsh-sandbox-local'
import SandboxPwsh from '@deepseek-ai/dsh-pwsh-sandbox'

type Mode = 'read-only' | 'workspace-write' | 'danger-full-access'
type Permissions = { sandbox_permissions?: string, justification?: string }
const redundant: { label: string, permissions: Permissions }[] = [
  { label: 'baseline', permissions: {} },
  ...['danger-full-access', 'workspace-write'].flatMap(sandbox_permissions => [
    { label: `${sandbox_permissions}/missing reason`, permissions: { sandbox_permissions } },
    ...['Already authorized.', '', ' \t\n'].map(justification => ({
      label: `${sandbox_permissions}/${JSON.stringify(justification)}`,
      permissions: { sandbox_permissions, justification },
    })),
  ]),
  { label: 'orphan reason', permissions: { justification: 'Already authorized.' } },
]

// Record the executor boundary without launching Bash or applying OS ACLs.
// The production tools and session policy resolver are not mocked.
class RecordingShell extends ShellExecutor {
  readonly requests: ShellExecRequest[] = []
  override get sandboxMode() { return 'danger-full-access' as const }
  override resolve(request: ShellExecRequest): ShellExecSpec {
    this.requests.push(request)
    return { command: request.command, workdir: request.workdir ?? process.cwd(), timeoutMs: 1000,
      stdoutMaxBytes: 1000, sandboxPolicy: request.sandboxPolicy }
  }
  override async run(spec: ShellExecSpec): Promise<ShellRunResult> {
    return { exitCode: 0, signal: null, timedOut: false, aborted: false, timeoutMs: spec.timeoutMs,
      stdout: { text: 'OK', truncated: false }, stderr: { text: '', truncated: false } }
  }
  override start(): ShellProcess { throw new Error('Unexpected background launch') }
}

let ctx: Context | undefined
let fixture: string | undefined
let fixtureParent: string | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (fixture) {
    // Do not recursively remove an unresolved, substituted, or broad path.
    const target = await realpath(fixture)
    if (target !== fixture || dirname(target) !== fixtureParent || !basename(target).startsWith('.full-access-test-')) {
      throw new Error(`Refusing unexpected fixture cleanup: ${target}`)
    }
    await rm(target, { recursive: true, force: true })
    fixture = undefined
  }
})

async function setup(mode: Mode = 'danger-full-access', nativePwsh = false) {
  fixtureParent = await realpath(process.cwd())
  // Outside the OS temp roots so workspace-write containment is tested honestly.
  fixture = await realpath(await mkdtemp(join(fixtureParent, '.full-access-test-')))
  const workspace = join(fixture, 'workspace')
  const outside = join(fixture, 'Desktop fixture')
  await mkdir(workspace)
  await mkdir(outside)
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionStore)
  await ctx.plugin(ShellEnv, { dshHome: join(fixture, 'dsh-home') })
  await ctx.plugin(SandboxPolicy, { mode, workspaceRoot: workspace })
  await ctx.plugin(SandboxedFs, { cwd: workspace })
  await ctx.plugin(ToolFs)
  if (nativePwsh) {
    await ctx.plugin(Subprocess)
    await ctx.plugin(Sandbox)
    await ctx.plugin(SandboxPwsh, { cwd: workspace })
  } else {
    await ctx.plugin(RecordingShell)
    await ctx.plugin(ToolBash, { enableRunInBackground: false })
  }
  await ctx.plugin(ToolPwsh, { enableRunInBackground: false })
  return { runtime: ctx, workspace, outside }
}

function execute(runtime: Context, name: string, args: object, agent?: Agent) {
  return runtime.tools.execute({ callId: CallId('full-access-regression'), name, arguments: args,
    signal: new AbortController().signal, ...(agent ? { agent } : {}) })
}

function success(result: ToolExecutionResult) {
  expect(result.isError, JSON.stringify(result.content)).toBe(false)
}

describe('full-access compatibility across mutating tools', () => {
  it.each(redundant)('writes and edits real Markdown: $label', async ({ permissions }) => {
    const { runtime, outside } = await setup()
    const file = join(outside, '中文 空格.md')
    success(await execute(runtime, 'write', { file_path: file, content: '# 验收\r\n第一行\r\n', ...permissions }))
    expect(await readFile(file, 'utf8')).toBe('# 验收\r\n第一行\r\n')
    success(await execute(runtime, 'edit', { file_path: file, old_string: '第一行', new_string: '修改成功', ...permissions }))
    expect(await readFile(file, 'utf8')).toBe('# 验收\r\n修改成功\r\n')
  })

  describe.each(['bash', 'pwsh'])('%s', (tool) => {
    it.each(redundant)('reaches the executor: $label', async ({ permissions }) => {
      const { runtime } = await setup()
      success(await execute(runtime, tool, { command: 'echo OK', description: 'Check command dispatch', ...permissions }))
      expect((runtime.shell as RecordingShell).requests).toHaveLength(1)
      expect((runtime.shell as RecordingShell).requests[0]?.sandboxPolicy?.mode).toBe('danger-full-access')
    })

    it.each([{ command: ' ' }, { description: ' ' }, { timeoutMs: 0 }, { sandbox_permissions: 'invalid-mode' }])(
      'still rejects invalid ordinary arguments %j', async (invalid) => {
        const { runtime } = await setup()
        expect((await execute(runtime, tool, { command: 'echo OK', description: 'Check validation',
          sandbox_permissions: 'danger-full-access', ...invalid })).isError).toBe(true)
        expect((runtime.shell as RecordingShell).requests).toHaveLength(0)
      },
    )
  })

  describe.each(['write', 'edit', 'bash', 'pwsh'])('%s policy boundaries', (tool) => {
    it.each(['read-only', 'workspace-write'] as const)('keeps %s escalation fail-closed', async (mode) => {
      const { runtime, outside } = await setup(mode)
      const file = join(outside, 'unchanged.md')
      await writeFile(file, 'original')
      for (const permissions of [
        { sandbox_permissions: 'danger-full-access' },
        { sandbox_permissions: 'danger-full-access', justification: '' },
        { sandbox_permissions: 'danger-full-access', justification: ' \t' },
        { sandbox_permissions: mode, justification: 'Not wider.' },
        { sandbox_permissions: 'danger-full-access', justification: 'No approval channel.' },
        { justification: 'Missing target.' },
      ]) {
        const result = await execute(runtime, tool, { file_path: file, content: 'changed', old_string: 'original',
          new_string: 'changed', command: 'echo SHOULD-NOT-RUN', description: 'Check restricted mode', ...permissions })
        expect(result.isError).toBe(true)
        expect(await readFile(file, 'utf8')).toBe('original')
        expect((runtime.shell as RecordingShell).requests).toHaveLength(0)
      }
    })

    it('honors live per-session mode switches, not the deployment default', async () => {
      const { runtime, outside } = await setup()
      const file = join(outside, 'session.md')
      await writeFile(file, 'original')
      const session = runtime.sessions.create(undefined, { meta: { cwd: outside } })
      // Only the caller identity is a fixture; its session log and policy fold are real.
      const agent = { ctx: runtime, session } as Agent
      const args = { file_path: file, content: 'changed', old_string: 'original', new_string: 'changed',
        command: 'echo OK', description: 'Check session mode', sandbox_permissions: 'danger-full-access' }
      setSandboxMode(session, 'read-only')
      expect((await execute(runtime, tool, args, agent)).isError).toBe(true)
      expect(await readFile(file, 'utf8')).toBe('original')
      expect((runtime.shell as RecordingShell).requests).toHaveLength(0)
      setSandboxMode(session, 'danger-full-access')
      success(await execute(runtime, tool, args, agent))
      if (tool === 'write' || tool === 'edit') expect(await readFile(file, 'utf8')).toBe('changed')
      else expect((runtime.shell as RecordingShell).requests[0]?.sandboxPolicy?.workspaceRoot).toBe(outside)
    })
  })

  it.each(['write', 'edit'])('%s still enforces ordinary filesystem boundaries', async (tool) => {
    const { runtime, workspace, outside } = await setup('workspace-write')
    const insideFile = join(workspace, 'inside.md')
    const outsideFile = join(outside, 'outside.md')
    for (const file of [insideFile, outsideFile]) await writeFile(file, 'original')
    const args = { content: 'changed', old_string: 'original', new_string: 'changed' }
    success(await execute(runtime, tool, { file_path: insideFile, ...args }))
    const denied = await execute(runtime, tool, { file_path: outsideFile, ...args })
    expect(denied.isError).toBe(true)
    expect(JSON.stringify(denied.content)).toContain('file access denied')
    expect(await readFile(outsideFile, 'utf8')).toBe('original')
  })

  it.each(['write', 'edit'])('%s still validates required content arguments', async (tool) => {
    const { runtime, outside } = await setup()
    const file = join(outside, 'unchanged.md')
    await writeFile(file, 'original')
    expect((await execute(runtime, tool, { file_path: file, sandbox_permissions: 'danger-full-access' })).isError).toBe(true)
    expect(await readFile(file, 'utf8')).toBe('original')
  })

  it.runIf(process.platform === 'win32')('native PowerShell actually writes Markdown with redundant permissions', async () => {
    const { runtime, outside } = await setup('danger-full-access', true)
    for (const [index, { permissions }] of redundant.entries()) {
      const file = join(outside, `pwsh-${index}.md`)
      const quoted = file.replaceAll("'", "''")
      success(await execute(runtime, 'pwsh', { command: `[IO.File]::WriteAllText('${quoted}', '# 中文写入成功')`,
        description: 'Write a temporary Markdown fixture', ...permissions }))
      expect(await readFile(file, 'utf8')).toBe('# 中文写入成功')
    }
  }, 30_000)
})
