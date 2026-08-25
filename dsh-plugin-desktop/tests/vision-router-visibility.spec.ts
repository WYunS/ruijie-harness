import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

describe('Ruijie Vision Router presentation', () => {
  it('keeps runtime tool cards but does not register user-facing settings entries', () => {
    const packagePath = require.resolve('dsh-vision-router/package.json')
    const clientPath = new URL('./lib/client.js', `file:///${packagePath.replaceAll('\\', '/')}`)
    const source = readFileSync(clientPath, 'utf8')
    expect(source).toContain('const SETTINGS_UI_VISIBLE = false')
    expect(source).toContain("SETTINGS_UI_VISIBLE ? 'settings.section' : 'ruijie.hidden.settings.section'")
    expect(source).toContain("SETTINGS_UI_VISIBLE ? 'settings.plugin.item' : 'ruijie.hidden.settings.plugin.item'")
    expect(source).toContain("ctx.slots.inject('tool.call.toolview'")
  })

  it('applies the visibility patch before every desktop build', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: { build: string }
    }
    expect(manifest.scripts.build).toContain('node scripts/patch-dsh-vision-router-client-runtime.mjs')
  })
})
