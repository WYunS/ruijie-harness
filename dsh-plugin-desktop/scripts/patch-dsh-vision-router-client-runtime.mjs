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
source = replaceOnce(
  source,
  "    const NS = 'vision-router'",
  "    const NS = 'vision-router'\n    const SETTINGS_UI_VISIBLE = false",
  'desktop settings visibility flag',
)
source = replaceOnce(
  source,
  "ctx.effect(() => installVisionSettingsGuide(t), 'vision-router: model selection guide')",
  "if (SETTINGS_UI_VISIBLE) ctx.effect(() => installVisionSettingsGuide(t), 'vision-router: model selection guide')",
  'settings guide registration',
)
source = replaceOnce(
  source,
  "ctx.effect(() => installOnboarding(t), 'vision-router: first-run onboarding')",
  "if (SETTINGS_UI_VISIBLE) ctx.effect(() => installOnboarding(t), 'vision-router: first-run onboarding')",
  'settings onboarding registration',
)
source = replaceOnce(
  source,
  "ctx.slots.inject('settings.section', function* () {",
  "ctx.slots.inject(SETTINGS_UI_VISIBLE ? 'settings.section' : 'ruijie.hidden.settings.section', function* () {",
  'primary settings slot registration',
)
source = replaceOnce(
  source,
  "ctx.slots.inject('settings.plugin.item', function* () {",
  "ctx.slots.inject(SETTINGS_UI_VISIBLE ? 'settings.plugin.item' : 'ruijie.hidden.settings.plugin.item', function* () {",
  'legacy settings slot registration',
)
await writeFile(clientPath, source)
