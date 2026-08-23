/** Exercise the packaged macOS application through its visible Chromium UI. */

import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { apply as applyOfficeTools } from 'dsh-office-tools'
import puppeteer from 'puppeteer-core'
import { parse } from 'yaml'
import {
  installedSettingsPath,
  isInstalledWorkbenchReady,
} from './mac-installed-acceptance.ts'
import { generateMacReleaseAcceptancePlan } from './mac-release-acceptance.mjs'

const PRODUCT_NAME = '锐捷 Harness'
const STARTUP_TIMEOUT_MS = 120_000
const UI_TIMEOUT_MS = 45_000

const delay = async milliseconds => await new Promise(resolveDelay => { setTimeout(resolveDelay, milliseconds) })

async function waitUntil(check, message, timeout = UI_TIMEOUT_MS) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (cause) {
      lastError = cause
    }
    await delay(250)
  }
  throw new Error(`${message}${lastError instanceof Error ? `: ${lastError.message}` : ''}`)
}

async function clickNamed(page, names, options = {}) {
  const clicked = await page.evaluate((candidateNames, settings) => {
    const normalizedNames = candidateNames.map(value => value.trim().toLocaleLowerCase())
    const candidates = [...document.querySelectorAll(settings.selector ?? 'button,[role="menuitem"],[role="menuitemradio"],[role="option"],[tabindex="0"]')]
    const visible = element => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
    }
    const element = candidates.find((candidate) => {
      if (!visible(candidate)) return false
      const values = [candidate.getAttribute('aria-label'), candidate.getAttribute('title'), candidate.textContent]
        .filter(value => value !== null)
        .map(value => value.trim().toLocaleLowerCase())
      return values.some(value => settings.prefix === true
        ? normalizedNames.some(name => value.startsWith(name))
        : normalizedNames.includes(value))
    })
    if (!(element instanceof HTMLElement)) return false
    element.click()
    return true
  }, names, options)
  if (!clicked) throw new Error(`could not find visible control: ${names.join(' / ')}`)
}

async function waitForNamed(page, names, options = {}) {
  return await waitUntil(async () => await page.evaluate((candidateNames, settings) => {
    const normalizedNames = candidateNames.map(value => value.trim().toLocaleLowerCase())
    return [...document.querySelectorAll(settings.selector ?? 'button,[role="menuitem"],[role="menuitemradio"],[role="option"],[tabindex="0"]')]
      .some((candidate) => {
        const style = getComputedStyle(candidate)
        const rect = candidate.getBoundingClientRect()
        if (style.visibility === 'hidden' || style.display === 'none' || rect.width === 0 || rect.height === 0) return false
        const values = [candidate.getAttribute('aria-label'), candidate.getAttribute('title'), candidate.textContent]
          .filter(value => value !== null)
          .map(value => value.trim().toLocaleLowerCase())
        return values.some(value => settings.prefix === true
          ? normalizedNames.some(name => value.startsWith(name))
          : normalizedNames.includes(value))
      })
  }, names, options), `timed out waiting for visible control: ${names.join(' / ')}`)
}

async function screenshot(page, evidenceDir, name) {
  await page.screenshot({ path: join(evidenceDir, `${name}.png`), fullPage: false })
  return `${name}.png`
}

async function createOfficeFixtures(workspace) {
  const tools = new Map()
  applyOfficeTools({
    tools: {
      register(tool) {
        tools.set(tool.name, tool)
        return () => { tools.delete(tool.name) }
      },
    },
    effect(effect) { return effect() },
  })
  const execute = async (name, args) => {
    const tool = tools.get(name)
    if (tool === undefined) throw new Error(`acceptance fixture tool is missing: ${name}`)
    await tool.execute(args, {
      agent: { session: { header: { cwd: workspace } } },
      signal: new AbortController().signal,
    })
  }
  await execute('word_create', {
    path: 'sample.docx', title: 'Ruijie acceptance Word', paragraphs: ['MAC_ACCEPTANCE_WORD_208'],
  })
  await execute('excel_create', {
    path: 'sample.xlsx', sheets: [{ name: 'Acceptance', rows: [['marker', 'value'], ['MAC_ACCEPTANCE_EXCEL_208', 208]] }],
  })
  await execute('ppt_create', {
    path: 'sample.pptx', title: 'Ruijie acceptance PowerPoint', slides: [{ title: 'Acceptance', bullets: ['MAC_ACCEPTANCE_PPT_208'] }],
  })
}

function minimalPdf(text) {
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 420 180]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${String(Buffer.byteLength(`BT /F1 18 Tf 30 90 Td (${text}) Tj ET`))}>>stream\nBT /F1 18 Tf 30 90 Td (${text}) Tj ET\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ]
  let source = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source))
    source += `${String(index + 1)} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(source)
  source += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`
  source += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  source += `trailer<</Size ${String(objects.length + 1)}/Root 1 0 R>>\nstartxref\n${String(xref)}\n%%EOF\n`
  return Buffer.from(source)
}

async function prepareAcceptanceWorkspace(dshHome, root) {
  const workspace = join(root, 'Acceptance Workspace')
  mkdirSync(workspace)
  await createOfficeFixtures(workspace)
  writeFileSync(join(workspace, 'sample.pdf'), minimalPdf('MAC_ACCEPTANCE_PDF_208'))
  writeFileSync(join(workspace, 'sample.png'), Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxMDAwAAAHgECAZ5u3QAAAABJRU5ErkJggg==',
    'base64',
  ))
  writeFileSync(join(workspace, 'readme.txt'), 'MAC_ACCEPTANCE_TEXT_208\n')
  const workspaceId = '00000000-0000-4000-8000-000000000208'
  const now = new Date().toISOString()
  const storageDir = join(dshHome, 'storages')
  mkdirSync(storageDir, { recursive: true })
  writeFileSync(join(storageDir, 'workspace.json'), `${JSON.stringify({
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: [workspaceId], archivedSessionIds: [] },
    tables: {
      workspaces: {
        [workspaceId]: { path: workspace, title: 'Acceptance Workspace', sessionIds: [], createdAt: now, updatedAt: now },
      },
    },
  }, null, 2)}\n`)
  return { workspace, workspaceId }
}

async function chooseAcceptanceWorkspace(page) {
  await waitForNamed(page, ['Choose workspace', '选择工作区'], { prefix: true, selector: 'button,textarea,[role="button"]' })
  await clickNamed(page, ['Choose workspace', '选择工作区'], { prefix: true, selector: 'button,textarea,[role="button"]' })
  await waitForNamed(page, ['Acceptance Workspace'])
  await clickNamed(page, ['Acceptance Workspace'])
  await waitUntil(async () => await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(button => {
      const label = button.getAttribute('aria-label') ?? ''
      return label.startsWith('Select model') || label.startsWith('选择模型')
    })), 'workspace selection did not create a session with a model selector')
}

async function inspectModelAndReasoning(page) {
  const summary = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => {
      const label = candidate.getAttribute('aria-label') ?? ''
      return label.startsWith('Select model') || label.startsWith('选择模型')
    })
    if (!(button instanceof HTMLButtonElement)) return null
    return { aria: button.getAttribute('aria-label') ?? '', text: button.innerText, title: button.title }
  })
  if (summary === null) throw new Error('model selector is missing after workspace selection')
  const rendered = `${summary.aria} ${summary.text} ${summary.title}`.toLocaleLowerCase()
  if (!rendered.includes('deepseek-v4-flash')) throw new Error(`default model is not visible: ${JSON.stringify(summary)}`)
  if (!rendered.includes('low')) throw new Error(`default reasoning strength is not visible: ${JSON.stringify(summary)}`)
  return summary
}

async function exerciseSidebar(page) {
  await waitForNamed(page, ['Collapse sidebar', '折叠侧边栏'])
  await clickNamed(page, ['Collapse sidebar', '折叠侧边栏'])
  await waitForNamed(page, ['Expand sidebar', '展开侧边栏'])
  await clickNamed(page, ['Expand sidebar', '展开侧边栏'])
  await waitForNamed(page, ['Collapse sidebar', '折叠侧边栏'])

  const closed = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[title="Files"],[title="文件"]')]
    for (const tabTitle of tabs) {
      const tab = tabTitle.closest('div')
      const close = tab?.querySelector('button[aria-label="Close"],button[aria-label="关闭"]')
      if (close instanceof HTMLElement) {
        close.click()
        return true
      }
    }
    return false
  })
  if (!closed) throw new Error('could not close the Files sidebar tab through its visible close button')
  await waitForNamed(page, ['New tab', '新建标签页'])
  await clickNamed(page, ['New tab', '新建标签页'])
  await waitForNamed(page, ['Explorer', '资源管理器'])
  await clickNamed(page, ['Explorer', '资源管理器'])
  await waitUntil(async () => await page.evaluate(() =>
    [...document.querySelectorAll('[title]')].some(element => ['Files', '文件'].includes(element.getAttribute('title') ?? ''))
  ), 'Files sidebar tab did not reopen')
}

async function openWorkspaceFile(page, absolutePath, filename, previewSelector) {
  await waitUntil(async () => await page.evaluate(path => {
    const element = document.querySelector(`[title="${CSS.escape(path)}"]`)
    if (!(element instanceof HTMLElement)) return false
    element.click()
    return true
  }, absolutePath), `workspace file was not visible in Files: ${filename}`)
  await waitUntil(async () => await page.evaluate(({ name, selector }) =>
    [...document.querySelectorAll('[title]')].some(element => element.getAttribute('title') === name)
    && document.querySelector(selector) !== null
    && !/(load failed|failed to load|加载失败|无法预览)/iu.test(document.body?.innerText ?? ''),
  { name: filename, selector: previewSelector }),
  `file did not open successfully: ${filename}`)
}

async function exerciseDocumentViewers(page, workspace) {
  const fixtures = [
    ['sample.docx', '[class*="editorDocx"]'],
    ['sample.xlsx', '[class*="editorXlsx"]'],
    ['sample.pptx', '[class*="editorPptx"]'],
    ['sample.pdf', 'iframe[title="sample.pdf"]'],
    ['sample.png', 'img[alt="sample.png"]'],
  ]
  for (const [filename, previewSelector] of fixtures) {
    await openWorkspaceFile(page, join(workspace, filename), filename, previewSelector)
    await delay(500)
  }
}

async function exerciseBrowser(browser, page) {
  await clickNamed(page, ['New tab', '新建标签页'])
  await waitForNamed(page, ['Browser', '浏览器'])
  await clickNamed(page, ['Browser', '浏览器'])
  const address = await waitUntil(async () => await page.$('input[placeholder="Search or enter address"],input[placeholder="搜索或输入网址"]'),
    'built-in browser address bar did not appear')
  await address.click({ clickCount: 3 })
  await address.type('https://example.com/')
  await clickNamed(page, ['Go', '前往'])
  const guestTarget = await browser.waitForTarget(target => target.url().startsWith('https://example.com/'), { timeout: UI_TIMEOUT_MS })
  const guest = await guestTarget.page()
  if (guest === null) throw new Error('built-in browser guest page was not inspectable')
  await waitUntil(async () => {
    const text = await guest.evaluate(() => document.body?.innerText ?? '')
    if (/ERR_SSL|ERR_CERT|This site can.t be reached|无法访问此网站/iu.test(text)) {
      throw new Error(`built-in browser reached an error page: ${text.slice(0, 300)}`)
    }
    return text.includes('Example Domain')
  }, 'built-in browser did not load the HTTPS acceptance page')
}

async function switchLanguageToChinese(page) {
  await clickNamed(page, ['Settings', '设置'])
  await waitUntil(async () => await page.evaluate(() => document.querySelector('[role="dialog"]') !== null), 'settings dialog did not open')
  await waitForNamed(page, ['English', '中文'], { selector: 'button' })
  const current = await page.evaluate(() => document.documentElement.lang)
  if (current.toLocaleLowerCase().startsWith('zh')) return 'zh'
  await clickNamed(page, ['English'], { selector: 'button' })
  await waitForNamed(page, ['中文'])
  await clickNamed(page, ['中文'])
  await waitUntil(async () => await page.evaluate(() => document.documentElement.lang.toLocaleLowerCase().startsWith('zh')),
    'language did not switch to Chinese through Settings')
  return 'zh'
}

async function exerciseFirstLaunch({ browser, page, workspace, evidenceDir }) {
  await chooseAcceptanceWorkspace(page)
  const model = await inspectModelAndReasoning(page)
  await exerciseSidebar(page)
  await exerciseDocumentViewers(page, workspace)
  await exerciseBrowser(browser, page)
  const language = await switchLanguageToChinese(page)
  await screenshot(page, evidenceDir, 'first-launch-exercised')
  return { model, language }
}

async function verifyRestartedExperience({ page, evidenceDir }) {
  await waitUntil(async () => await page.evaluate(() => document.documentElement.lang.toLocaleLowerCase().startsWith('zh')),
    'persisted Chinese language was not restored after restart')
  await waitUntil(async () => await page.evaluate(() => document.body?.innerText.includes('Acceptance Workspace') === true),
    'workspace/session context was not restored after restart')
  const model = await inspectModelAndReasoning(page)
  await waitForNamed(page, ['折叠侧边栏', '展开侧边栏'])
  await screenshot(page, evidenceDir, 'restart-persisted-ui')
  return { language: 'zh', model }
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout || String(result.status)}`)
  }
}

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen)
      const address = server.address()
      if (address === null || typeof address === 'string') rejectListen(new Error('server has no TCP address'))
      else resolveListen(address.port)
    })
  })
}

async function reservePort() {
  const server = createServer()
  const port = await listen(server)
  await new Promise(resolveClose => { server.close(resolveClose) })
  return port
}

function unsignedJwt(payload) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`
}

async function body(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function startMockIssuer() {
  const requests = []
  let origin = ''
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', origin)
    requests.push(`${request.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname === '/oauth/authorize') {
      const redirect = new URL(url.searchParams.get('redirect_uri') ?? '')
      redirect.searchParams.set('code', 'mac-installed-acceptance-code')
      redirect.searchParams.set('state', url.searchParams.get('state') ?? '')
      try {
        const callback = await fetch(redirect)
        await callback.text()
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end('<!doctype html><meta charset="utf-8"><title>Harness acceptance authorization complete</title>')
      } catch (cause) {
        response.writeHead(500).end(cause instanceof Error ? cause.message : String(cause))
      }
      return
    }
    if (url.pathname === '/oauth/token') {
      await body(request)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        access_token: unsignedJwt({
          exp: Math.floor(Date.now() / 1000) + 3600,
          sub: 'mac-acceptance-user',
          name: 'Mac Acceptance',
          email: 'mac-acceptance@example.invalid',
        }),
        refresh_token: 'mac-acceptance-refresh-token',
      }))
      return
    }
    if (url.pathname === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        object: 'list',
        data: [{ id: 'deepseek-v4-flash', object: 'model', owned_by: 'ruijie' }],
      }))
      return
    }
    if (url.pathname === '/v1/dashboard/billing/usage') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"total_usage":0}')
      return
    }
    if (url.pathname === '/v1/dashboard/billing/subscription') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"hard_limit_usd":100}')
      return
    }
    if (url.pathname === '/v1/chat/completions') {
      await body(request)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        id: 'mac-acceptance-chat',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'deepseek-v4-flash',
        choices: [{ index: 0, message: { role: 'assistant', content: 'mac acceptance reply' }, finish_reason: 'stop' }],
      }))
      return
    }
    response.writeHead(404).end('Not Found')
  })
  const port = await listen(server)
  origin = `http://127.0.0.1:${String(port)}`
  return {
    origin,
    requests,
    close: async () => await new Promise(resolveClose => { server.close(resolveClose) }),
  }
}

async function waitForDebugger(port, child, stderr) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  const endpoint = `http://127.0.0.1:${String(port)}`
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`packaged app exited before UI startup (${String(child.exitCode)}): ${stderr()}`)
    try {
      const response = await fetch(`${endpoint}/json/version`)
      if (response.ok) return endpoint
    } catch {}
    await new Promise(resolveWait => { setTimeout(resolveWait, 250) })
  }
  throw new Error(`timed out waiting for packaged app DevTools endpoint: ${stderr()}`)
}

async function waitForWorkbench(browser, issuerOrigin, onObservation) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  while (Date.now() < deadline) {
    for (const page of await browser.pages()) {
      try {
        const snapshot = await page.evaluate(() => ({
          title: document.title,
          url: location.href,
          bodyText: document.body?.innerText ?? '',
          width: window.innerWidth,
          height: window.innerHeight,
        }))
        onObservation(page, snapshot)
        if (isInstalledWorkbenchReady(snapshot, issuerOrigin)) return { page, snapshot }
      } catch {}
    }
    await new Promise(resolveWait => { setTimeout(resolveWait, 500) })
  }
  throw new Error('timed out waiting for the packaged workbench UI')
}

async function stopApplication(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = await Promise.race([
    new Promise(resolveExit => { child.once('exit', () => { resolveExit(true) }) }),
    new Promise(resolveTimeout => { setTimeout(() => { resolveTimeout(false) }, 15_000) }),
  ])
  if (!exited && child.exitCode === null) child.kill('SIGKILL')
}

async function runInstalledSession({ executable, environment, evidenceDir, issuerOrigin, label, interact }) {
  const debugPort = await reservePort()
  let stderr = ''
  let stdout = ''
  const child = spawn(executable, [`--remote-debugging-port=${String(debugPort)}`], {
    cwd: environment.DSH_HOME,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', chunk => { stdout += String(chunk) })
  child.stderr.on('data', chunk => { stderr += String(chunk) })
  let browser
  let lastPage
  let lastSnapshot
  try {
    const browserURL = await waitForDebugger(debugPort, child, () => stderr)
    browser = await puppeteer.connect({ browserURL, defaultViewport: null })
    const { page, snapshot } = await waitForWorkbench(browser, issuerOrigin, (observedPage, observedSnapshot) => {
      lastPage = observedPage
      lastSnapshot = observedSnapshot
    })
    if (snapshot.width < 900 || snapshot.height < 600) {
      throw new Error(`packaged workbench viewport is unexpectedly small: ${String(snapshot.width)}x${String(snapshot.height)}`)
    }
    const forbidden = ['选择视图模式', '请选择模型', 'Welcome to DeepSeek Harness']
    const unexpected = forbidden.find(value => snapshot.bodyText.includes(value))
    if (unexpected !== undefined) throw new Error(`packaged workbench exposed obsolete onboarding text: ${unexpected}`)
    await page.screenshot({ path: join(evidenceDir, `${label}.png`), fullPage: false })
    const interaction = interact === undefined ? undefined : await interact({ browser, page })
    return { ...snapshot, screenshot: `${label}.png`, interaction }
  } catch (cause) {
    if (lastSnapshot !== undefined) {
      writeFileSync(join(evidenceDir, `${label}-failure-snapshot.json`), `${JSON.stringify(lastSnapshot, null, 2)}\n`)
    }
    if (lastPage !== undefined) {
      try {
        await lastPage.screenshot({ path: join(evidenceDir, `${label}-failure.png`), fullPage: false })
      } catch {}
    }
    throw cause
  } finally {
    await browser?.disconnect()
    await stopApplication(child)
    writeFileSync(join(evidenceDir, `${label}.stdout.log`), stdout)
    writeFileSync(join(evidenceDir, `${label}.stderr.log`), stderr)
  }
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('installed macOS acceptance must run on macOS')
  const distDir = resolve(process.argv[2] ?? 'dist/mac-internal')
  const dmgs = readdirSync(distDir)
    .filter(name => name.endsWith('.dmg'))
    .map(name => join(distDir, name))
    .filter(path => statSync(path).isFile())
  if (dmgs.length !== 1) throw new Error(`installed macOS acceptance requires exactly one DMG; found ${String(dmgs.length)}`)

  const evidenceDir = join(distDir, 'acceptance-evidence')
  rmSync(evidenceDir, { recursive: true, force: true })
  mkdirSync(evidenceDir, { recursive: true })
  const desktopRoot = resolve(import.meta.dirname, '..')
  const dynamicAcceptance = generateMacReleaseAcceptancePlan({
    repoRoot: resolve(desktopRoot, '..'),
    evidenceDir,
    baseline: process.env.DSH_MAC_ACCEPTANCE_BASELINE,
  })
  const root = mkdtempSync(join(tmpdir(), 'ruijie-harness-installed-acceptance-'))
  const mountPoint = join(root, 'mounted')
  const installRoot = join(root, 'Applications')
  const userData = join(root, 'user-data')
  const dshHome = join(root, 'dsh-home')
  mkdirSync(mountPoint)
  mkdirSync(installRoot)
  mkdirSync(userData)
  mkdirSync(dshHome)
  let acceptanceWorkspace
  const installedApp = join(installRoot, `${PRODUCT_NAME}.app`)
  let mounted = false
  let issuer
  const report = {
    product: PRODUCT_NAME,
    dmg: basename(dmgs[0]),
    platform: process.platform,
    architecture: process.arch,
    startedAt: new Date().toISOString(),
    status: 'failed',
    acceptancePlan: dynamicAcceptance,
    manualRequired: dynamicAcceptance.plan.filter(item => item.mode === 'manual-required'),
    checks: [],
  }

  try {
    const blockingPlanItems = dynamicAcceptance.plan.filter(item => item.mode === 'manual-blocking')
    if (blockingPlanItems.length > 0) {
      throw new Error(`dynamic acceptance plan contains unmapped runtime changes: ${blockingPlanItems
        .flatMap(item => item.changedFiles ?? []).join(', ')}`)
    }
    report.checks.push({
      id: 'dynamic-release-plan',
      status: 'passed',
      evidence: { baseline: dynamicAcceptance.baseline, changedFiles: dynamicAcceptance.changedFiles },
    })
    acceptanceWorkspace = await prepareAcceptanceWorkspace(dshHome, root)
    report.checks.push({ id: 'acceptance-fixtures', status: 'passed', evidence: acceptanceWorkspace.workspace })
    run('hdiutil', ['attach', dmgs[0], '-mountpoint', mountPoint, '-nobrowse', '-readonly'])
    mounted = true
    const mountedApp = join(mountPoint, `${PRODUCT_NAME}.app`)
    if (!existsSync(mountedApp)) throw new Error(`mounted DMG is missing ${mountedApp}`)
    run('ditto', [mountedApp, installedApp])
    report.checks.push({ id: 'install', status: 'passed', evidence: installedApp })
    run('hdiutil', ['detach', mountPoint])
    mounted = false

    issuer = await startMockIssuer()
    const callbackPort = await reservePort()
    const environment = {
      ...process.env,
      DSH_HOME: dshHome,
      DSH_TELEMETRY_DISABLED: '1',
      RUIJIE_DSH_USER_DATA_DIR: userData,
      RUIJIE_DSH_OAUTH_ISSUER: issuer.origin,
      RUIJIE_DSH_OAUTH_CALLBACK_PORT: String(callbackPort),
      ELECTRON_ENABLE_LOGGING: '1',
    }
    const executable = join(installedApp, 'Contents', 'MacOS', PRODUCT_NAME)
    const first = await runInstalledSession({
      executable,
      environment,
      evidenceDir,
      issuerOrigin: issuer.origin,
      label: 'first-launch',
      interact: async ({ browser, page }) => await exerciseFirstLaunch({
        browser,
        page,
        workspace: acceptanceWorkspace.workspace,
        evidenceDir,
      }),
    })
    report.checks.push({ id: 'fresh-installed-launch', status: 'passed', evidence: first })
    report.checks.push({ id: 'install-and-first-launch', status: 'passed', evidence: first.screenshot })
    report.checks.push({ id: 'onboarding-absent', status: 'passed', evidence: first.screenshot })
    report.checks.push({ id: 'workspace-and-session', status: 'passed', evidence: 'first-launch-exercised.png' })
    report.checks.push({ id: 'model-and-reasoning', status: 'passed', evidence: first.interaction?.model })
    report.checks.push({ id: 'sidebar-controls', status: 'passed', evidence: 'first-launch-exercised.png' })
    report.checks.push({ id: 'office-pdf-image', status: 'passed', evidence: 'first-launch-exercised.png' })
    report.checks.push({ id: 'browser-navigation', status: 'passed', evidence: 'https://example.com/' })
    const settingsPath = installedSettingsPath(dshHome)
    if (!existsSync(settingsPath)) {
      throw new Error(`fresh installed launch did not create settings at ${settingsPath}`)
    }
    const settings = parse(readFileSync(settingsPath, 'utf8'))
    if (settings?.locale?.preference !== 'zh') {
      throw new Error(`language preference was not persisted to ${settingsPath}`)
    }
    report.checks.push({ id: 'fresh-profile-created', status: 'passed', evidence: settingsPath })
    report.checks.push({ id: 'language-persistence', status: 'passed', evidence: settings.locale })

    const authorizationsAfterFirstLaunch = issuer.requests.filter(value => value === 'GET /oauth/authorize').length
    if (authorizationsAfterFirstLaunch < 1) {
      throw new Error('expected OAuth authorization on first launch')
    }
    report.checks.push({ id: 'protected-login', status: 'passed' })
    const second = await runInstalledSession({
      executable,
      environment,
      evidenceDir,
      issuerOrigin: issuer.origin,
      label: 'restart',
      interact: async ({ page }) => await verifyRestartedExperience({ page, evidenceDir }),
    })
    report.checks.push({ id: 'restart-with-persisted-profile', status: 'passed', evidence: second })
    const authorizationsAfterRestart = issuer.requests.filter(value => value === 'GET /oauth/authorize').length
    if (authorizationsAfterRestart !== authorizationsAfterFirstLaunch) {
      throw new Error('restart unexpectedly requested OAuth authorization again')
    }
    report.checks.push({ id: 'protected-login-persisted', status: 'passed' })
    report.checks.push({ id: 'restart-persistence', status: 'passed', evidence: second.interaction })
    report.status = 'passed'
  } catch (cause) {
    report.error = cause instanceof Error ? cause.stack ?? cause.message : String(cause)
    throw cause
  } finally {
    report.finishedAt = new Date().toISOString()
    if (issuer !== undefined) await issuer.close()
    if (mounted) {
      try { run('hdiutil', ['detach', mountPoint, '-force']) } catch (cause) {
        appendFileSync(join(evidenceDir, 'cleanup-errors.log'), `${cause instanceof Error ? cause.stack : String(cause)}\n`)
      }
    }
    writeFileSync(join(evidenceDir, 'acceptance-report.json'), `${JSON.stringify(report, null, 2)}\n`)
    const rows = report.checks.map(check => `| ${check.id} | ${check.status} |`).join('\n')
    const manualRows = report.manualRequired.map(check => `| ${check.id} | ${check.title} | pending |`).join('\n')
    writeFileSync(join(evidenceDir, 'ACCEPTANCE-REPORT.md'), `# macOS installed-app acceptance\n\n- DMG: \`${report.dmg}\`\n- Runner: \`${report.platform}/${report.architecture}\`\n- Automated status: **${report.status}**\n- Started: ${report.startedAt}\n- Finished: ${report.finishedAt}\n\n| Automated check | Result |\n|---|---|\n${rows}\n\n## Required human checks\n\nThese remain pending even when every automated check passes.\n\n| Check | Behavior | Result |\n|---|---|---|\n${manualRows}\n${report.error === undefined ? '' : `\n## Failure\n\n\`\`\`text\n${report.error}\n\`\`\`\n`}\n`)
    rmSync(root, { recursive: true, force: true })
  }
  process.stdout.write(`Installed macOS acceptance passed: ${join(evidenceDir, 'ACCEPTANCE-REPORT.md')}\n`)
}

await main().catch(cause => {
  process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
  process.exitCode = 1
})
