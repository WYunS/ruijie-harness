/** Generate native tray bitmaps for the Ruijie Harness RJ mark. */

import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const buildRoot = join(packageRoot, 'build')
const BRAND_BLUE = '#4D6BFE'

function traySvg(background, size) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
      <rect x="3" y="3" width="58" height="58" rx="15" fill="${background}"/>
      <text x="30" y="42" text-anchor="middle" fill="#FFFFFF"
        font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="800"
        font-style="italic" letter-spacing="-3">RJ</text>
    </svg>
  `.trim())
}

const variants = [
  ['tray-iconTemplate.png', '#000000', 16],
  ['tray-iconTemplate@2x.png', '#000000', 32],
  ['tray-icon-blue.png', BRAND_BLUE, 16],
  ['tray-icon-blue@1.25x.png', BRAND_BLUE, 20],
  ['tray-icon-blue@1.5x.png', BRAND_BLUE, 24],
  ['tray-icon-blue@2x.png', BRAND_BLUE, 32],
]

await Promise.all(variants.map(async ([filename, color, size]) => {
  await sharp(traySvg(color, size), { density: 192 })
    .resize(size, size)
    .png({ compressionLevel: 9, palette: false })
    .toFile(join(buildRoot, filename))
}))

await writeFile(join(buildRoot, 'tray-icon.svg'), traySvg(BRAND_BLUE, 64))
