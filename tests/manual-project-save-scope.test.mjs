import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app-v10.3.2.html',import.meta.url),'utf8');
function section(start,end){const a=app.indexOf(start),b=app.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return app.slice(a,b)}
test('advanced export is clearly labeled as settings JSON without audio',()=>{
  assert.match(app,/💾 編集設定JSON保存/);
  assert.match(app,/📂 編集設定JSON読込/);
  assert.match(app,/歌声・伴奏・録音などの音源は含みません/);
  assert.match(app,/音源は「保存」→「編集状態を保存」/);
});
test('settings JSON serializer does not falsely claim to include track blobs',()=>{
  const s=section('function v8ProjectData(){','function saveV8ProjectFile(){');
  assert.match(s,/format:"emuzii_PROJECT"/);
  assert.doesNotMatch(s,/\btracks\s*:/);
  assert.doesNotMatch(s,/\bblob\s*:/);
  assert.match(app,/編集設定JSONを保存しました（音源は含みません）/);
});
test('local project save still persists audio blobs and does not depend on settings JSON',()=>{
  const s=section('async function persistTrackBlob(t){','function scheduleAutoSave(');
  assert.match(s,/idbPut\("blobs",\{id:blobId,blob:t\.blob\}\)/);
  assert.match(s,/async function persistProject\(id/);
  assert.match(s,/音源を含めて端末に保存しました/);
  assert.doesNotMatch(s,/v8ProjectData\(/);
});
test('broken audio backup refuses restore before changing current tracks',async()=>{
  const s=section('async function restoreProjectRecord(p,','async function saveProject(){');
  const existing=[{id:'current',name:'Live take',gain:1}];
  const state={tracks:existing};
  const restore=(new Function('idbGet','decodeBlob','state','setStatus','DB_NAME',s+';return restoreProjectRecord;'))(
    async()=>null,async()=>null,state,()=>{},'piyoko-music-v45'
  );
  const project={tracks:[{id:'bad',name:'Missing WAV',type:'vocal',blobId:'asset:not-found'}]};
  await assert.rejects(()=>restore(project),/見つかりません/);
  assert.equal(state.tracks,existing,'The existing track array must not be replaced');
  await assert.rejects(()=>restore({}),/一覧が不正/);
  assert.equal(state.tracks,existing);
});
test('failed audio decode refuses restore before editing current work',async()=>{
  const s=section('async function restoreProjectRecord(p,','async function saveProject(){');
  const existing=[{id:'current'}],state={tracks:existing};
  const restore=(new Function('idbGet','decodeBlob','state','setStatus','DB_NAME',s+';return restoreProjectRecord;'))(
    async()=>({blob:new Blob([Uint8Array.from([1,2,3])])}),async()=>null,state,()=>{},'piyoko-music-v45'
  );
  await assert.rejects(()=>restore({tracks:[{id:'bad',blobId:'asset:bad'}]}),/復号できません/);
  assert.equal(state.tracks,existing);
});
test('audio references are scoped to the current database, not legacy pointers',async()=>{
  const s=section('async function persistTrackBlob(t){','async function makeProjectRecord(id){');
  const rows=[],cache=new WeakMap();
  const persist=(new Function('idbPut','persistedBlobRefs','audioStorageGeneration',s+';return persistTrackBlob;'))(
    async(store,row)=>{rows.push({store,row})},cache,0
  );
  const current={id:'legacy-take',blob:new Blob([Uint8Array.from([1,2,3])]),_blobId:'asset:legacy-take'};
  assert.equal(await persist(current),'asset:legacy-take');
  assert.equal(rows.length,1,'old _blobId alone does not skip saving audio');
  await persist(current);
  assert.equal(rows.length,1,'unchanged audio not re-written during autosave');
});
test('deleted storage invalidates cached audio even with same blob reference',async()=>{
  const s=section('async function persistTrackBlob(t){','async function makeProjectRecord(id){');
  const rows=[],cache=new WeakMap(),blob=new Blob(['recording']);
  let generation=0;
  const make=(gen)=>(new Function('idbPut','persistedBlobRefs','audioStorageGeneration',s+';return persistTrackBlob;'))(
    async(store,row)=>rows.push(row),cache,gen
  );
  const audio={id:'take-1',blob};
  await make(generation)(audio);
  assert.equal(rows.length,1);
  generation++;
  await make(generation)(audio);
  assert.equal(rows.length,2,'deleted destination must be re-populated');
});
test('autosave is suspended after explicit delete until manual save',()=>{
  const s=section('async function persistProject(id,','async function restoreProjectRecord(p,');
  assert.match(s,/autoSaveSuspended/);
  assert.match(s,/queueProjectWrite/);
  assert.match(s,/if\(id==="last"\)/);
  assert.match(app,/audioStorageGeneration\+\+/);
  assert.match(app,/自動保存停止中/);
});
test('raw vocal count-in trim is persisted as metadata and restored safely',()=>{
  const capture=section('recorder.onstop=async()=>{','recorder.start(200);');
  assert.match(capture,/recordTrimStartSec=type==="vocal"/);
  assert.match(capture,/buffer=trimBuffer\(buffer,recordTrimStartSec\)/);
  assert.match(capture,/type,buffer,blob,recordTrimStartSec/);
  const serialized=section('async function makeProjectRecord(id){','async function persistProject(id,');
  assert.match(serialized,/recordTrimStartSec:Number\.isFinite/);
  const restore=section('async function restoreProjectRecord(p,','async function saveProject(){');
  assert.match(restore,/Number\(m\.recordTrimStartSec\?\?0\)/);
  assert.match(restore,/trimBuffer\(decoded,trim\)/);
  assert.match(restore,/トリム位置が不正です/);
});
test('deleted tracks have a session undo with project-switch guard',()=>{
  const helpers=section('function updateTrackDeleteUndo(){','function renderTracks() {');
  assert.match(helpers,/deletedTrackStack\.push\(\{track,index\}\)/);
  assert.match(helpers,/state\.tracks\.splice\(Math\.min\(last\.index,state\.tracks\.length\),0,last\.track\)/);
  assert.match(app,/id="undoTrackDelete"/);
  assert.match(app,/state\.deletedTrackStack=\[\];state\.guideWave/);
  assert.match(app,/state\.deletedTrackStack=\[\];renderTracks\(\)/);
});
test('settings JSON import does not overwrite the original audio tracks',()=>{
  const s=section('async function loadV8ProjectFromFile(file){','function ptMedian(');
  assert.doesNotMatch(s,/state\.tracks\s*=/);
  assert.match(s,/編集設定JSONを復元しました（音源は変更しません）/);
});
