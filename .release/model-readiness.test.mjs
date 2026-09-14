import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Execute the actual acceptance function without importing its macOS launcher.
const source = readFileSync(new URL('../dsh-plugin-desktop/scripts/verify-mac-installed-app.mjs', import.meta.url), 'utf8');
const start = source.indexOf('async function inspectModelAndReasoning(');
const end = source.indexOf('\nasync function exerciseSidebar(', start);
assert(start >= 0 && end > start);
const inspect = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
  async waitUntil(check, message) {
    // Deterministic virtual polls stand in for the runner's bounded UI timeout.
    let lastError;
    for (let i = 0; i < 4; i++) {
      try { const value = await check(); if (value) return value; }
      catch (error) { lastError = error; }
    }
    throw new Error(`${message}: ${lastError?.message ?? ''}`);
  },
});
const ready = {aria:'选择模型 DeepSeek-V4-Flash low', text:'DeepSeek-V4-Flash', title:'low'};
function pageWith(states) {
  let index = 0;
  return {evaluate: async () => states[Math.min(index++, states.length - 1)]};
}
test('restart waits for the asynchronously restored model and reasoning', async () => {
  const page = pageWith([{aria:'选择模型',text:'选择模型',title:'选择模型'}, ready]);
  assert.equal(await inspect(page), ready);
});
test('a persistently missing selector still fails', async () => {
  await assert.rejects(inspect(pageWith([null])));
});
test('a persistently wrong model or reasoning still fails', async () => {
  await assert.rejects(inspect(pageWith([{...ready,aria:'选择模型 Claude low',text:'Claude'}])));
  await assert.rejects(inspect(pageWith([{...ready,aria:'选择模型 DeepSeek-V4-Flash high',title:'high'}])));
});
