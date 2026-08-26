import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('session lifecycle client runtime patch', () => {
  it('ships archive management and permanent deletion controls', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: { build: string } }
    expect(packageJson.scripts.build).toContain('patch-dsh-session-lifecycle-client-runtime.mjs')
    expect(packageJson.scripts.build).toContain('patch-dsh-session-delete-dialog-runtime.mjs')
    const clientPath = import.meta.resolve('@deepseek-ai/dsh-client-ui-workspace/client')
    const source = readFileSync(new URL(clientPath), 'utf8')
    expect(source.match(/ruijie-session-lifecycle-v4/g)).toHaveLength(1)
    expect(source.match(/const sessionList =/g)).toHaveLength(1)
    expect(source).toContain('"archive.view": "查看归档会话"')
    expect(source).toContain('archivedSessionAction(sessionId, action)')
    expect(source).toContain('ruijie-session-archived')
    expect(source).toContain('if (sessionList.current === event.detail)')
    expect(source).toContain('startSession(owner?.workspaceId)')
    expect(source).toContain('ruijie-session-delete-request')
    expect(source).toContain('open: deleteConfirmTarget !== null')
    expect(source).toContain('id: "delete"')
    expect(source).toContain('open: archiveOpen')
    expect(source).not.toContain('window.confirm(')
    expect(source).not.toContain('window.alert(')
    expect(source).not.toContain('window.location.reload()')
  })
})
