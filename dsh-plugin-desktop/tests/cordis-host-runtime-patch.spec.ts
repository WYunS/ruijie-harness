import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: { build: string } }
const packagePath = require.resolve('@deepseek-ai/dsh-cordis-host-runner/package.json')
const packageRoot = dirname(packagePath)
const runtime = readFileSync(resolve(packageRoot, 'lib/index.js'), 'utf8')
const guardRuntime = readFileSync(resolve(packageRoot, 'lib/types/guard.js'), 'utf8')
const sandboxRuntime = readFileSync(resolve(packageRoot, 'lib/types/sandbox.js'), 'utf8')

describe('Cordis host runtime guidance patch', () => {
  it('runs before every desktop build', () => {
    expect(packageJson.scripts.build).toContain('node scripts/patch-dsh-cordis-host-runtime.mjs')
  })

  it('teaches the complete dynamic Tool declaration at runtime', () => {
    for (const source of [runtime, sandboxRuntime]) {
      expect(source).toContain('name, description, parameters, output, and execute')
      expect(source).toContain('JSON-Schema object wrapper')
      expect(source).toContain('next model step')
      expect(source).toContain('harness.defineTool({ name, description, parameters, output: { schema, render, presentationMeta? }, execute })')
    }
  })

  it('returns actionable parameter-shape errors from both runtime copies', () => {
    for (const source of [runtime, guardRuntime]) {
      expect(source).toContain("ParameterSchemaSpec property map (for example { value: { type: 'string', required: true } })")
      expect(source).toContain("ParameterSchemaSpec property object (for example { type: 'string', required: true })")
    }
  })
})
