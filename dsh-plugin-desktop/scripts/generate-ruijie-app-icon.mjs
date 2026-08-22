/** Generate Ruijie Harness brand assets without redrawing the supplied logo. */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const referencePath = join(packageRoot, '..', 'assets', 'branding', 'ruijie-logo-reference.png')
const wordmarkOutputPath = join(packageRoot, 'build', 'ruijie-wordmark.png')
const outputPath = join(packageRoot, 'build', 'app-icon.png')
const windowsOutputPath = join(packageRoot, 'build', 'app-icon.ico')
const RUIJIE_RED = { r: 215, g: 25, b: 32 }

/** Recover the supplied official red logo pixels and preserve anti-aliasing. */
async function extractOfficialWordmark() {
  const { data, info } = await sharp(await readFile(referencePath))
    .extract({ left: 30, top: 95, width: 162, height: 35 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const output = Buffer.alloc(info.width * info.height * 4)
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const sourceOffset = pixel * info.channels
    const targetOffset = pixel * 4
    const red = data[sourceOffset]
    const green = data[sourceOffset + 1]
    const blue = data[sourceOffset + 2]
    const belongsToLogo = red > 100 && red > green * 1.28 && red > blue * 1.28
    const alpha = belongsToLogo
      ? Math.max(0, Math.min(255, Math.round((255 - ((green + blue) / 2)) * 1.07)))
      : 0
    output[targetOffset] = RUIJIE_RED.r
    output[targetOffset + 1] = RUIJIE_RED.g
    output[targetOffset + 2] = RUIJIE_RED.b
    output[targetOffset + 3] = alpha
  }
  return await sharp(output, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 0 })
    .resize({ width: 616, fit: 'inside', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer()
}

const wordmark = await extractOfficialWordmark()
await writeFile(wordmarkOutputPath, wordmark)

// Keep the existing blue application tile, replacing only its centre artwork
// with the requested white RJ initials.
const appArtwork = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="blue" x1="160" y1="128" x2="864" y2="912" gradientUnits="userSpaceOnUse">
        <stop stop-color="#6682FF"/>
        <stop offset="1" stop-color="#3D57DA"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" rx="238" fill="url(#blue)"/>
    <text x="496" y="650" text-anchor="middle" fill="#FFFFFF"
      font-family="Segoe UI, Arial, sans-serif" font-size="400" font-weight="800"
      font-style="italic" letter-spacing="-42">RJ</text>
  </svg>
`)

const appIcon = await sharp(appArtwork, { density: 192 })
  .resize(1024, 1024)
  .toColourspace('rgb16')
  .withIccProfile('p3')
  .png({ compressionLevel: 9, progressive: false, adaptiveFiltering: false, palette: false })
  .toBuffer()

await writeFile(outputPath, appIcon)

const windowsSizes = [16, 24, 32, 48, 64, 128, 256]
const windowsFrames = await Promise.all(windowsSizes.map(async size => await sharp(appIcon)
  .resize(size, size, { fit: 'fill' })
  .png({ compressionLevel: 9, palette: false })
  .toBuffer()))
const directorySize = 6 + windowsFrames.length * 16
let frameOffset = directorySize
const iconHeader = Buffer.alloc(directorySize)
iconHeader.writeUInt16LE(0, 0)
iconHeader.writeUInt16LE(1, 2)
iconHeader.writeUInt16LE(windowsFrames.length, 4)
for (const [index, frame] of windowsFrames.entries()) {
  const entry = 6 + index * 16
  const size = windowsSizes[index]
  iconHeader.writeUInt8(size === 256 ? 0 : size, entry)
  iconHeader.writeUInt8(size === 256 ? 0 : size, entry + 1)
  iconHeader.writeUInt8(0, entry + 2)
  iconHeader.writeUInt8(0, entry + 3)
  iconHeader.writeUInt16LE(1, entry + 4)
  iconHeader.writeUInt16LE(32, entry + 6)
  iconHeader.writeUInt32LE(frame.length, entry + 8)
  iconHeader.writeUInt32LE(frameOffset, entry + 12)
  frameOffset += frame.length
}
await writeFile(windowsOutputPath, Buffer.concat([iconHeader, ...windowsFrames]))
