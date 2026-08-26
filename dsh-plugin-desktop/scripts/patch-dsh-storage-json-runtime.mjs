import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const packageRoot = dirname(require.resolve('@deepseek-ai/dsh-storage-json/package.json'))
const runtimePath = resolve(packageRoot, 'lib/index.js')
const before = 'async function writeAtomic(path, data) {\n\tconst tmp = join(dirname(path), `.${randomUUID()}.tmp`);'
const after = 'async function writeAtomic(path, data) {\n\tawait mkdir(dirname(path), { recursive: true, mode: 448 });\n\tconst tmp = join(dirname(path), `.${randomUUID()}.tmp`);'

let source = await readFile(runtimePath, 'utf8')
if (!source.includes(after)) {
  const first = source.indexOf(before)
  if (first < 0) throw new Error(`Storage JSON runtime patch could not find writeAtomic in ${runtimePath}`)
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Storage JSON runtime patch found multiple writeAtomic targets in ${runtimePath}`)
  }
  source = source.slice(0, first) + after + source.slice(first + before.length)
  await writeFile(runtimePath, source)
}
