import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const path = resolve(dirname(require.resolve('@deepseek-ai/dsh-client-ui-workspace/package.json')), 'lib/client.js')
let source = await readFile(path, 'utf8')
const PATCH_MARKER = '/* ruijie-workspace-edit-focus-v1 */'

if (source.includes(PATCH_MARKER)) process.exit(0)

function replaceOnce(before, after) {
  const first = source.indexOf(before)
  if (first < 0) throw new Error(`Workspace edit focus patch target missing: ${JSON.stringify(before)}`)
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Workspace edit focus patch target is ambiguous: ${JSON.stringify(before)}`)
  source = source.slice(0, first) + after + source.slice(first + before.length)
}

replaceOnce(
  '\t\t\t\t\t\t\t\tdisabled: renaming,\n\t\t\t\t\t\t\t\tonFocus:',
  '\t\t\t\t\t\t\t\tdisabled: renaming,\n\t\t\t\t\t\t\t\tonPointerDown: (event) => { event.currentTarget.focus(); },\n\t\t\t\t\t\t\t\tonFocus:',
)
replaceOnce(
  '\t\t\t\t\t\t\tdisabled: sessionRenaming,\n\t\t\t\t\t\t\tonFocus:',
  '\t\t\t\t\t\t\tdisabled: sessionRenaming,\n\t\t\t\t\t\t\tonPointerDown: (event) => { event.currentTarget.focus(); },\n\t\t\t\t\t\t\tonFocus:',
)

source = `${PATCH_MARKER}\n${source}`
await writeFile(path, source)
