import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const packagePath = require.resolve('dsh-vision-router/package.json')
const clientPath = new URL('./lib/client.js', pathToFileURL(packagePath))

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first < 0) {
    if (source.includes(after)) return source
    throw new Error(`dsh-vision-router visibility patch could not find ${label}`)
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`dsh-vision-router visibility patch found multiple ${label} targets`)
  }
  return source.slice(0, first) + after + source.slice(first + before.length)
}

let source = await readFile(clientPath, 'utf8')

// Normalize output from earlier runs before applying the patch. This makes the
// build step repeatable and repairs clients produced by the first implementation.
source = source.replaceAll("    const SETTINGS_UI_VISIBLE = false\n", '')
source = source.replaceAll("    const RUIJIE_SETTINGS_UI_VISIBLE = false\n", '')
source = source.replaceAll('if (SETTINGS_UI_VISIBLE) ', '')
source = source.replaceAll('if (RUIJIE_SETTINGS_UI_VISIBLE) ', '')
source = source.replaceAll(
  "ctx.slots.inject(SETTINGS_UI_VISIBLE ? 'settings.section' : 'ruijie.hidden.settings.section', function* () {",
  "ctx.slots.inject('settings.section', function* () {",
)
source = source.replaceAll(
  "ctx.slots.inject(SETTINGS_UI_VISIBLE ? 'settings.plugin.item' : 'ruijie.hidden.settings.plugin.item', function* () {",
  "ctx.slots.inject('settings.plugin.item', function* () {",
)
source = source.replaceAll("ctx.slots.inject('settings.section', function* () {\n            if (!SETTINGS_UI_VISIBLE) return", "ctx.slots.inject('settings.section', function* () {")
source = source.replaceAll("ctx.slots.inject('settings.plugin.item', function* () {\n            if (!SETTINGS_UI_VISIBLE) return", "ctx.slots.inject('settings.plugin.item', function* () {")
source = source.replaceAll("ctx.slots.inject('settings.section', function* () {\n            if (!RUIJIE_SETTINGS_UI_VISIBLE) return", "ctx.slots.inject('settings.section', function* () {")
source = source.replaceAll("ctx.slots.inject('settings.plugin.item', function* () {\n            if (!RUIJIE_SETTINGS_UI_VISIBLE) return", "ctx.slots.inject('settings.plugin.item', function* () {")

source = replaceOnce(
  source,
  "    const NS = 'vision-router'",
  "    const NS = 'vision-router'\n    const RUIJIE_SETTINGS_UI_VISIBLE = false",
  'desktop settings visibility flag',
)
source = replaceOnce(
  source,
  "ctx.effect(() => installVisionSettingsGuide(t), 'vision-router: model selection guide')",
  "if (RUIJIE_SETTINGS_UI_VISIBLE) ctx.effect(() => installVisionSettingsGuide(t), 'vision-router: model selection guide')",
  'settings guide registration',
)
source = replaceOnce(
  source,
  "ctx.effect(() => installOnboarding(t), 'vision-router: first-run onboarding')",
  "if (RUIJIE_SETTINGS_UI_VISIBLE) ctx.effect(() => installOnboarding(t), 'vision-router: first-run onboarding')",
  'settings onboarding registration',
)
source = replaceOnce(
  source,
  "ctx.slots.inject('settings.section', function* () {",
  "ctx.slots.inject('settings.section', function* () {\n            if (!RUIJIE_SETTINGS_UI_VISIBLE) return",
  'primary settings slot registration',
)
source = replaceOnce(
  source,
  "ctx.slots.inject('settings.plugin.item', function* () {",
  "ctx.slots.inject('settings.plugin.item', function* () {\n            if (!RUIJIE_SETTINGS_UI_VISIBLE) return",
  'legacy settings slot registration',
)
await writeFile(clientPath, source)
