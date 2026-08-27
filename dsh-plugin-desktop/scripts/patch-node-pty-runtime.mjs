import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NODE_PTY_UNIX_RUNTIME_PATHS = [
  'node_modules/node-pty/lib/unixTerminal.js',
  'node_modules/dsh-better-sidebar/node_modules/node-pty/lib/unixTerminal.js',
]

const ORIGINAL = "helperPath = helperPath.replace('app.asar', 'app.asar.unpacked');"
const GUARDED = "helperPath = helperPath.replace(/app\\.asar(?!\\.unpacked)/, 'app.asar.unpacked');"

/** Make node-pty's ASAR path correction safe when Electron already unpacked it. */
export function rewriteNodePtyUnixRuntime(source, label) {
  if (source.includes(GUARDED)) return source
  const first = source.indexOf(ORIGINAL)
  if (first < 0) throw new Error(`node-pty runtime patch could not find the helper path rewrite in ${label}`)
  if (source.indexOf(ORIGINAL, first + ORIGINAL.length) >= 0) {
    throw new Error(`node-pty runtime patch found multiple helper path rewrites in ${label}`)
  }
  return source.slice(0, first) + GUARDED + source.slice(first + ORIGINAL.length)
}

/** Patch both node-pty copies shipped by the desktop and its sidebar terminal. */
export function patchNodePtyRuntime(desktopRoot) {
  for (const relativePath of NODE_PTY_UNIX_RUNTIME_PATHS) {
    const filename = join(desktopRoot, relativePath)
    const source = readFileSync(filename, 'utf8')
    const patched = rewriteNodePtyUnixRuntime(source, relativePath)
    if (patched !== source) writeFileSync(filename, patched)
  }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  patchNodePtyRuntime(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
}
