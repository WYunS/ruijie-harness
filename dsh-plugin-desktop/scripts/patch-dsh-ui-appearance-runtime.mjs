import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const packagePath = require.resolve('dsh-ui-appearance/package.json')
const clientPath = new URL('./lib/client.js', pathToFileURL(packagePath))

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first < 0) {
    if (source.includes(after)) return source
    throw new Error(`dsh-ui-appearance discoverability patch could not find ${label}`)
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`dsh-ui-appearance discoverability patch found multiple ${label} targets`)
  }
  return source.slice(0, first) + after + source.slice(first + before.length)
}

let source = await readFile(clientPath, 'utf8')
source = replaceOnce(
  source,
  '"row.title": "个性化外观"',
  '"row.title": "界面外观（颜色、壁纸与透明度）"',
  'Chinese settings label',
)
source = replaceOnce(
  source,
  'id: "appearance-custom",\n\t\t\t\torder: 20,',
  'id: "appearance-custom",\n\t\t\t\torder: -100,',
  'General settings row order',
)
source = replaceOnce(
  source,
  '\t\t\t\t\ttitle: t("row.title"),\n\t\t\t\t\topen,',
  '\t\t\t\t\ttitle: t("row.title"),\n\t\t\t\t\tcollapsedContent: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", { type: "button", style: { marginLeft: "auto", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "8px", padding: "2px 10px", color: "var(--dsw-alias-label-primary)", background: "transparent", cursor: "pointer", font: "inherit", fontSize: "12px", lineHeight: "18px" }, onClick: (event) => { event.stopPropagation(); resetAll(); }, children: t("actions.reset") }),\n\t\t\t\t\tkeepContentWhenOpen: true,\n\t\t\t\t\topen,',
  'always-visible reset action',
)
await writeFile(clientPath, source)
