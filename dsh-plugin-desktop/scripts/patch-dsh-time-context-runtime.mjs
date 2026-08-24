import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const packagePath = require.resolve('@deepseek-ai/dsh-time-context/package.json')
const runtimePath = new URL('./lib/index.js', pathToFileURL(packagePath))

const directive = 'Authoritative current date and time: use this timestamp for every relative-date expression (including today, yesterday, this week, latest, and current) and for every search or tool argument. Ignore any conflicting year inferred from training data or earlier assistant/tool text; never guess a different current year.'
const before = 'const browserText = renderBrowserTimeZoneContext(browserContext);\n\treturn `Time sampled while preparing turn ${turn}, step ${step}: ${formatTimestamp(now, formatter, timeZone)}\\n${browserText}\\nElapsed since the preceding ${baseline}: ${elapsed}.`;'
const after = `const browserText = renderBrowserTimeZoneContext(browserContext);\n\treturn \`Time sampled while preparing turn \${turn}, step \${step}: \${formatTimestamp(now, formatter, timeZone)}\\n\${browserText} ${directive}\\nElapsed since the preceding \${baseline}: \${elapsed}.\`;`

let source = await readFile(runtimePath, 'utf8')
const first = source.indexOf(before)
if (first < 0) {
  if (!source.includes(directive)) {
    throw new Error('time-context authority patch could not find renderText target')
  }
} else {
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error('time-context authority patch found multiple renderText targets')
  }
  source = source.slice(0, first) + after + source.slice(first + before.length)
  await writeFile(runtimePath, source)
}
