import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, cp, realpath, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { comparableLock } from './lock-graph.mjs';
const desktop = 'dsh-plugin-desktop';
const require = createRequire(new URL('../dsh-plugin-desktop/package.json', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
function run(command, args, { cwd = process.cwd(), env = {}, capture = false } = {}) {
  const useShell = process.platform === 'win32' && command === 'corepack';
  const r = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, shell: useShell, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', windowsHide: true });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${r.status})${capture ? `\n${r.stdout}\n${r.stderr}` : ''}`);
  return r.stdout || '';
}
const yarn = (args, options) => run('corepack', ['yarn', ...args], options);
async function copyEvidence(ctx, directory) {
  await mkdir(path.join(ctx.out, 'evidence'), { recursive: true });
  try { await cp(path.join(directory, 'acceptance-evidence'), path.join(ctx.out, 'evidence', process.arch), { recursive: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export async function preflight(ctx) {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.packageManager, 'yarn@4.18.0');
  for (const file of ['yarn.lock', '.gitmodules', `${desktop}/scripts/package-win.ts`, `${desktop}/scripts/package-mac.ts`]) await readFile(file);
  for (const [file, expected] of Object.entries({
    'eng.traineddata.gz': '45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91',
    'chi_sim.traineddata.gz': 'b8a23f10c7de500891eb458a8adc9cc58ab7f242f08b7d149f5e9aea4ad5db7c',
  })) assert.equal(hash(await readFile(`vendor/dsh-attachment-formats/vendor/tessdata/${file}`)), expected, `OCR asset changed: ${file}`);
  run('node', [`${desktop}/scripts/mac-release-acceptance.mjs`, path.join(ctx.out, 'evidence', 'plan'), ctx.config.acceptanceBaseline]);
  return { blockers: [], notes: ctx.config.releaseNotes };
}
export async function install(ctx) {
  await mkdir(path.join(ctx.out, 'evidence'), { recursive: true });
  const before = await readFile('yarn.lock', 'utf8');
  // Clean hosts differ from the developer checkout even on the same OS.
  // Accept only the four tracked vendor archive hashes, never registry hashes.
  yarn(['install'], { env: { YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' } });
  const after = await readFile('yarn.lock', 'utf8');
  await writeFile(path.join(ctx.out, 'evidence', 'yarn-lock-before.txt'), before);
  await writeFile(path.join(ctx.out, 'evidence', 'yarn-lock-installed.txt'), after);
  assert(comparableLock(after) === comparableLock(before), 'Dependency graph or registry bytes changed during local archive refresh; see lock evidence');
  run('git', ['diff', '--exit-code', '--', 'vendor']);
  yarn(['install', '--immutable']);
  if (process.platform === 'win32') {
    // Windows owns the source bundle gate. Other hosts retain the committed
    // bundle as the upstream macOS workflow requires (source-map bytes differ).
    yarn(['workspace', desktop, 'build:vendor-sidebar']);
    const changed = run('git', ['diff', '--name-only', '--', 'vendor'], {capture:true}).trim().split(/\r?\n/).filter(Boolean);
    assert(changed.every(file => file.startsWith('vendor/dsh-better-sidebar/lib/')), 'Vendor rebuild changed files outside generated sidebar bundles');
    yarn(['install'], {env:{YARN_ENABLE_IMMUTABLE_INSTALLS:'false'}});
    const rebuilt = await readFile('yarn.lock','utf8');
    assert.equal(comparableLock(rebuilt), comparableLock(before), 'Vendor rebuild changed dependency graph or registry bytes');
    yarn(['install','--immutable']);
    yarn(['workspace',desktop,'verify:vendor-sidebar']);
    const generated = {};
    for (const file of changed) generated[file] = hash(await readFile(file));
    await writeFile(path.join(ctx.out,'evidence','generated-vendor.json'),JSON.stringify(generated,null,2));
  }
  await writeFile(path.join(ctx.out, 'evidence', 'dependency-locks.json'), JSON.stringify({ original: hash(before), installed: hash(await readFile('yarn.lock')) }, null, 2));
}
export async function build(ctx) {
  yarn(['check']);
  yarn(['workspace', desktop, 'verify:vendor-sidebar']);
  if (ctx.target === 'linux-x64') {
    assert.equal(process.env.GITHUB_ACTIONS,'true','Linux sandbox setup is restricted to the ephemeral CI runner');
    const sandbox=await realpath(path.join(path.dirname(require.resolve('electron/package.json')),'dist/chrome-sandbox'));
    assert(sandbox.startsWith((await realpath(ctx.root))+path.sep) && (await lstat(sandbox)).isFile(),'Unexpected Electron sandbox path');
    run('sudo',['chown','root:root',sandbox]);
    run('sudo',['chmod','4755',sandbox]);
  }
  yarn(['workspace', desktop, 'verify:webview-continuity']);
  if (ctx.target === 'windows-x64') {
    // Full check above includes every check:win-package test; vendor and
    // webview gates have also passed against the freshly installed bundles.
    yarn(['dist:win'], {env:{DSH_PACKAGE_CHECK_ALREADY_RAN:'1'}});
  } else if (ctx.target === 'macos-universal') {
    yarn(['workspace', desktop, 'dist:mac-internal'], { env: { DSH_PACKAGE_CHECK_ALREADY_RAN: '1', DSH_SKIP_INSTALLED_ACCEPTANCE: '1' } });
  } else if (ctx.target === 'linux-x64') {
    run(process.execPath, [require.resolve('electron-builder/cli.js'), '--linux', 'AppImage', 'deb', '--x64', '--publish', 'never', '--config', '../.release/linux-builder.cjs'], { cwd: path.join(ctx.root, desktop) });
  } else throw new Error(`Unsupported target: ${ctx.target}`);
}
export async function assets(ctx) {
  const dir = ctx.target === 'macos-universal' ? `${desktop}/dist/mac-internal` : `${desktop}/dist`;
  const files = await readdir(dir);
  const entries = files.filter(file => ctx.target === 'windows-x64' ? file === `Ruijie-Harness-${ctx.version}-x64-Setup.exe` : ctx.target === 'macos-universal' ? file.endsWith('.dmg') : /\.(AppImage|deb)$/.test(file));
  assert.equal(entries.length, ctx.target === 'linux-x64' ? 2 : 1, 'Missing or ambiguous package outputs');
  return entries.map(file => ({ path: `${dir}/${file}`, ...(ctx.target === 'macos-universal' ? { name: `Ruijie-Harness-${ctx.version}-macOS-universal.dmg` } : {}) }));
}
export async function verify(ctx) {
  if (ctx.target === 'windows-x64') {
    run(process.execPath, ['scripts/verify-win-installer.ts'], { cwd: path.join(ctx.root, desktop) });
    run('pwsh', ['-NoProfile', '-File', '.release/verify-windows.ps1', '-Version', ctx.version]);
  } else if (ctx.target === 'macos-universal') {
    const dir = path.join(ctx.root, desktop, 'dist/mac-internal');
    try { yarn(['workspace', desktop, 'accept:mac-installed', dir], { env: { DSH_MAC_ACCEPTANCE_BASELINE: ctx.config.acceptanceBaseline } }); }
    finally { await copyEvidence(ctx, dir); }
    await cp(path.join(dir, 'SIGNATURE-AUDIT.txt'), path.join(ctx.out, 'evidence', 'SIGNATURE-AUDIT.txt'));
  } else {
    run(process.execPath, ['.release/verify-linux.mjs']);
  }
}
export async function verifyIntel(ctx) {
  assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'x64');
  const input = path.join(ctx.out, 'intel-input');
  const manifest = JSON.parse(await readFile(path.join(input, 'macos-universal.json'), 'utf8'));
  assert.equal(manifest.sourceSha, ctx.sourceSha); assert.equal(manifest.version, ctx.version); assert.equal(manifest.toolkitSha, ctx.toolkitSha);
  for (const asset of manifest.assets) {
    assert.equal(asset.name, `Ruijie-Harness-${ctx.version}-macOS-universal.dmg`);
    const { createReadStream } = await import('node:fs'); const h = createHash('sha256');
    for await (const chunk of createReadStream(path.join(input, asset.name))) h.update(chunk);
    assert.equal(h.digest('hex'), asset.sha256);
  }
  try {
    run(process.execPath, ['scripts/verify-mac-smoke.ts', input], { cwd: path.join(ctx.root, desktop) });
    yarn(['workspace', desktop, 'accept:mac-installed', input], { env: { DSH_MAC_ACCEPTANCE_BASELINE: ctx.config.acceptanceBaseline } });
  } finally { await copyEvidence(ctx, input); }
}
