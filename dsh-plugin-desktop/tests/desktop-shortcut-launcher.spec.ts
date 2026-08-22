import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const launcher = readFileSync(new URL('../../scripts/start-ruijie-dsh-desktop.vbs', import.meta.url), 'utf8')
const installer = readFileSync(new URL('../../scripts/install-ruijie-dsh-desktop-shortcut.ps1', import.meta.url), 'utf8')

describe('local desktop shortcut launcher', () => {
  it('starts the compiled Electron runtime without rebuilding the workspace', () => {
    expect(launcher).toContain('dsh-plugin-desktop\\node_modules\\electron\\dist\\electron.exe')
    expect(launcher).toContain('dsh-plugin-desktop\\lib\\main.js')
    expect(launcher).not.toMatch(/corepack|yarn\s|npm\s|run\s+build/iu)
  })

  it('uses the isolated local DSH home and Electron user-data directory', () => {
    expect(launcher).toContain('processEnvironment("DSH_HOME") = dshHome')
    expect(launcher).toContain('processEnvironment("RUIJIE_DSH_USER_DATA_DIR") = electronUserData')
  })

  it('uses the windowless Windows script host instead of a console shell', () => {
    expect(installer).toContain("'System32\\wscript.exe'")
    expect(installer).toContain('start-ruijie-dsh-desktop.vbs')
    expect(installer).not.toMatch(/powershell\.exe|cmd\.exe/iu)
    expect(launcher).toContain('shell.Run command, 0, False')
  })

  it('installs the renamed Ruijie Harness shortcut with the generated ICO', () => {
    expect(installer).toContain('$([char]0x9510)$([char]0x6377) Harness ($([char]0x672C)$([char]0x5730)$([char]0x5F00)$([char]0x53D1)$([char]0x7248)).lnk')
    expect(installer).toContain('build\\app-icon.ico')
    expect(installer).not.toContain('DeepSeek Harness.lnk')
  })
})
