import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first < 0) {
    if (source.includes(after)) return source
    throw new Error(`file-citation compatibility patch could not find ${label}`)
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`file-citation compatibility patch found multiple ${label} targets`)
  }
  return source.slice(0, first) + after + source.slice(first + before.length)
}

/** Convert Codex-only output citations into the inline-code syntax DSH links. */
export function normalizeCodexFileCitations(text) {
  return text.replace(
    /:codex-file-citation\{[^}\r\n]*?\bpath=(['"])(.*?)\1[^}\r\n]*\}/gu,
    (_directive, _quote, path) => `\`${path}\``,
  )
}

/** Resolve exact, basename, or unique relative-subpath mentions safely. */
export function resolveProducedPath(paths, value) {
  const normalize = path => path.replaceAll('\\', '/').replace(/^\.\//u, '')
  const mention = normalize(value)
  const exact = paths.filter(path => normalize(path) === mention)
  if (exact.length === 1) return exact[0]
  if (/^(?:[a-z]:\/|\/)/iu.test(mention)) return undefined
  const suffix = `/${mention}`
  const matches = paths.filter(path => normalize(path).endsWith(suffix))
  return matches.length === 1 ? matches[0] : undefined
}

async function patchRuntime() {
  const conversationPackage = require.resolve('@deepseek-ai/dsh-client-ui-conversation/package.json')
  const conversationPath = new URL('./lib/client.js', pathToFileURL(conversationPackage))
  let conversation = await readFile(conversationPath, 'utf8')
  const helper = `\t\tfunction __dshNormalizeCodexFileCitations(text) {
\t\t\treturn text.replace(/:codex-file-citation\\{[^}\\r\\n]*?\\bpath=(['"])(.*?)\\1[^}\\r\\n]*\\}/gu, (_directive, _quote, path) => \`\\\`\${path}\\\`\`);
\t\t}
`
  conversation = conversation.replaceAll(helper, '')
  conversation = replaceOnce(
    conversation,
    '\t\t/** Reasoning block as the Think variant summary row (figma 39:28304). */\n\t\tconst AssistantMarkdown',
    `${helper}\t\t/** Reasoning block as the Think variant summary row (figma 39:28304). */\n\t\tconst AssistantMarkdown`,
    'AssistantMarkdown compatibility helper',
  )
  conversation = replaceOnce(
    conversation,
    'text: block.text,\n\t\t\t\t\t\t\tstreaming,\n\t\t\t\t\t\t\tcodeLabels,\n\t\t\t\t\t\t\tfileMentions: mentions',
    'text: __dshNormalizeCodexFileCitations(block.text),\n\t\t\t\t\t\t\tstreaming,\n\t\t\t\t\t\t\tcodeLabels,\n\t\t\t\t\t\t\tfileMentions: mentions',
    'AssistantMarkdown text normalization',
  )
  await writeFile(conversationPath, conversation)

  const deliverablesPackage = require.resolve('@deepseek-ai/dsh-client-ui-deliverables/package.json')
  const promptPath = new URL('./lib/index.js', pathToFileURL(deliverablesPackage))
  let prompt = await readFile(promptPath, 'utf8')
  const unsupportedDirectivePrompt = 'Never output :codex-file-citation or other Codex directives: this client uses Markdown inline-code file mentions instead.'
  prompt = prompt.replaceAll(` ${unsupportedDirectivePrompt}`, '')
  prompt = replaceOnce(
    prompt,
    'basename when unique among the files changed in that turn.',
    `basename when unique among the files changed in that turn. ${unsupportedDirectivePrompt}`,
    'deliverable file-reference prompt',
  )
  await writeFile(promptPath, prompt)

  const deliverablesClientPath = new URL('./lib/client.js', pathToFileURL(deliverablesPackage))
  let deliverablesClient = await readFile(deliverablesClientPath, 'utf8')
  deliverablesClient = replaceOnce(
    deliverablesClient,
    'const path = paths.includes(value) ? value : onlyPathWithBasename(paths, value);',
    'const path = onlyPathWithMention(paths, value);',
    'produced-file mention resolver call',
  )
  deliverablesClient = replaceOnce(
    deliverablesClient,
    `function onlyPathWithBasename(paths, value) {
\t\t\tconst matches = paths.filter((path) => basename(path) === value);
\t\t\treturn matches.length === 1 ? matches[0] : void 0;
\t\t}`,
    `function onlyPathWithMention(paths, value) {
\t\t\tconst normalize = (path) => path.replaceAll("\\\\", "/").replace(/^\\.\\//u, "");
\t\t\tconst mention = normalize(value);
\t\t\tconst exact = paths.filter((path) => normalize(path) === mention);
\t\t\tif (exact.length === 1) return exact[0];
\t\t\tif (/^(?:[a-z]:\\/|\\/)/iu.test(mention)) return void 0;
\t\t\tconst suffix = "/" + mention;
\t\t\tconst matches = paths.filter((path) => normalize(path).endsWith(suffix));
\t\t\treturn matches.length === 1 ? matches[0] : void 0;
\t\t}`,
    'produced-file relative mention resolver',
  )
  await writeFile(deliverablesClientPath, deliverablesClient)
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(process.argv[1]).href
if (invokedPath === import.meta.url) await patchRuntime()
