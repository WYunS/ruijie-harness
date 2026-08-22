/** Verify that the generated sidebar payload is exactly the payload packaging will consume. */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(desktopRoot, '..', 'vendor', 'dsh-better-sidebar', 'lib')
const installedRoot = resolve(desktopRoot, 'node_modules', 'dsh-better-sidebar', 'lib')

function filesBelow(root) {
  const files = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(relative(root, path).replaceAll('\\', '/'))
    }
  }
  visit(root)
  return files.sort()
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()
}

const sourceFiles = filesBelow(sourceRoot)
const installedFiles = filesBelow(installedRoot)
const errors = []

if (JSON.stringify(sourceFiles) !== JSON.stringify(installedFiles)) {
  errors.push('the vendor/lib and installed/lib file lists differ')
}

for (const file of sourceFiles) {
  const sourceHash = digest(join(sourceRoot, file))
  let installedHash
  try {
    installedHash = digest(join(installedRoot, file))
  } catch {
    errors.push(`${file}: missing from the installed package`)
    continue
  }
  if (sourceHash !== installedHash) errors.push(`${file}: SHA-256 differs`)
}

if (errors.length > 0) {
  console.error('Vendored sidebar is not synchronized with the package used by Electron:')
  for (const error of errors) console.error(`- ${error}`)
  console.error('Run `corepack yarn install` at the repository root, then rerun this gate.')
  process.exitCode = 1
} else {
  console.log(`Vendored sidebar verified (${sourceFiles.length} files).`)
  console.log(`client.js SHA-256: ${digest(join(sourceRoot, 'client.js'))}`)
}
