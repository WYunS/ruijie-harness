/** Exercise the packaged macOS application through its visible Chromium UI. */

import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import puppeteer from 'puppeteer-core'

const PRODUCT_NAME = '锐捷 Harness'
const STARTUP_TIMEOUT_MS = 120_000

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

async function waitForWorkbench(browser, issuerOrigin) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  while (Date.now() < deadline) {
    for (const page of await browser.pages()) {
      const url = page.url()
      if (url.startsWith('http://127.0.0.1:') && !url.startsWith(issuerOrigin)) {
        const snapshot = await page.evaluate(() => ({
          title: document.title,
          url: location.href,
          bodyText: document.body?.innerText ?? '',
          width: window.innerWidth,
          height: window.innerHeight,
        }))
        if (snapshot.bodyText.trim().length > 0) return { page, snapshot }
      }
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

async function runInstalledSession({ executable, environment, evidenceDir, issuerOrigin, label }) {
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
  try {
    const browserURL = await waitForDebugger(debugPort, child, () => stderr)
    browser = await puppeteer.connect({ browserURL, defaultViewport: null })
    const { page, snapshot } = await waitForWorkbench(browser, issuerOrigin)
    if (snapshot.width < 900 || snapshot.height < 600) {
      throw new Error(`packaged workbench viewport is unexpectedly small: ${String(snapshot.width)}x${String(snapshot.height)}`)
    }
    const forbidden = ['选择视图模式', '请选择模型', 'Welcome to DeepSeek Harness']
    const unexpected = forbidden.find(value => snapshot.bodyText.includes(value))
    if (unexpected !== undefined) throw new Error(`packaged workbench exposed obsolete onboarding text: ${unexpected}`)
    await page.screenshot({ path: join(evidenceDir, `${label}.png`), fullPage: false })
    return { ...snapshot, screenshot: `${label}.png` }
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
  const root = mkdtempSync(join(tmpdir(), 'ruijie-harness-installed-acceptance-'))
  const mountPoint = join(root, 'mounted')
  const installRoot = join(root, 'Applications')
  const userData = join(root, 'user-data')
  const dshHome = join(root, 'dsh-home')
  mkdirSync(mountPoint)
  mkdirSync(installRoot)
  mkdirSync(userData)
  mkdirSync(dshHome)
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
    checks: [],
  }

  try {
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
    })
    report.checks.push({ id: 'fresh-installed-launch', status: 'passed', evidence: first })
    if (!existsSync(join(dshHome, 'profiles', 'desktop', 'settings.yaml'))) {
      throw new Error('fresh installed launch did not create the desktop profile settings')
    }
    report.checks.push({ id: 'fresh-profile-created', status: 'passed' })

    const authorizationsAfterFirstLaunch = issuer.requests.filter(value => value === 'GET /oauth/authorize').length
    if (authorizationsAfterFirstLaunch < 1) {
      throw new Error('expected OAuth authorization on first launch')
    }
    const second = await runInstalledSession({
      executable,
      environment,
      evidenceDir,
      issuerOrigin: issuer.origin,
      label: 'restart',
    })
    report.checks.push({ id: 'restart-with-persisted-profile', status: 'passed', evidence: second })
    const authorizationsAfterRestart = issuer.requests.filter(value => value === 'GET /oauth/authorize').length
    if (authorizationsAfterRestart !== authorizationsAfterFirstLaunch) {
      throw new Error('restart unexpectedly requested OAuth authorization again')
    }
    report.checks.push({ id: 'protected-login-persisted', status: 'passed' })
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
    writeFileSync(join(evidenceDir, 'ACCEPTANCE-REPORT.md'), `# macOS installed-app acceptance\n\n- DMG: \`${report.dmg}\`\n- Runner: \`${report.platform}/${report.architecture}\`\n- Status: **${report.status}**\n- Started: ${report.startedAt}\n- Finished: ${report.finishedAt}\n\n| Check | Result |\n|---|---|\n${rows}\n${report.error === undefined ? '' : `\n## Failure\n\n\`\`\`text\n${report.error}\n\`\`\`\n`}\n`)
    rmSync(root, { recursive: true, force: true })
  }
  process.stdout.write(`Installed macOS acceptance passed: ${join(evidenceDir, 'ACCEPTANCE-REPORT.md')}\n`)
}

await main().catch(cause => {
  process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
  process.exitCode = 1
})
