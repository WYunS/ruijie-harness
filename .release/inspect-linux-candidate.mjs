import assert from 'node:assert/strict';
import {readFile,stat,appendFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.argv[2];
const m=JSON.parse(await readFile(path.join(root,'linux-x64.json'),'utf8'));
assert.equal(m.target,'linux-x64');
assert(/^[a-f0-9]{40}$/.test(m.sourceSha));
assert(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(m.version));
assert.equal(m.assets.length,2);
for(const asset of m.assets){
  assert(/^[A-Za-z0-9][A-Za-z0-9._-]+\.(?:deb|AppImage)$/.test(asset.name));
  const file=path.join(root,asset.name);assert.equal((await stat(file)).size,asset.size);
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
  assert.equal(hash.digest('hex'),asset.sha256);
}
await appendFile(process.env.GITHUB_OUTPUT,`sha=${m.sourceSha}\n`);
console.log(`Candidate ${m.version} from ${m.sourceSha}; this job verifies only and cannot publish.`);
