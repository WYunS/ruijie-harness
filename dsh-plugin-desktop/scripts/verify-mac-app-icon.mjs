/** Verify that packaged macOS icons contain the expected purple RJ at every size. */

import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { MAC_ICONSET_ENTRIES } from './generate-mac-app-icns.mjs'

const MAX_PREMULTIPLIED_CHANNEL_MAE = 8

export function premultipliedChannelMae(actual, expected) {
  if (actual.length !== expected.length || actual.length % 4 !== 0) return Number.POSITIVE_INFINITY
  let difference = 0
  for (let offset = 0; offset < actual.length; offset += 4) {
    const actualAlpha = actual[offset + 3]
    const expectedAlpha = expected[offset + 3]
    difference += Math.abs(actualAlpha - expectedAlpha)
    for (let channel = 0; channel < 3; channel += 1) {
      const actualPremultiplied = actual[offset + channel] * actualAlpha / 255
      const expectedPremultiplied = expected[offset + channel] * expectedAlpha / 255
      difference += Math.abs(actualPremultiplied - expectedPremultiplied)
    }
  }
  return difference / actual.length
}

function unpackIcns(icnsPath, iconsetDirectory) {
  const result = spawnSync('iconutil', ['-c', 'iconset', icnsPath, '-o', iconsetDirectory], {
    encoding: 'utf8',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`iconutil could not unpack ${icnsPath}: ${(result.stderr || result.stdout).trim()}`)
  }
}

async function requireNonEmptyFile(path, label) {
  let metadata
  try {
    metadata = await stat(path)
  } catch {
    throw new Error(`${label} is missing: ${path}`)
  }
  if (!metadata.isFile() || metadata.size === 0) throw new Error(`${label} is empty: ${path}`)
}

export async function verifyMacIcns(sourcePath, icnsPath, label) {
  await requireNonEmptyFile(icnsPath, label)
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'ruijie-mac-icon-verify-'))
  const iconsetDirectory = join(temporaryRoot, `${basename(icnsPath)}.iconset`)
  try {
    unpackIcns(icnsPath, iconsetDirectory)
    const extractedFiles = new Set(await readdir(iconsetDirectory))
    for (const [filename, size] of MAC_ICONSET_ENTRIES) {
      if (!extractedFiles.has(filename)) {
        throw new Error(`${label} is missing the ${filename} small-icon slot`)
      }
      const actualPath = join(iconsetDirectory, filename)
      const actualImage = sharp(await readFile(actualPath))
      const metadata = await actualImage.metadata()
      if (metadata.width !== size || metadata.height !== size) {
        throw new Error(`${label} has an invalid ${filename} size`)
      }
      const actual = await actualImage.ensureAlpha().toColourspace('srgb').raw().toBuffer()
      const expected = await sharp(sourcePath)
        .resize({ width: size, height: size, fit: 'fill', kernel: sharp.kernel.lanczos3 })
        .toColourspace('srgb')
        .ensureAlpha()
        .raw()
        .toBuffer()
      const difference = premultipliedChannelMae(actual, expected)
      if (difference > MAX_PREMULTIPLIED_CHANNEL_MAE) {
        throw new Error(
          `${label} ${filename} does not match the purple RJ source (MAE ${difference.toFixed(2)})`,
        )
      }
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

export async function verifyPackagedMacIcons(sourcePath, appIcnsPath, volumeIcnsPath) {
  await verifyMacIcns(sourcePath, appIcnsPath, 'application icon')
  await verifyMacIcns(sourcePath, volumeIcnsPath, 'DMG volume icon')
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  const [sourcePath, appIcnsPath, volumeIcnsPath] = process.argv.slice(2)
  if (sourcePath === undefined || appIcnsPath === undefined || volumeIcnsPath === undefined) {
    throw new Error('usage: verify-mac-app-icon.mjs <purple-rj.png> <app.icns> <.VolumeIcon.icns>')
  }
  await verifyPackagedMacIcons(sourcePath, appIcnsPath, volumeIcnsPath)
}
