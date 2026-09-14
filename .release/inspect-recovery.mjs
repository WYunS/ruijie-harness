import assert from 'node:assert/strict';
import {appendFile, writeFile, mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const targets = ['windows-x64', 'linux-x64', 'macos-universal'];
export function validateRecovery(run, jobs, artifacts, repository, buildRun) {
  assert.equal(run.id, Number(buildRun));
  assert.equal(run.repository.full_name, repository, 'Original run belongs to another repository');
  assert.equal(run.path, '.github/workflows/release.yml', 'Only the shared release entrypoint can be recovered');
  assert.equal(run.event, 'workflow_dispatch');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'failure', 'Recovery is only for a failed original run');
  assert(jobs.some(j => j.name === 'release / prepare' && j.conclusion === 'success'));
  for (const target of targets) {
    assert(jobs.some(j => j.name.startsWith(`release / build (${target},`) && j.conclusion === 'success'), `Original ${target} job did not succeed`);
    const matches = artifacts.filter(a => a.name === `release-${target}-${buildRun}`);
    assert.equal(matches.length, 1, `Missing or ambiguous ${target} artifact`);
    assert.equal(matches[0].expired, false, 'Original artifact has expired');
  }
  const intel = jobs.find(j => j.name === 'release / Verify same Universal DMG on native Intel');
  assert.equal(intel?.conclusion, 'failure', 'Expected an Intel-only verification failure');
  assert(jobs.every(j => j.conclusion === 'success' || j === intel || (j.name === 'release / publish' && j.conclusion === 'skipped')), 'Other jobs failed; cannot recover only Intel');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repository = process.env.GITHUB_REPOSITORY;
  const buildRun = process.env.CANDIDATE_RUN;
  assert(/^\d+$/.test(buildRun));
  assert(/^[a-f0-9]{40}$/.test(process.env.CANDIDATE_SHA));
  assert(/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(process.env.CANDIDATE_VERSION));
  const get = async route => {
    const response = await fetch(`https://api.github.com/repos/${repository}${route}`, {headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'}});
    assert(response.ok, `GitHub inspection failed: HTTP ${response.status}`);
    return response.json();
  };
  const [run, jobs, artifacts] = await Promise.all([
    get(`/actions/runs/${buildRun}`), get(`/actions/runs/${buildRun}/jobs?per_page=100`), get(`/actions/runs/${buildRun}/artifacts?per_page=100`),
  ]);
  assert(jobs.total_count <= 100 && artifacts.total_count <= 100, 'Unexpected pagination; inspect the full run first');
  validateRecovery(run, jobs.jobs, artifacts.artifacts, repository, buildRun);
  await mkdir('.release-out', {recursive:true});
  await writeFile('.release-out/recovery-inspection.json', JSON.stringify({originalRun:run.id, originalRunAttempt:run.run_attempt, sourceSha:process.env.CANDIDATE_SHA, version:process.env.CANDIDATE_VERSION.replace(/^v/,''), verificationToolsSha:process.env.GITHUB_SHA, recoveryRun:process.env.GITHUB_RUN_ID, jobs:jobs.jobs.map(({id,name,conclusion})=>({id,name,conclusion})), artifacts:artifacts.artifacts.map(({id,name,expired,digest})=>({id,name,expired,digest}))},null,2));
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `Validated original run ${buildRun}: all three build/verification jobs succeeded; only Intel verification needs recovery. Source/version/toolkit/file hashes are checked again against the downloaded manifests.\n`);
}
