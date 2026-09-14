import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecovery} from './inspect-recovery.mjs';
const repository='rj-liukaiwen/ruijie-harness';
const run={id:123,repository:{full_name:repository},path:'.github/workflows/release.yml',event:'workflow_dispatch',status:'completed',conclusion:'failure'};
const jobs=[{name:'release / prepare',conclusion:'success'},...['windows-x64','linux-x64','macos-universal'].map(t=>({name:`release / build (${t}, runner)`,conclusion:'success'})),{name:'release / Verify same Universal DMG on native Intel',conclusion:'failure'},{name:'release / publish',conclusion:'skipped'}];
const artifacts=['windows-x64','linux-x64','macos-universal'].map(t=>({name:`release-${t}-123`,expired:false}));
test('permits only a complete three-platform build with Intel-only failure',()=>validateRecovery(run,jobs,artifacts,repository,'123'));
test('rejects missing, expired, or ambiguous artifacts',()=>{
  assert.throws(()=>validateRecovery(run,jobs,artifacts.slice(1),repository,'123'));
  assert.throws(()=>validateRecovery(run,jobs,[{...artifacts[0],expired:true},...artifacts.slice(1)],repository,'123'));
  assert.throws(()=>validateRecovery(run,jobs,[...artifacts,artifacts[0]],repository,'123'));
});
test('rejects foreign runs, wrong workflows and incomplete platform verification',()=>{
  assert.throws(()=>validateRecovery({...run,repository:{full_name:'other/repo'}},jobs,artifacts,repository,'123'));
  assert.throws(()=>validateRecovery({...run,path:'.github/workflows/ci.yml'},jobs,artifacts,repository,'123'));
  assert.throws(()=>validateRecovery(run,jobs.map(j=>j.name.includes('linux-x64')?{...j,conclusion:'failure'}:j),artifacts,repository,'123'));
  assert.throws(()=>validateRecovery(run,jobs.map(j=>j.name.includes('Intel')?{...j,conclusion:'success'}:j),artifacts,repository,'123'));
});
