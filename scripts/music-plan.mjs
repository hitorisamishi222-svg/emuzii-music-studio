import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const planPath=path.join(root,'planning/music-roadmap-v1.json');
export function validate(p) {
  if(p.schema!=='asahi-music-roadmap/v1')throw Error('Unsupported schema');
  if(!p.repository||!p.developmentBranch||!p.productionBaseline)throw Error('Missing protected baseline');
  const policies=['protectProduction','protectUserAudioAndSongIdentity','neverAutoDeploy','noNewProjects','noPaidApiWithoutApproval','allowIndependentTasksWhileDeviceTestingIsHeld','manualApprovalRequiredForRelease'];
  for(const k of policies)if(p.constraints?.[k]!==true)throw Error('Unsafe policy: '+k);
  if(!Array.isArray(p.workItems)||!p.workItems.length)throw Error('Missing tasks');
  const seen=new Set();
  for(const t of p.workItems) {
    if(!/^MUSIC-\d{3}$/.test(t.id)||seen.has(t.id))throw Error('Invalid task id: '+t.id);
    seen.add(t.id);
    if(!['done','todo','blocked'].includes(t.state))throw Error('Invalid state: '+t.id);
    if(!['read-only','development-ci','external-integration','human-device','approved-external','human-approval'].includes(t.execution))throw Error('Invalid execution: '+t.id);
    if(!Number.isInteger(t.priority)||t.priority<0||t.priority>100)throw Error('Invalid priority: '+t.id);
    if(!Array.isArray(t.dependsOn)||!Array.isArray(t.blockers)||!Array.isArray(t.acceptance)||!t.acceptance.length||!Array.isArray(t.evidence))throw Error('Missing task fields: '+t.id);
    if(t.state==='done'&&!t.evidence.length)throw Error('Missing completion evidence: '+t.id);
    if(t.state==='blocked'&&!t.blockers.length)throw Error('Missing blocked reasons: '+t.id);
    if(t.state==='todo'&&t.blockers.length)throw Error('Todo has blockers: '+t.id);
    if(t.execution==='human-approval'&&t.state!=='blocked')throw Error('Release approval bypass: '+t.id);
  }
  const map=new Map(p.workItems.map(t=>[t.id,t]));
  for(const t of p.workItems) {
    if(new Set(t.dependsOn).size!==t.dependsOn.length)throw Error('Duplicate dependency: '+t.id);
    for(const d of t.dependsOn)if(!map.has(d)||d===t.id)throw Error('Unknown/self dependency: '+t.id+' -> '+d);
    if(t.state==='done'&&t.dependsOn.some(d=>map.get(d).state!=='done'))throw Error('Done despite pending dependency: '+t.id);
  }
  const done=new Set(),stack=new Set();
  function visit(id){if(stack.has(id))throw Error('Dependency cycle: '+id);if(done.has(id))return;stack.add(id);for(const d of map.get(id).dependsOn)visit(d);stack.delete(id);done.add(id)}
  for(const id of map.keys())visit(id);
  return p;
}
export function summary(p) {
  validate(p);
  const byId=new Map(p.workItems.map(t=>[t.id,t]));
  const task=p.workItems.map(t=>{const waitingOn=t.dependsOn.filter(d=>byId.get(d).state!=='done');return {...t,waitingOn,computedState:t.state==='done'?'done':t.state==='blocked'?'blocked':waitingOn.length?'dependencies':'eligible'}});
  const sorted=a=>a.sort((x,y)=>y.priority-x.priority||x.id.localeCompare(y.id));
  return {schema:p.schema,productionBaseline:p.productionBaseline,engineIntegration:p.engineIntegration,eligible:sorted(task.filter(t=>t.computedState==='eligible')),waiting:sorted(task.filter(t=>t.computedState==='dependencies')),blocked:sorted(task.filter(t=>t.computedState==='blocked')),done:sorted(task.filter(t=>t.computedState==='done'))};
}
function main(){
  const report=summary(JSON.parse(fs.readFileSync(planPath,'utf8')));
  if(process.argv.includes('--json')){console.log(JSON.stringify(report,null,2));return}
  if(process.argv.includes('--next')){console.log(JSON.stringify(report.eligible[0]||null,null,2));return}
  console.log('ASAHI MUSIC roadmap: READ ONLY — no jobs executed');
  console.log('Ready '+report.eligible.length+' / Waiting '+report.waiting.length+' / Blocked '+report.blocked.length+' / Done '+report.done.length);
  for(const t of report.eligible)console.log('READY '+t.id+' ['+t.priority+'] '+t.title);
  for(const t of report.waiting)console.log('WAIT '+t.id+' <- '+t.waitingOn.join(', '));
  for(const t of report.blocked)console.log('BLOCKED '+t.id+' — '+t.blockers.join('; '));
  console.log('No automatic deploy, file mutation, GPU use, or common-engine connection.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
