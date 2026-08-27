import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  generateMacIconsetPngs,
  MAC_ICONSET_ENTRIES,
} from '../scripts/generate-mac-app-icns.mjs'

const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('macOS multi-resolution application icon', () => {
  it('renders every Finder icon slot from the purple RJ source', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ruijie-mac-icon-test-'))
    temporaryRoots.push(root)
    const source = fileURLToPath(new URL('../build/app-icon-mac.png', import.meta.url))
    await generateMacIconsetPngs(source, root)

    for (const [filename, size] of MAC_ICONSET_ENTRIES) {
      const rendered = sharp(readFileSync(join(root, filename)))
      const metadata = await rendered.metadata()
      expect(metadata).toEqual(expect.objectContaining({
        format: 'png',
        width: size,
        height: size,
        channels: 4,
        hasAlpha: true,
      }))

      const actual = await rendered.ensureAlpha().raw().toBuffer()
      const expected = await sharp(source)
        .resize({ width: size, height: size, fit: 'fill', kernel: sharp.kernel.lanczos3 })
        .toColourspace('srgb')
        .ensureAlpha()
        .raw()
        .toBuffer()
      expect(actual.equals(expected), filename).toBe(true)
    }
  })
})
