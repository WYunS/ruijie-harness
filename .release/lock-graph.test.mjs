import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparableLock } from './lock-graph.mjs';
const lock = `__metadata:
  version: 8

"dsh-better-sidebar@file:../vendor/dsh-better-sidebar::locator=dsh-plugin-desktop%40workspace%3Adsh-plugin-desktop":
  version: 1.0.0
  resolution: "dsh-better-sidebar@file:../vendor/dsh-better-sidebar#../vendor/dsh-better-sidebar::hash=2c0b5f&locator=dsh-plugin-desktop%40workspace%3Adsh-plugin-desktop"
  checksum: 10c0/old
  languageName: node

"electron@npm:43.4.0":
  version: 43.4.0
  resolution: "electron@npm:43.4.0"
  checksum: 10c0/trusted
`;
test('accepts only archive hashes of checked-in local vendor dependencies', () => {
  const refreshed = lock.replace('hash=2c0b5f', 'hash=d15dd8').replace('10c0/old', '10c0/new');
  assert.equal(comparableLock(lock), comparableLock(refreshed));
});
test('rejects changed registry bytes, versions and paths', () => {
  for (const changed of [lock.replace('10c0/trusted','10c0/untrusted'), lock.replaceAll('43.4.0','44.0.0'), lock.replaceAll('../vendor/dsh-better-sidebar','../elsewhere')]) {
    assert.notEqual(comparableLock(lock), comparableLock(changed));
  }
});
