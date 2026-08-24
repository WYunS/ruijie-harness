import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: { build: string } }
const runtimePath = require.resolve('@deepseek-ai/dsh-time-context')
const runtime = readFileSync(runtimePath, 'utf8')

describe('time-context runtime authority patch', () => {
  it('runs before every desktop build', () => {
    expect(packageJson.scripts.build).toContain('node scripts/patch-dsh-time-context-runtime.mjs')
  })

  it('makes the sampled date authoritative for relative dates and tool arguments', () => {
    expect(runtime).toContain('Authoritative current date and time')
    expect(runtime).toContain('for every search or tool argument')
    expect(runtime).toContain('earlier assistant/tool text')
    expect(runtime).toContain('never guess a different current year')
  })
})
