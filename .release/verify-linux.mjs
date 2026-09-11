import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile, open, chmod } from 'node:fs/promises';
import path from 'node:path';
assert.equal(process.platform, 'linux');
const root = process.cwd();
const dist = path.join(root, 'dsh-plugin-desktop/dist');
const files = await readdir(dist);
const deb = files.filter(f => f.endsWith('.deb'));
const appImage = files.filter(f => f.endsWith('.AppImage'));
assert.equal(deb.length, 1); assert.equal(appImage.length, 1);
const meta = JSON.parse(await readFile('dsh-plugin-desktop/package.json', 'utf8'));
assert.equal(execFileSync('dpkg-deb', ['-f', path.join(dist, deb[0]), 'Version'], {encoding:'utf8'}).trim(), meta.version);
assert.equal(execFileSync('dpkg-deb', ['-f', path.join(dist, deb[0]), 'Architecture'], {encoding:'utf8'}).trim(), 'amd64');
const extracted = path.join(root, '.release-out/linux-installed');
await mkdir(extracted, {recursive:true});
execFileSync('dpkg-deb', ['-x', path.join(dist, deb[0]), extracted], {stdio:'inherit'});
const imageDir = path.join(root,'.release-out/linux-appimage');
await mkdir(imageDir,{recursive:true});
const image = path.join(dist,appImage[0]); await chmod(image,0o755);
execFileSync(image,['--appimage-extract'],{cwd:imageDir,stdio:'ignore'});
const results = [];
for (const [format,executable] of [
  ['deb',path.join(extracted, 'opt/锐捷 Harness/ruijie-harness')],
  ['AppImage',path.join(imageDir,'squashfs-root/ruijie-harness')],
]) {
  const descriptor=await open(executable,'r'); const header=Buffer.alloc(20);
  try { await descriptor.read(header,0,20,0); } finally { await descriptor.close(); }
  assert.equal(header.subarray(0,4).toString('hex'), '7f454c46');
  assert.equal(header.readUInt16LE(18),62,'Expected x86-64 ELF');
  const resources = path.join(path.dirname(executable),'resources/app.asar.unpacked');
  // Both root and sidebar terminals must load their actual packaged native addon.
  const script=path.join(root,'.release-out/linux-native-probe.cjs');
  await writeFile(script, `const {createRequire}=require('node:module'); const path=require('node:path'); const root=${JSON.stringify(resources)};
async function probe(base) { const req=createRequire(path.join(root,base,'package.json')); const pty=req('node-pty');
await new Promise((resolve,reject)=>{const t=pty.spawn('/bin/sh',['-c','printf release-kit-terminal-ok'],{name:'xterm',cols:80,rows:24,cwd:process.env.HOME,env:process.env});let out='';const timer=setTimeout(()=>{t.kill();reject(new Error('terminal timeout'))},15000);t.onData(x=>out+=x);t.onExit(()=>{clearTimeout(timer);out.includes('release-kit-terminal-ok')?resolve():reject(new Error(out))});}); console.log(base+' terminal passed'); }
(async()=>{await probe('.');await probe('node_modules/dsh-better-sidebar');})().catch(e=>{console.error(e);process.exitCode=1});`);
  execFileSync(executable,[script],{stdio:'inherit',timeout:45000,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
  results.push({format,architecture:'amd64',extraction:'passed',packagedRootAndSidebarTerminal:'passed'});
}
await mkdir(path.join(root,'.release-out/evidence'),{recursive:true});
await writeFile(path.join(root, '.release-out/evidence/linux.json'), JSON.stringify({version:meta.version,packages:results,guiLogin:'not performed',upgrade:'not performed'},null,2));
