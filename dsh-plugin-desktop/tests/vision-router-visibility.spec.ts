import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

describe('Ruijie Vision Router presentation', () => {
  it('keeps runtime tool cards but does not register user-facing settings entries', () => {
    const packagePath = require.resolve('dsh-vision-router/package.json')
    const clientPath = new URL('./lib/client.js', `file:///${packagePath.replaceAll('\\', '/')}`)
    const source = readFileSync(clientPath, 'utf8')
    expect(source).toContain('const RUIJIE_SETTINGS_UI_VISIBLE = false')
    expect(source).toContain("ctx.slots.inject('settings.section', function* () {\n            if (!RUIJIE_SETTINGS_UI_VISIBLE) return")
    expect(source).toContain("ctx.slots.inject('settings.plugin.item', function* () {\n            if (!RUIJIE_SETTINGS_UI_VISIBLE) return")
    expect(source).toContain("ctx.slots.inject('tool.call.toolview'")
  })

  it('remains valid and self-registers after repeated build patches', () => {
    const patchPath = fileURLToPath(new URL('../scripts/patch-dsh-vision-router-client-runtime.mjs', import.meta.url))
    expect(spawnSync(process.execPath, [patchPath]).status).toBe(0)
    expect(spawnSync(process.execPath, [patchPath]).status).toBe(0)

    const packagePath = require.resolve('dsh-vision-router/package.json')
    const clientPath = fileURLToPath(new URL('./lib/client.js', pathToFileURL(packagePath)))
    const probe = [
      "let registration",
      "globalThis.window={__ModuleLoader__:{load:value=>{registration=value}}}",
      `await import(${JSON.stringify(`${pathToFileURL(clientPath).href}?registration-probe=1`)})`,
      "if(registration?.id!=='dsh-vision-router')throw new Error('dsh-vision-router loaded without registering via __ModuleLoader__.load')",
    ].join(';')
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
  })

  it('applies the visibility patch before every desktop build', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: { build: string }
    }
    expect(manifest.scripts.build).toContain('node scripts/patch-dsh-vision-router-client-runtime.mjs')
  })
})
