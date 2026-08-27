/** Build a deterministic multi-resolution macOS application icon. */

import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

export const MAC_ICONSET_ENTRIES = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const sourcePath = join(packageRoot, 'build', 'app-icon-mac.png')
const outputPath = join(packageRoot, 'build', 'app-icon-mac.icns')

export async function generateMacIconsetPngs(source, iconsetDirectory) {
  await mkdir(iconsetDirectory, { recursive: true })
  for (const [filename, size] of MAC_ICONSET_ENTRIES) {
    await sharp(source, { failOn: 'warning' })
      .resize({ width: size, height: size, fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .toColourspace('srgb')
      .png({ compressionLevel: 9, progressive: false, adaptiveFiltering: false, palette: false })
      .toFile(join(iconsetDirectory, filename))
  }
}

export async function generateMacAppIcns(
  source = sourcePath,
  output = outputPath,
  platform = process.platform,
) {
  if (platform !== 'darwin') throw new Error('generate-mac-app-icns: iconutil requires macOS')
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'ruijie-mac-icon-'))
  const iconsetDirectory = join(temporaryRoot, 'app-icon-mac.iconset')
  try {
    await generateMacIconsetPngs(source, iconsetDirectory)
    await mkdir(dirname(output), { recursive: true })
    await rm(output, { force: true })
    const result = spawnSync('iconutil', ['-c', 'icns', iconsetDirectory, '-o', output], {
      encoding: 'utf8',
    })
    if (result.error !== undefined) throw result.error
    if (result.status !== 0) {
      throw new Error(`iconutil failed: ${(result.stderr || result.stdout).trim()}`)
    }
    const generated = await stat(output)
    if (!generated.isFile() || generated.size === 0) {
      throw new Error('generate-mac-app-icns: iconutil produced an empty icon')
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await generateMacAppIcns()
}
