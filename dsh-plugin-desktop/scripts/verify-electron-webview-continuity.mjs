import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const electron = require('electron')
const fixture = resolve(desktopRoot, 'tests/fixtures/electron-webview-continuity.cjs')
const runs = 20

for (let run = 1; run <= runs; run += 1) {
  const result = spawnSync(electron, [fixture], {
    cwd: desktopRoot,
    encoding: 'utf8',
    timeout: 15_000,
  })
  if (result.status !== 0) {
    process.stderr.write(`Electron webview continuity failed on run ${run}/${runs}.\n`)
    process.stderr.write(result.stderr || result.stdout || `exit ${String(result.status)}\n`)
    process.exit(1)
  }
}

process.stdout.write(`Electron webview continuity passed: ${runs}/${runs}\n`)

