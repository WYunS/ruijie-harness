import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { normalizeCodexFileCitations } from '../scripts/patch-dsh-file-citation-runtime.mjs'

const require = createRequire(import.meta.url)

describe('deliverable file citation compatibility', () => {
  it('converts a Codex output citation into DSH clickable inline-code syntax', () => {
    expect(normalizeCodexFileCitations(
      'Created :codex-file-citation{path="C:/Users/Yunsh/Desktop/1/output/pdf/nature_beauty.pdf" purpose="output"}, done.',
    )).toBe('Created `C:/Users/Yunsh/Desktop/1/output/pdf/nature_beauty.pdf`, done.')
  })

  it('leaves malformed and unrelated prose unchanged', () => {
    expect(normalizeCodexFileCitations('plain text')).toBe('plain text')
    expect(normalizeCodexFileCitations(':codex-file-citation{purpose="output"}')).toBe(
      ':codex-file-citation{purpose="output"}',
    )
  })

  it('patches the renderer and tells the model not to emit unsupported directives', () => {
    const conversationPackage = require.resolve('@deepseek-ai/dsh-client-ui-conversation/package.json')
    const conversationRuntime = readFileSync(new URL('./lib/client.js', `file:///${conversationPackage.replaceAll('\\', '/')}`), 'utf8')
    const deliverablesPackage = require.resolve('@deepseek-ai/dsh-client-ui-deliverables/package.json')
    const promptRuntime = readFileSync(new URL('./lib/index.js', `file:///${deliverablesPackage.replaceAll('\\', '/')}`), 'utf8')

    expect(conversationRuntime).toContain('text: __dshNormalizeCodexFileCitations(block.text)')
    expect(promptRuntime).toContain('Never output :codex-file-citation')
  })

  it('runs the compatibility patch before every desktop build', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: { build: string }
    }
    expect(manifest.scripts.build).toContain('node scripts/patch-dsh-file-citation-runtime.mjs &&')
  })
})
