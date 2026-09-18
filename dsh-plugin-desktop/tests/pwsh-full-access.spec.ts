import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { ShellExecRequest, ShellExecSpec, ShellProcess, ShellRunResult } from '@deepseek-ai/dsh-shell'
import * as ShellEnv from '@deepseek-ai/dsh-shell-env'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ToolPwsh from '@deepseek-ai/dsh-tool-pwsh'
import ToolRuntime from '@deepseek-ai/dsh-tools'

class FullAccessShell extends ShellExecutor {
  readonly requests: ShellExecRequest[] = []

  override get sandboxMode() {
    return 'danger-full-access' as const
  }

  override resolve(request: ShellExecRequest): ShellExecSpec {
    this.requests.push(request)
    return {
      command: request.command,
      workdir: request.workdir ?? process.cwd(),
      timeoutMs: request.timeoutMs ?? 60_000,
      stdoutMaxBytes: request.stdoutMaxBytes ?? 64_000,
      sandboxPolicy: request.sandboxPolicy,
    }
  }

  override async run(spec: ShellExecSpec): Promise<ShellRunResult> {
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      aborted: false,
      timeoutMs: spec.timeoutMs,
      stdout: { text: 'lark-cli-ready\n', truncated: false },
      stderr: { text: '', truncated: false },
      sandbox: { mode: 'danger-full-access', denied: false },
    }
  }

  override start(): ShellProcess {
    throw new Error('background execution is outside this regression')
  }
}

describe('desktop pwsh full-access compatibility', () => {
  it('runs an ordinary command when a model redundantly requests full access', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(ShellEnv)
    await ctx.plugin(SandboxPolicyService, { mode: 'danger-full-access' })
    await ctx.plugin(FullAccessShell)
    await ctx.plugin(ToolPwsh)

    const result = await ctx.tools.execute({
      callId: CallId('lark-cli-full-access'),
      name: 'pwsh',
      arguments: {
        command: 'lark-cli auth status',
        description: 'Check Lark CLI authentication status',
        sandbox_permissions: 'danger-full-access',
        justification: 'The session already has full access.',
      },
      signal: new AbortController().signal,
    })

    const shell = ctx.shell as FullAccessShell
    expect(result.isError).toBe(false)
    expect(shell.requests).toHaveLength(1)
    expect(shell.requests[0]?.sandboxPolicy?.mode).toBe('danger-full-access')
  })
})
