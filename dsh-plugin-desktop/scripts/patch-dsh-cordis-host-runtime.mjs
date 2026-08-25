import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const packageRoot = dirname(require.resolve('@deepseek-ai/dsh-cordis-host-runner/package.json'))

const parameterMapBefore = 'ParameterSchemaSpec object'
const parameterMapAfter = "ParameterSchemaSpec property map (for example { value: { type: 'string', required: true } }) or a JSON-Schema object wrapper"
const parameterPropertyBefore = 'ParameterSchemaSpec property object'
const parameterPropertyAfter = "ParameterSchemaSpec property object (for example { type: 'string', required: true })"
const descriptionBefore = 'Host helpers for Package-private Client RPC and model-visible dynamic Tools.'
const descriptionAfter = 'Host helpers for Package-private Client RPC and model-visible dynamic Tools. defineTool requires name, description, parameters, output, and execute; parameters accepts the compact property-map DSL or a JSON-Schema object wrapper. A registered Tool becomes visible from the next model step.'
const signatureBefore = 'harness.defineTool(definition: ToolDefinition): ToolDefinition'
const signatureAfter = 'harness.defineTool({ name, description, parameters, output: { schema, render, presentationMeta? }, execute }): ToolDefinition'

async function patchFile(relativePath, replacements) {
  const path = resolve(packageRoot, relativePath)
  let source = await readFile(path, 'utf8')
  let changed = false

  for (const [before, after] of replacements) {
    if (source.includes(after)) continue
    const first = source.indexOf(before)
    if (first < 0) throw new Error(`Cordis host runtime patch could not find target in ${relativePath}: ${before}`)
    if (source.indexOf(before, first + before.length) >= 0) {
      throw new Error(`Cordis host runtime patch found multiple targets in ${relativePath}: ${before}`)
    }
    source = source.slice(0, first) + after + source.slice(first + before.length)
    changed = true
  }

  if (changed) await writeFile(path, source)
}

await patchFile('lib/index.js', [
  [parameterMapBefore, parameterMapAfter],
  [parameterPropertyBefore, parameterPropertyAfter],
  [descriptionBefore, descriptionAfter],
  [signatureBefore, signatureAfter],
])
await patchFile('lib/types/guard.js', [
  [parameterMapBefore, parameterMapAfter],
  [parameterPropertyBefore, parameterPropertyAfter],
])
await patchFile('lib/types/sandbox.js', [
  [descriptionBefore, descriptionAfter],
  [signatureBefore, signatureAfter],
])
