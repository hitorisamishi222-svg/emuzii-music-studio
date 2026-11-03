import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {planPath,validate,summary} from '../scripts/music-plan.mjs';
const original=JSON.parse(fs.readFileSync(planPath,'utf8'));
const clone=()=>structuredClone(original);
const byId=(p,id)=>p.workItems.find(t=>t.id===id);
test('preserves baseline and safe policies',()=>{
  assert.equal(original.productionBaseline,'ec5b91b70829a085784a80fc9f4172daba0913e3');
  assert.match(original.purpose,/MANUAL FIRST/);
  assert.match(original.purpose,/70% \/ AI ASSIST 30%/);
  assert.doesNotThrow(()=>validate(original));
});
test('device QA held while independent work proceeds',()=>{
  const x=summary(original);
  assert.ok(x.blocked.some(t=>t.id==='MUSIC-050'));
  assert.equal(x.eligible[0].id,'MUSIC-010');
  assert.ok(x.eligible.some(t=>t.id==='MUSIC-011'));
});
test('dependency gating unlocks only eligible tasks',()=>{
  const p=clone();
  assert.deepEqual(summary(p).waiting.find(t=>t.id==='MUSIC-020').waitingOn,['MUSIC-010','MUSIC-012']);
  for(const id of ['MUSIC-010','MUSIC-012']){byId(p,id).state='done';byId(p,id).evidence=['simulated:pass']}
  assert.ok(summary(p).eligible.some(t=>t.id==='MUSIC-020'));
});
test('release and paid integrations remain blocked even after all upstream tasks pass',()=>{
  const p=clone();
  for(const id of ['MUSIC-010','MUSIC-011','MUSIC-012','MUSIC-013','MUSIC-020','MUSIC-030']){byId(p,id).state='done';byId(p,id).evidence=['simulated:pass']}
  const x=summary(p);
  for(const id of ['MUSIC-040','MUSIC-050','MUSIC-060','MUSIC-070'])assert.ok(x.blocked.some(t=>t.id===id));
});
test('missing safety and completion evidence are rejected',()=>{
  const a=clone();a.constraints.neverAutoDeploy=false;assert.throws(()=>validate(a),/neverAutoDeploy/);
  const b=clone();byId(b,'MUSIC-002').evidence=[];assert.throws(()=>validate(b),/evidence/);
  const c=clone();byId(c,'MUSIC-050').blockers=[];assert.throws(()=>validate(c),/reasons/);
});
test('unknown dependencies, cycles, duplicate ids are rejected',()=>{
  const a=clone();byId(a,'MUSIC-010').dependsOn.push('MUSIC-999');assert.throws(()=>validate(a),/Unknown/);
  const b=clone();byId(b,'MUSIC-010').dependsOn.push('MUSIC-020');assert.throws(()=>validate(b),/cycle/);
  const c=clone();c.workItems.push(structuredClone(c.workItems[0]));assert.throws(()=>validate(c),/task id/);
});
test('CLI exposes next task without executing work',()=>{
  const r=spawnSync(process.execPath,['scripts/music-plan.mjs','--next'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  assert.equal(JSON.parse(r.stdout).id,'MUSIC-010');
});
test('CLI shows independent status groups',()=>{
  const r=spawnSync(process.execPath,['scripts/music-plan.mjs','--json'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const v=JSON.parse(r.stdout);
  assert.equal(v.done.length,3);
  assert.ok(v.waiting.length>0&&v.blocked.length>0&&v.eligible.length>0);
});
