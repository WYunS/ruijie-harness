import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const packagePath = require.resolve('@xmanrui/dsh-im/package.json')
const runtimePath = new URL('./lib/index.js', pathToFileURL(packagePath))

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first < 0) {
    if (source.includes(after)) return source
    throw new Error(`dsh-im compatibility patch could not find ${label}`)
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`dsh-im compatibility patch found multiple ${label} targets`)
  }
  return source.slice(0, first) + after + source.slice(first + before.length)
}

let source = await readFile(runtimePath, 'utf8')
const proxyImport = "import { HttpsProxyAgent as __dshHttpsProxyAgent } from 'https-proxy-agent';\n"
if (!source.includes(proxyImport)) source = proxyImport + source

const originalSocket = 'let Y=++T,L=!1,v=A({auth:g,browser:Uw.macOS("DeepSeek Harness")'
const brokenSocket = 'let Y=++T,L=!1,H=process.env.HTTPS_PROXY??process.env.https_proxy??process.env.HTTP_PROXY??process.env.http_proxy,E=H?new JM(H):void 0,v=A({auth:g,...E?{agent:E,fetchAgent:E}:{},browser:Uw.macOS("DeepSeek Harness")'
const fixedSocket = 'let Y=++T,L=!1,H=process.env.HTTPS_PROXY??process.env.https_proxy??process.env.HTTP_PROXY??process.env.http_proxy,E=H?new __dshHttpsProxyAgent(H):void 0,v=A({auth:g,...E?{agent:E,fetchAgent:E}:{},browser:Uw.macOS("DeepSeek Harness")'
source = source.includes(brokenSocket)
  ? replaceOnce(source, brokenSocket, fixedSocket, 'broken WhatsApp proxy construction')
  : replaceOnce(source, originalSocket, fixedSocket, 'WhatsApp socket construction')
source = replaceOnce(
  source,
  'required:["path"]},output:{schema:',
  'required:["path"]},presentCall:A=>({card:"generic",kind:"edit",title:"Deliver file",locations:[{path:A.path}]}),output:{schema:',
  'return-file produced-file presentation',
)
source = replaceOnce(
  source,
  '{code:"whatsapp-operation-failed",message:"WhatsApp \\u64CD\\u4F5C\\u5931\\u8D25\\uFF0C\\u8BF7\\u7A0D\\u540E\\u91CD\\u8BD5\\u3002"}',
  '{code:"internal",message:"WhatsApp \\u65E0\\u6CD5\\u8FDE\\u63A5\\uFF0C\\u8BF7\\u68C0\\u67E5\\u7F51\\u7EDC\\u6216\\u4EE3\\u7406\\u540E\\u91CD\\u8BD5\\u3002",details:{}}',
  'WhatsApp RPC failure envelope',
)
await writeFile(runtimePath, source)
