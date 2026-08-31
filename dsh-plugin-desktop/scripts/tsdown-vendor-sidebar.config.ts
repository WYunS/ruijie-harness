import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sidebarRoot = resolve(desktopRoot, '..', 'vendor', 'dsh-better-sidebar')
const outputDir = resolve(sidebarRoot, 'lib')
const clsxEntry = fileURLToPath(import.meta.resolve('clsx'))
const desktopRequire = createRequire(resolve(desktopRoot, 'package.json'))
const sidebarRequire = createRequire(resolve(desktopRoot, 'node_modules', 'dsh-better-sidebar', 'package.json'))
const uuidBrowserEntry = resolve(dirname(desktopRequire.resolve('uuid/package.json')), 'dist', 'index.js')

const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
]

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

function resolveBundledDependency(source: string): string {
  // createRequire follows Node's export condition and would select uuid's
  // dist-node entry, which imports node:crypto. Lazy chunks run in the
  // renderer, so keep uuid on its browser/default export.
  if (source === 'uuid') return uuidBrowserEntry
  try {
    return sidebarRequire.resolve(source)
  } catch {
    return desktopRequire.resolve(source)
  }
}

function makeVendorResolvePlugin() {
  return {
    name: 'dsh-vendor-dependency-resolve',
    resolveId(source: string) {
      if (source.startsWith('.') || source.startsWith('/') || /^[A-Za-z]:[\\/]/.test(source)) return null
      if (source.endsWith('.css') || CLIENT_EXTERNALS.includes(source)) return null
      try {
        return resolveBundledDependency(source)
      } catch {
        return null
      }
    },
  }
}

function injectTag(pluginId: string, fileId: string, cssText: string): string {
  const tagId = `${pluginId}/${basename(fileId)}`
  return [
    `const css = ${JSON.stringify(cssText)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    `if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {`,
    '  const tag = document.createElement("style");',
    `  tag.dataset.plugin = ${JSON.stringify(pluginId)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
  ].join('\n')
}

function makeCssPlugin(pluginId: string) {
  return {
    name: 'dsh-css-inline',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.css')) return null
      const absolute = source.startsWith('.') || source.startsWith('/') || /^[A-Za-z]:[\\/]/.test(source)
        ? importer === undefined ? source : resolve(dirname(importer), source)
        : resolveBundledDependency(source)
      return CSS_VIRTUAL_PREFIX + absolute + CSS_VIRTUAL_SUFFIX
    },
    async load(this: { addWatchFile(file: string): void }, virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      if (fileId.endsWith('.module.css')) {
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap: Record<string, string> = {}
        for (const [local, value] of Object.entries(cssExports ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
          classMap[local] = value.name
        }
        return `${injectTag(pluginId, fileId, code.toString())}\nexport default ${JSON.stringify(classMap)};`
      }
      return `${injectTag(pluginId, fileId, source.toString('utf8'))}\nexport default "";`
    },
  }
}

function clientBundle(pluginId: string, entryFile: string) {
  return {
    entry: { client: resolve(sidebarRoot, 'src', 'client', 'index.tsx') },
    outDir: outputDir,
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: CLIENT_EXTERNALS,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env.MODE': JSON.stringify('production'),
      'import.meta.env': JSON.stringify({ MODE: 'production' }),
      'import.meta.resolve': 'undefined',
    },
    inputOptions: {
      resolve: {
        alias: { clsx: clsxEntry },
        conditionNames: ['browser', 'import', 'require', 'default'],
      },
    },
    noExternal: (id: string) => CLIENT_EXTERNALS.includes(id) ? undefined : true,
    plugins: [makeCssPlugin(pluginId)],
    outputOptions: {
      entryFileNames: entryFile,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pluginId)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  }
}

function clientChunk(chunk: 'editor' | 'mermaid' | 'terminal') {
  return {
    entry: { [`client-${chunk}`]: resolve(sidebarRoot, 'src', 'client', 'chunks', `${chunk}.tsx`) },
    outDir: outputDir,
    format: 'cjs',
    platform: 'browser',
    dts: false,
    // The editor and mermaid maps are larger than their already-heavy lazy
    // bundles and were never part of the shipped closure. Keep the terminal
    // map that the existing build already publishes.
    sourcemap: chunk === 'terminal',
    clean: false,
    external: CLIENT_EXTERNALS,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env.MODE': JSON.stringify('production'),
      'import.meta.env': JSON.stringify({ MODE: 'production' }),
      'import.meta.resolve': 'undefined',
    },
    inputOptions: {
      resolve: {
        alias: { clsx: clsxEntry },
        conditionNames: ['browser', 'import', 'require', 'default'],
      },
    },
    noExternal: (id: string) => CLIENT_EXTERNALS.includes(id) ? undefined : true,
    plugins: [makeCssPlugin('dsh-better-sidebar'), makeVendorResolvePlugin()],
    outputOptions: {
      entryFileNames: `client-${chunk}.js`,
      banner: `globalThis.__dshChunks__ = globalThis.__dshChunks__ || {};\nglobalThis.__dshChunks__[${JSON.stringify(chunk)}] = (require) => {`,
      footer: 'return module.exports;\n};',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  }
}

export default [
  {
    entry: {
      index: resolve(sidebarRoot, 'src', 'index.ts'),
      invariant: resolve(sidebarRoot, 'src', 'invariant.ts'),
    },
    outDir: outputDir,
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    deps: { neverBundle: ['ws', 'schemastery'] },
  },
  clientBundle('dsh-better-sidebar', 'client.js'),
  clientBundle('dsh-external/dsh-better-sidebar', 'client-registry.js'),
  clientChunk('editor'),
  clientChunk('mermaid'),
  clientChunk('terminal'),
]
