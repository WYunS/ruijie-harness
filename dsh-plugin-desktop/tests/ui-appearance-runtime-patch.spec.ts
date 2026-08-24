import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

describe('UI appearance discoverability patch', () => {
  it('places the appearance editor first in General settings with a clear label', () => {
    const packagePath = require.resolve('dsh-ui-appearance/package.json')
    const clientPath = new URL('./lib/client.js', `file:///${packagePath.replaceAll('\\', '/')}`)
    const source = readFileSync(clientPath, 'utf8')

    expect(source).toContain('"row.title": "界面外观（颜色、壁纸与透明度）"')
    expect(source).toContain('id: "appearance-custom",\n\t\t\t\torder: -100,')
    expect(source).toContain('keepContentWhenOpen: true')
    expect(source).toContain('event.stopPropagation(); resetAll();')
  })

  it('runs the discoverability patch before every build', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: { build: string }
    }
    expect(manifest.scripts.build).toContain('node scripts/patch-dsh-ui-appearance-runtime.mjs')
  })
})
