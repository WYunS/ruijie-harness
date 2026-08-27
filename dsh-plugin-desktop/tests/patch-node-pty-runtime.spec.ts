import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  NODE_PTY_UNIX_RUNTIME_PATHS,
  patchNodePtyRuntime,
  rewriteNodePtyUnixRuntime,
} from '../scripts/patch-node-pty-runtime.mjs'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('node-pty packaged macOS helper path guard', () => {
  it('runs the node-pty patch before generated output is cleaned and rebuilt', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: { build: string }
    }
    expect(manifest.scripts.build).toMatch(
      /patch-dsh-im-runtime\.mjs && node scripts\/patch-node-pty-runtime\.mjs &&[\s\S]+scripts\/clean\.mjs && tsdown/u,
    )
  })

  it('rewrites only a bare app.asar segment and is idempotent', () => {
    const original = "helperPath = helperPath.replace('app.asar', 'app.asar.unpacked');"
    const once = rewriteNodePtyUnixRuntime(original, 'fixture')
    expect(once).toContain("replace(/app\\.asar(?!\\.unpacked)/, 'app.asar.unpacked')")
    expect(rewriteNodePtyUnixRuntime(once, 'fixture')).toBe(once)

    const resolve = new Function('helperPath', `${once}; return helperPath`) as (path: string) => string
    expect(resolve('/A/app.asar/node_modules/node-pty')).toBe('/A/app.asar.unpacked/node_modules/node-pty')
    expect(resolve('/A/app.asar.unpacked/node_modules/node-pty')).toBe('/A/app.asar.unpacked/node_modules/node-pty')
  })

  it('patches both terminal runtimes that are bundled into the application', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-node-pty-patch-'))
    roots.push(root)
    for (const relativePath of NODE_PTY_UNIX_RUNTIME_PATHS) {
      const filename = join(root, relativePath)
      mkdirSync(join(filename, '..'), { recursive: true })
      writeFileSync(filename, "helperPath = helperPath.replace('app.asar', 'app.asar.unpacked');\n")
    }

    patchNodePtyRuntime(root)
    patchNodePtyRuntime(root)

    for (const relativePath of NODE_PTY_UNIX_RUNTIME_PATHS) {
      const source = readFileSync(join(root, relativePath), 'utf8')
      expect(source).toContain('/app\\.asar(?!\\.unpacked)/')
      expect(source).not.toContain("replace('app.asar', 'app.asar.unpacked')")
    }
  })
})
